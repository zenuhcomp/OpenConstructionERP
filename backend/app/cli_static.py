"""‌⁠‍Serve frontend static files from the installed package or dev build.

When running via `openestimate serve` or with SERVE_FRONTEND=true,
the FastAPI app serves the pre-built React frontend directly — no Nginx needed.

Frontend is found in two locations (checked in order):
1. app/_frontend_dist/ — bundled inside the Python wheel (pip install)
2. ../frontend/dist/   — development mode (repo checkout)
"""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import FileResponse, Response

logger = logging.getLogger(__name__)


_INDEX_HTML_CACHE: str | None = None


def get_frontend_dir() -> Path:
    """‌⁠‍Find the bundled frontend dist directory.

    Returns:
        Path to the directory containing index.html and assets/.

    Raises:
        FileNotFoundError: If no frontend build is found.
    """
    # Option 1: installed as package (pip install openestimate)
    pkg_dir = Path(__file__).parent / "_frontend_dist"
    if pkg_dir.is_dir() and (pkg_dir / "index.html").exists():
        return pkg_dir

    # Option 2: development — frontend/dist relative to repo root
    repo_root = Path(__file__).resolve().parent.parent.parent  # backend/app/../../
    dev_dist = repo_root / "frontend" / "dist"
    if dev_dist.is_dir() and (dev_dist / "index.html").exists():
        return dev_dist

    raise FileNotFoundError(
        "Frontend dist not found. Run 'npm run build' in frontend/ or install the openestimate wheel."
    )


def mount_frontend(app: FastAPI) -> None:
    """‌⁠‍Mount frontend static files on the FastAPI app.

    Serves:
    - /assets/* — hashed JS/CSS bundles (long cache)
    - /favicon.svg, /logo.svg — static resources
    - /* (catch-all via 404 handler) — index.html for SPA routing

    Strategy: instead of a ``/{path:path}`` catch-all route (which competes
    with FastAPI's built-in ``/api/docs``, ``/api/redoc``, and
    ``/api/openapi.json``), we override the **404 exception handler**.
    This guarantees that all real API routes — including Swagger UI — are
    resolved first by FastAPI's normal router.  Only genuinely unmatched
    paths fall through to the 404 handler, which serves ``index.html``
    for non-API paths (SPA client-side routing).
    """
    try:
        frontend_dir = get_frontend_dir()
    except FileNotFoundError:
        logger.warning("Frontend dist not found — serving API only")
        return

    logger.info("Serving frontend from %s", frontend_dir)

    # Serve hashed assets (JS, CSS) with year-long immutable caching.
    # Vite emits content-hash suffixes (e.g. index-9MyhyuSS.js) so the
    # URL changes whenever the file changes — repeat visits can serve
    # straight from the browser cache without revalidation.
    class _ImmutableStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):  # noqa: ANN001, ANN202
            response = await super().get_response(path, scope)
            if response.status_code == 200:
                from app.config import get_app_name
                app_name = get_app_name()

                if app_name != "OpenConstructionERP":
                    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                    response.headers["Pragma"] = "no-cache"
                    response.headers["Expires"] = "0"
                else:
                    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"

                # Dynamic brand replacement for javascript files
                if path.endswith(".js") and isinstance(response, FileResponse):
                    try:
                        content_bytes = Path(response.path).read_bytes()
                        content = content_bytes.decode("utf-8", errors="replace")

                        # Replace brand names but preserve email addresses
                        # (negative lookbehind for '@' keeps demo@openconstructionerp.com intact)
                        import re
                        content = re.sub(r'(?<!@)OpenConstructionERP\.com', app_name, content)
                        content = re.sub(r'(?<!@)OpenConstructionERP', app_name, content)
                        content = re.sub(r'(?<!@)openconstructionerp\.com', app_name, content)
                        content = re.sub(r'(?<!@)openconstructionerp', app_name, content)

                        # Replace email domains dynamically
                        from app.config import get_demo_email_domain
                        demo_domain = get_demo_email_domain()
                        content = content.replace("@openconstructionerp.com", f"@{demo_domain}")

                        # Replace compiled React JSX LogoWithText span elements
                        import json
                        escaped_app_name = json.dumps(app_name)
                        pattern = r'children:\s*\[\s*\"Open\"\s*,\s*\w+\.jsx\(\"span\",\s*\{\s*className:\s*\"text-oe-blue[^\\\"]*\"\s*,\s*children:\s*\"Construction\"\s*\}\)\s*(?:,\s*(?:\w+&&)?\w+\.jsx\(\"span\",\s*\{\s*className:\s*\"[^\\\"]*\"\s*,\s*children:\s*\"ERP\"\s*\}\))?\s*\]'
                        content = re.sub(pattern, f'children:[{escaped_app_name}]', content)

                        # Dynamic slogan replacement
                        from app.config import get_app_slogan
                        app_slogan = get_app_slogan()
                        if app_slogan:
                            slogan_clean = " ".join(app_slogan.split())
                            match = re.match(
                                r"^The\s+#1\s+(.*?)\s+construction\s+project\s+management$",
                                slogan_clean,
                                re.IGNORECASE
                            )
                            if match:
                                middle = match.group(1).strip()
                                # Replace localized key
                                content = content.replace(
                                    '"login.hero_h_b":"open-source workspace for"',
                                    f'"login.hero_h_b":{json.dumps(middle)}'
                                )
                                # Replace defaultValue fallback
                                content = content.replace(
                                    'defaultValue:"open-source workspace for"',
                                    f'defaultValue:{json.dumps(middle)}'
                                )
                            else:
                                # Custom slogan overrides the entire standard JSX slogan block
                                slogan_jsx_pattern = r'children:\s*\[\s*\w+\(\"login\.hero_h_a\",\s*\{\s*defaultValue:\s*\"The\"\s*\}\),\s*\" \",\s*\w+\.jsx\(\"span\",\s*\{\s*className:\s*\"[^\"]*\",\s*children:\s*\"#1\"\s*\}\),\s*\" \",\s*\w+\(\"login\.hero_h_b\",\s*\{\s*defaultValue:\s*\"open-source workspace for\"\s*\}\),\s*\" \",\s*\w+\.jsx\(\"span\",\s*\{\s*className:\s*\"[^\"]*\",\s*children:\s*\w+\(\"login\.hero_h_c\",\s*\{\s*defaultValue:\s*\"construction project management\"\s*\}\)\s*\}\)\s*\]'
                                content = re.sub(slogan_jsx_pattern, f'children:[{json.dumps(slogan_clean)}]', content)

                            # General plain text slogan replacements
                            content = content.replace(
                                "The #1 open-source workspace for construction project management",
                                slogan_clean
                            )
                            content = content.replace(
                                "open-source workspace for construction project management",
                                slogan_clean
                            )

                        from starlette.responses import Response as StarletteResponse
                        # Strip Content-Length from the original headers —
                        # the replacement changed the byte count, so the old
                        # value is wrong and Uvicorn raises
                        # "Response content shorter than Content-Length".
                        # Starlette auto-calculates it from the actual body.
                        new_headers = {
                            k: v
                            for k, v in response.headers.items()
                            if k.lower() != "content-length"
                        }
                        new_content = content.encode("utf-8")
                        new_headers["content-length"] = str(len(new_content))
                        return StarletteResponse(
                            content=new_content,
                            status_code=200,
                            media_type="application/javascript",
                            headers=new_headers
                        )
                    except Exception as e:
                        logger.error("Failed to customize static asset %s: %s", path, e)
            return response

    assets_dir = frontend_dir / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            _ImmutableStaticFiles(directory=str(assets_dir)),
            name="frontend-assets",
        )

    # Serve individual static files at the root (favicon, logo, etc.)
    index_path = frontend_dir / "index.html"

    for static_name in ("favicon.svg", "logo.svg"):
        static_path = frontend_dir / static_name
        if static_path.exists():
            # Use a factory to capture the correct path in the closure
            def _make_static_handler(fpath: Path):  # noqa: ANN202
                async def _handler():  # noqa: ANN202
                    return FileResponse(str(fpath))

                return _handler

            app.get(f"/{static_name}", include_in_schema=False)(_make_static_handler(static_path))

    # ── PWA service worker override for custom brands ────────────────────
    # The original sw.js precaches all JS/CSS assets with a CacheFirst
    # strategy.  Once populated, the browser NEVER asks the server for
    # those files again — our brand-replacement middleware is bypassed.
    # When the app name is customized we serve a lightweight "nuke" SW
    # that clears every workbox precache and then unregisters itself,
    # so all subsequent requests go through the network and hit our
    # replacement logic.  For the default brand the original sw.js is
    # served unchanged.
    from app.config import get_app_name as _get_app_name_for_sw

    _custom_brand_active = _get_app_name_for_sw() != "OpenConstructionERP"

    if _custom_brand_active:
        _NUKE_SW_JS = (
            "// Brand-customised: clear precache and unregister.\n"
            "self.addEventListener('install', e => { self.skipWaiting(); });\n"
            "self.addEventListener('activate', e => {\n"
            "  e.waitUntil(\n"
            "    caches.keys().then(names =>\n"
            "      Promise.all(names.map(n => caches.delete(n)))\n"
            "    ).then(() => self.clients.matchAll()).then(clients => {\n"
            "      clients.forEach(c => c.navigate(c.url));\n"
            "      return self.registration.unregister();\n"
            "    })\n"
            "  );\n"
            "});\n"
        )

        @app.get("/sw.js", include_in_schema=False)
        async def _nuke_sw() -> Response:
            return Response(
                content=_NUKE_SW_JS,
                media_type="application/javascript",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Service-Worker-Allowed": "/",
                },
            )

        @app.get("/registerSW.js", include_in_schema=False)
        async def _noop_register_sw() -> Response:
            return Response(
                content="// SW registration disabled for custom brand\n",
                media_type="application/javascript",
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )

        # Serve manifest.webmanifest with customized app name
        manifest_path = frontend_dir / "manifest.webmanifest"
        if manifest_path.exists():
            import json as _json

            @app.get("/manifest.webmanifest", include_in_schema=False)
            async def _custom_manifest() -> Response:
                try:
                    data = _json.loads(manifest_path.read_text(encoding="utf-8"))
                    brand = _get_app_name_for_sw()
                    data["name"] = brand
                    data["short_name"] = brand
                    return Response(
                        content=_json.dumps(data),
                        media_type="application/manifest+json",
                        headers={"Cache-Control": "no-cache"},
                    )
                except Exception:
                    return FileResponse(str(manifest_path))

    # Serve other root-level static files (e.g. manifest.json, robots.txt)
    # that may exist in the frontend dist directory.
    _root_static_extensions = {
        ".ico",
        ".png",
        ".svg",
        ".webmanifest",
        ".json",
        ".txt",
        ".xml",
        ".webp",
        ".avif",
        ".jpg",
        ".jpeg",
        ".gif",
        ".woff",
        ".woff2",
        ".csv",
        ".tsv",
        ".xlsx",
        ".xls",
    }

    # ── Conventional API path aliases ────────────────────────────────────
    # k8s liveness/readiness probes, openapi-typescript generators, third-
    # party Swagger UIs — all of these expect ``/health`` and
    # ``/openapi.json`` at the root, not under ``/api``.  Without these
    # redirects the SPA fallback below catches them and returns ``index.html``
    # with HTTP 200, which makes a sick service look healthy to a probe
    # (BUG-002).  Permanent (308) so caching layers and clients pin the
    # canonical path going forward.
    from fastapi.responses import RedirectResponse

    @app.get("/health", include_in_schema=False)
    async def _health_alias() -> Response:
        return RedirectResponse(url="/api/health", status_code=308)

    @app.get("/openapi.json", include_in_schema=False)
    async def _openapi_alias() -> Response:
        return RedirectResponse(url="/api/openapi.json", status_code=308)

    # ── SPA fallback via custom 404 handler ─────────────────────────────
    # Keep a reference to whatever 404 handler was already registered
    # (e.g. FastAPI's default) so we can delegate API 404s to it.
    from fastapi.exception_handlers import http_exception_handler
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from starlette.responses import HTMLResponse
    import os
    import re



    def _get_customized_index_html(ipath: Path) -> str:
        global _INDEX_HTML_CACHE
        if _INDEX_HTML_CACHE is None:
            try:
                content = ipath.read_text(encoding="utf-8")
                from app.config import get_app_name, get_demo_email_domain
                app_name = get_app_name()
                demo_domain = get_demo_email_domain()

                # Replace occurrences of OpenConstructionERP
                # (negative lookbehind for '@' keeps email addresses intact)
                content = re.sub(r'(?<!@)OpenConstructionERP\.com', app_name, content)
                content = re.sub(r'(?<!@)OpenConstructionERP', app_name, content)
                content = re.sub(r'(?<!@)openconstructionerp\.com', app_name, content)
                content = re.sub(r'(?<!@)openconstructionerp', app_name, content)

                # Replace email domains dynamically
                content = content.replace("@openconstructionerp.com", f"@{demo_domain}")

                # Replace title tag
                content = re.sub(r"<title>.*?</title>", f"<title>{app_name}</title>", content, flags=re.IGNORECASE)

                # Dynamic slogan replacement
                from app.config import get_app_slogan
                app_slogan = get_app_slogan()
                if app_slogan:
                    slogan_clean = " ".join(app_slogan.split())
                    content = content.replace(
                        "The #1 open-source workspace for construction project management",
                        slogan_clean
                    )
                    content = content.replace(
                        "the #1 free open-source construction cost estimation platform",
                        slogan_clean
                    )
                    content = content.replace(
                        "Free open-source construction cost estimation platform",
                        slogan_clean
                    )
                    script = f'<script>window.VITE_APP_NAME = {repr(app_name)}; window.APP_SLOGAN = {repr(slogan_clean)};</script>'
                else:
                    script = f'<script>window.VITE_APP_NAME = {repr(app_name)};</script>'

                content = re.sub(r"<head>", f"<head>{script}", content, count=1, flags=re.IGNORECASE)
                _INDEX_HTML_CACHE = content
            except Exception as e:
                logger.error("Failed to customize index.html: %s", e)
                return ipath.read_text(encoding="utf-8")
        return _INDEX_HTML_CACHE

    @app.exception_handler(404)
    async def _spa_or_404(request: Request, exc: StarletteHTTPException) -> Response:
        """Serve index.html for frontend routes; real 404 for API paths.

        This replaces the previous ``/{path:path}`` catch-all route which
        could shadow FastAPI's built-in ``/api/docs`` and ``/api/redoc``.
        """
        path = request.url.path

        # API paths: return the normal JSON 404 response.
        if path.startswith("/api"):
            return await http_exception_handler(request, exc)

        # Check if the requested file physically exists in the frontend
        # dist (e.g. /robots.txt, /manifest.json).  Serve it directly
        # if it does, to avoid breaking non-HTML static assets.
        relative = path.lstrip("/")
        if relative:
            candidate = frontend_dir / relative
            if candidate.is_file() and candidate.suffix in _root_static_extensions:
                return FileResponse(str(candidate))

        # Everything else: SPA client-side routing → index.html. Force
        # the browser to revalidate the entry on every reload — a stale
        # cached index.html points at hashed asset URLs that may have
        # been deleted by a redeploy.
        custom_html = _get_customized_index_html(index_path)
        return HTMLResponse(
            content=custom_html,
            status_code=200,
            headers={"Cache-Control": "no-cache"},
        )
