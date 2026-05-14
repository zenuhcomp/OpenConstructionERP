# Issue #109 — Project File Manager — Handover

**Status:** backend complete + signed-share complete + 1/9 frontend components done
**Branch:** main (uncommitted)
**Last updated:** 2026-05-05
**Original directive (verbatim):** "делить (БД отдельно, BIM отдельно) и делай всё что нужно теперь — нужно идеальное готовое и рабочее решение без костылей"

GitHub: https://github.com/datadrivenconstruction/OpenConstructionERP/issues/109

---

## TL;DR for the next agent

The backend is **done and compiles** (`python -c "import ast; ..."` passes for all 7 files; `from app.modules.projects.router import router` resolves cleanly).

The frontend has **types + api + hooks + tauri shim + 1 of 9 components**. You need to write the remaining 8 components, the page itself, wire routing, sidebar entry, and i18n keys. Then test in a browser.

**Do not touch the backend** unless you find a bug — the schema/service/router/bundle code is consistent and tested-by-import.

---

## What's done (do NOT redo)

### Backend (✅ all syntax-checked + imports resolve)

1. **Migration** `backend/alembic/versions/v294_project_storage_override.py`
   - Adds `storage_path_override` (String 500, nullable) and `storage_uses_default` (Bool, default `1`) to `oe_projects_project`.
   - Inspector-guarded — safe to re-run.
   - **WARNING**: parallel head with `v290_dashboards_presets`. `v294` chains off `v283_costs_region_active_index`; `v290` chains off `v260c_project_fx_rates_vat` — that branch divergence existed *before* this work. Run `alembic heads` before deploy; if there are 2 heads, generate a merge migration.

2. **Models** `backend/app/modules/projects/models.py`
   - Added two `Mapped` columns on `Project`:
     ```python
     storage_path_override: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
     storage_uses_default: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="1")
     ```

3. **Schemas** `backend/app/modules/projects/file_manager_schemas.py` (NEW)
   - `FileKind` Literal, `FileRow`, `FileTreeNode` (recursive — calls `model_rebuild()`), `StorageLocations`, `FileListResponse`.
   - Bundle types: `BundleScope` (`metadata_only` / `documents` / `bim` / `dwg` / `full`), `ExportOptions`, `ExportPreview`, `BundleManifest`, `ImportMode`, `ImportPreview`, `ImportResult`, `EmailLinkResponse`.

4. **File-manager service** `backend/app/modules/projects/file_manager_service.py` (NEW)
   - Per-module collectors: `_collect_documents`, `_collect_photos`, `_collect_sheets`, `_collect_bim_models`, `_collect_dwg_drawings` — each wrapped in `try/ImportError` so disabled modules degrade gracefully.
   - `list_project_files()` aggregates with category/extension/q filters and 4 sort modes.
   - `file_tree()` builds left-pane category nodes.
   - `resolve_storage_locations()` returns absolute paths + notes (warns about `.openestimator` vs `.openestimate` typo across CLI/documents service — surfaced honestly, NOT papered over).
   - `_MIME_BY_EXT`, `_ext_of`, `_mime_of`, `_file_size`, `_file_mtime`, `_relative_path` helpers.

5. **Bundle export** `backend/app/modules/projects/bundle_export.py` (NEW, ~657 lines)
   - Constants: `BUNDLE_FORMAT="ocep"`, `BUNDLE_FORMAT_VERSION="1.0.0"`, `ENGINE_VERSION="2.9.4"`.
   - Tables grouped: `_BUNDLE_TABLES_CORE` (projects/wbs/milestones/boqs/positions/markups/assemblies/components/schedules/activities/budget_lines/cash_flows/cost_snapshots/risks/change_orders/items/tender_packages/bids), `_BUNDLE_TABLES_DOCUMENTS`, `_BUNDLE_TABLES_BIM`, `_BUNDLE_TABLES_DWG`.
   - `_options_from_scope()` translates `BundleScope` → flag toggles.
   - `_rows_for_table()` handles every FK-cascade (bim_elements via model_id, assembly_components via assembly_id, change_order_items via change_order_id, tender_bids via package_id, dwg_drawing_versions via drawing_id, document_bim_links via document_id).
   - `_collect_attachment_paths()` scans documents/photos+thumbs/sheets thumbs/BIM canonical/DWG.
   - `_sha256_of()` for attachment integrity → `attachments/index.json`.
   - `export_bundle()` returns bytes (in-memory zip); `preview_bundle()` returns `ExportPreview`; `filename_for_bundle()` produces `<slug>_<scope>_<YYYYMMDD>.ocep`.
   - Reuses `serialize_row` from `app.modules.backup.router`.

6. **Bundle import** `backend/app/modules/projects/bundle_import.py` (NEW, ~430 lines)
   - `BundleError` exception class.
   - `validate_bundle(raw) -> ImportPreview` — manifest sanity, semver compat, format-version check.
   - 3 modes: `new_project` (fresh UUIDs everywhere), `merge_into_existing` (skip existing PKs), `replace_existing` (wipe target's bundle-managed rows first).
   - `_build_uuid_map` + `_remap_row` walk values once and remap every UUID-like string.
   - `_target_path_for_attachment` decides where each `attachments/<kind>/<id>/<filename>` lands — honours documents/photos/sheets/BIM/DWG conventions exactly as `file_manager_service` audited.
   - `_rewrite_paths_for_target` rewrites absolute paths in row data (file_path, thumbnail_path, canonical_file_path) so rows point at the file we just extracted.
   - `_extract_attachments` streams files from zip → disk via `shutil.copyfileobj`.
   - `import_bundle()` flushes DB before extracting attachments; on flush failure, rolls back and raises BundleError.

7. **Router endpoints** `backend/app/modules/projects/router.py` (MODIFIED)
   - Added imports: `os`, `datetime` (UTC), `select`, FastAPI `File`/`Form`/`UploadFile`, `Response`, all bundle modules + schemas.
   - **3 file-manager endpoints**: `GET /{project_id}/files/tree/`, `GET /{project_id}/files/`, `GET /{project_id}/files/locations/`.
   - **2 export endpoints**: `POST /{project_id}/export/preview/` (returns `ExportPreview`), `POST /{project_id}/export/` (returns `application/zip` Content-Disposition attachment).
   - **2 import endpoints**: `POST /import/validate/` (returns `ImportPreview`), `POST /import/` (returns `ImportResult`; auto-assigns `owner_id` for new_project mode).
   - **2 share endpoints**: `POST /files/{file_id}/email-link/` (HMAC-signed token, configurable TTL up to 14 days), `GET /files/share/{token}` (PUBLIC — no auth, validates HMAC + expiry, streams file).
   - All file-manager and export endpoints gated through `_verify_project_owner`.

### Frontend (✅ types/api/hooks/tauri/PathBar done, type-checks clean)

```
frontend/src/features/file-manager/
├── types.ts                      ✅ DONE — wire types
├── api.ts                        ✅ DONE — fetchFileTree, fetchFileList, fetchStorageLocations,
│                                          previewExport, downloadBundle, validateImport,
│                                          commitImport, mintEmailLink
├── hooks.ts                      ✅ DONE — useFileTree, useFileList, useStorageLocations
├── lib/tauri.ts                  ✅ DONE — isTauri, openInOSFinder, copyToClipboard
└── components/
    └── PathBar.tsx               ✅ DONE — top strip with breadcrumbs + 5 root chips + notes
```

`npx tsc --noEmit` reports **zero errors** in the file-manager folder.

---

## What's left (in dependency order)

### 1. Frontend components (`frontend/src/features/file-manager/components/`)

Reference: backend types live in `types.ts`; query hooks live in `hooks.ts`; api functions live in `api.ts`. Don't add a separate state library — use React Query for server state and local `useState` for ephemeral UI state. Use `lucide-react` icons + Tailwind. Match the visual language of `frontend/src/features/documents/DocumentsPage.tsx` (already imported `useProjectContextStore`).

**1.1 `FileTree.tsx`** — left pane
- Props: `nodes: FileTreeNode[]`, `selectedId: string | null`, `onSelect(id, kind)`.
- Render `nodes` as a list of category buttons. Each shows icon (different lucide icon per kind: FileText for document, Image for photo, Layout for sheet, Box for bim_model, Pencil for dwg_drawing) + label + file_count badge + total_bytes formatted via `formatBytes` (write helper or import from `shared/lib/formatters.ts`).
- Highlight `selectedId` with `bg-slate-200 dark:bg-slate-800`.

**1.2 `FileGrid.tsx`** — right pane (default view)
- Props: `items: FileRow[]`, `selectedIds: Set<string>`, `onSelect(id, additive)`, `onOpen(row)`.
- Card per file: thumbnail (use `thumbnail_url` if present, otherwise icon based on `kind`/`extension`), name (truncated), size, modified date (relative — e.g. "2h ago").
- Cmd/Ctrl+Click → additive selection. Shift+Click → range select (defer if tricky — single + additive is enough for v1).

**1.3 `FileList.tsx`** — alternative table view
- Same data, columns: name / kind / size / modified / discipline / actions. Use a `<table>` with `border-collapse` + sticky header. Sortable by clicking column header (call back to parent to update `sort` filter).

**1.4 `FilePreviewPane.tsx`** — right rail
- Props: `row: FileRow | null`.
- Show: large thumbnail/icon, name, full physical_path (mono), size, mime_type, kind, modified_at, discipline, category, every key-value in `extra`.
- Buttons: `Download` (opens `row.download_url` in new tab), `Email link` (opens EmailDialog), `Open in OS` (calls `openInOSFinder(row.physical_path)`, only visible when `isTauri` is true).

**1.5 `FileActionsBar.tsx`** — top-right of right pane
- Filter pills (kind), search box (debounced, calls `setQ`), sort dropdown, view toggle (grid/list), Export button, Import button.
- Use `useState` for view mode; persist to `localStorage` under key `file-manager:view-mode`.

**1.6 `ExportWizard.tsx`** — modal
- Trigger: Export button.
- 2 steps: scope selection → preview → download.
- Step 1: radio buttons for `BundleScope` (metadata_only / documents / bim / dwg / full); checkboxes for fine-grained `include_*` flags.
- Step 2: call `previewExport(projectId, options)` → render `ExportPreview` (table_counts, attachment_count, estimated size formatted MB/GB). Two buttons: Back / Download.
- Step 3 (after Download): call `downloadBundle(projectId, options)`. Show toast on success / error.
- For `metadata_only` highlight "Email-friendly — fits in any inbox" hint.

**1.7 `ImportWizard.tsx`** — modal
- Trigger: Import button (in header or sidebar of file manager).
- File input → `validateImport(file)` → render `ImportPreview` (manifest details, warnings).
- User chooses `ImportMode` radio buttons. For `new_project`, show optional rename field.
- For `merge_into_existing` and `replace_existing`, show a project picker (use existing `useProjectsList` hook from somewhere — search the codebase). `replace_existing` must show a red destructive warning.
- Confirm → `commitImport({file, mode, targetProjectId, newProjectName})` → render `ImportResult` (counts, warnings) + button "Open imported project" that navigates to `/projects/<id>`.

**1.8 `EmailDialog.tsx`** — modal
- Triggered from `FilePreviewPane`'s "Email link" button.
- Inputs: TTL (1h / 24h / 72h / 7d / 14d as preset chips, default 72h).
- Action: `mintEmailLink(fileId, ttlHours)` → render `EmailLinkResponse`. Show URL with Copy button + sample email body (`mailto:?subject=…&body=…` pre-filled).

**1.9 `OpenInOSButton.tsx`** — already half-done in PathBar; can be a tiny dedicated component if reused inline in FileGrid/PreviewPane, otherwise just inline `openInOSFinder()` calls.

### 2. Page assembly: `frontend/src/features/file-manager/FileManagerPage.tsx`

```tsx
// Skeleton — adapt patterns from frontend/src/features/documents/DocumentsPage.tsx
import { useState } from 'react';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useFileList, useFileTree, useStorageLocations } from './hooks';
import { PathBar } from './components/PathBar';
// ...other components

export function FileManagerPage() {
  const projectId = useProjectContextStore((s) => s.activeProjectId);
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState({ sort: 'modified' as const });

  const { data: tree } = useFileTree(projectId);
  const { data: locations, isLoading: locLoading } = useStorageLocations(projectId);
  const { data: list, isLoading: listLoading } = useFileList(projectId,
    selectedKind ? { ...filters, category: selectedKind as any } : filters);

  // Show project picker when no projectId.
  if (!projectId) return <EmptyStateNoProject />;

  return (
    <div className="flex flex-col h-full">
      <PathBar locations={locations} isLoading={locLoading} selectedKind={selectedKind} />
      <div className="flex flex-1 min-h-0">
        <FileTree nodes={tree ?? []} selectedId={selectedKind} onSelect={setSelectedKind} />
        <div className="flex-1 flex flex-col">
          <FileActionsBar /* ... */ />
          {view === 'grid'
            ? <FileGrid items={list?.items ?? []} /* ... */ />
            : <FileList items={list?.items ?? []} /* ... */ />}
        </div>
        <FilePreviewPane row={preview} />
      </div>
    </div>
  );
}
```

### 3. Routing — `frontend/src/app/App.tsx` (or whatever the router file is)

Find existing route definitions (`<Route path="/projects/..." />`). Add:

```tsx
<Route path="/projects/:projectId/files" element={<FileManagerPage />} />
<Route path="/files" element={<FileManagerPage />} />  {/* honours active project */}
```

### 4. Sidebar entry — `frontend/src/app/layout/Sidebar.tsx`

Add a new entry:
```tsx
{ icon: <HardDrive />, label: t('nav.project_files'), to: '/files' }
```
Place it near "Documents" / "Photos" since it's the same category of work.

### 5. i18n — `frontend/src/locales/{en,ru,de}.json`

Add a `files` namespace with at least:
- `files.title`, `files.empty`, `files.search_placeholder`
- `files.category.{document,photo,sheet,bim_model,dwg_drawing,takeoff,report,markup}`
- `files.actions.{download,email,open_in_os,copy_path,export,import}`
- `files.export.{title,scope_metadata,scope_documents,scope_bim,scope_dwg,scope_full,preview,confirm}`
- `files.import.{title,select_file,validate,mode_new,mode_merge,mode_replace,confirm,destructive_warn}`
- `files.email.{title,ttl,copy_url,paste_into_email}`
- `nav.project_files`

Keep RU/DE in sync — copy-paste English first, then translate.

### 6. Tests — backend

`backend/tests/projects/test_file_manager.py`:
- `test_file_tree_returns_categories_for_seeded_project`
- `test_file_list_filters_by_category`
- `test_storage_locations_surfaces_typo_note`

`backend/tests/projects/test_bundle_round_trip.py`:
- `test_export_metadata_only_then_import_new_project_preserves_row_count`
- `test_export_full_round_trip_attachments`
- `test_validate_bundle_rejects_incompatible_format_version`
- `test_import_replace_existing_wipes_then_inserts`
- `test_share_token_signature_check`

Use `temp_sqlite_url` fixture and `httpx.AsyncClient` — don't touch the production `openestimate.db` (memory note: feedback_test_isolation.md).

### 7. Browser verification (the user always asks for this)

- `make dev` → open `http://localhost:5180/files`
- Smoke flow: upload a document via `/documents` → switch to `/files` → see it in the grid → preview pane → copy path → export `metadata_only` (downloads small zip) → import the same zip into `new_project` mode → confirm new project shows up in dashboard.
- Tauri build: confirm `Open in Finder` actually opens Explorer/Finder. If `@tauri-apps/plugin-shell` isn't installed yet, the dynamic import gracefully no-ops; you may need to add the plugin to the Rust side too — see `frontend/src-tauri/Cargo.toml`.

---

## Conventions / gotchas (from project memory)

- **No Markdown files in shipped app** — this handover lives in repo root, fine. Don't drop anything under `backend/app/` or `frontend/src/`. (memory: `feedback_no_md_files.md`)
- **No commits** until the user asks. (memory: `feedback_no_commit.md`)
- **Test isolation** — temp SQLite, never `openestimate.db`. (memory: `feedback_test_isolation.md`)
- **Module reload pollution** — tests must use `importlib.reload()` not `del sys.modules`. (memory: `feedback_module_reload_pollution.md`)
- **Versioning lockstep** — when this ships, bump backend `pyproject.toml` AND `frontend/package.json` together; build frontend AFTER bumping pkg. (memory: `feedback_version_lockstep.md`, `release_npm_build_first.md`)
- **PI is always-on** — don't disable `oe_project_intelligence`. (memory: `feedback_pi_always_on.md`)
- **No country-specific naming in default UI** — generic copy. (memory: `feedback_global_copy.md`)
- **VPS deploy** — every shipping edit gets deployed to VPS in same task; `_frontend_dist` overwrite must follow `pip install`. (memory: `vps_deploy.md`, `feedback_vps_wheel_shadowed.md`)
- **`.openestimator` vs `.openestimate`** — both real, surfaced via `notes` field; do NOT silently fix the typo in this PR, that's a separate ticket.
- **Sandbox-friendly imports in collectors** — every per-module collector wraps `from app.modules.X import Y` in `try/ImportError`. Keep that pattern when adding new collectors.

---

## Files changed in this session

```
backend/alembic/versions/v294_project_storage_override.py   NEW
backend/app/modules/projects/models.py                      MODIFIED (2 cols)
backend/app/modules/projects/router.py                      MODIFIED (imports + 9 endpoints)
backend/app/modules/projects/file_manager_schemas.py        NEW
backend/app/modules/projects/file_manager_service.py        NEW
backend/app/modules/projects/bundle_export.py               NEW
backend/app/modules/projects/bundle_import.py               NEW
frontend/src/features/file-manager/types.ts                 NEW
frontend/src/features/file-manager/api.ts                   NEW
frontend/src/features/file-manager/hooks.ts                 NEW
frontend/src/features/file-manager/lib/tauri.ts             NEW
frontend/src/features/file-manager/components/PathBar.tsx   NEW
ISSUE_109_HANDOVER.md                                       NEW (this file)
```

Other modified files in the working tree (NOT touched in this session — pre-existing):
```
backend/app/core/match_service/envelope.py
backend/app/core/match_service/ranker.py
backend/app/core/vector.py
backend/app/modules/costs/router.py
backend/app/modules/costs/vector_adapter.py
backend/app/modules/projects/schemas.py
backend/app/modules/projects/service.py
frontend/src/features/match/MatchSuggestionsPanel.tsx
frontend/src/features/match/api.ts
frontend/src/features/match/types.ts
backend/alembic/versions/v282_match_cost_database_id.py
```
Don't `git checkout` those — they're earlier in-flight work.

---

## How to resume (copy-paste prompt for next agent)

> Continue Issue #109 — project file manager. Read `ISSUE_109_HANDOVER.md` in the repo root for full context. Backend is done; frontend has types/api/hooks/PathBar but needs FileTree, FileGrid, FileList, FilePreviewPane, FileActionsBar, ExportWizard, ImportWizard, EmailDialog. Then assemble `FileManagerPage.tsx`, wire routing in `App.tsx`, add sidebar entry, add i18n keys (en/ru/de), and run a browser smoke test. Don't commit until the user approves. Don't bump the version yet.

---

## Quick verification commands

```powershell
# Backend syntax + imports
cd backend
python -c "import ast; [ast.parse(open(f, encoding='utf-8').read()) for f in [
  'app/modules/projects/models.py',
  'app/modules/projects/router.py',
  'app/modules/projects/file_manager_schemas.py',
  'app/modules/projects/file_manager_service.py',
  'app/modules/projects/bundle_export.py',
  'app/modules/projects/bundle_import.py',
  'alembic/versions/v294_project_storage_override.py',
]]; print('OK')"
python -c "from app.modules.projects.router import router; print(len(router.routes), 'routes registered')"

# Frontend type-check (folder-scoped)
cd ../frontend
npx tsc --noEmit -p tsconfig.json 2>&1 | findstr file-manager   # should print nothing

# Alembic head sanity (do BEFORE deploy — there's a pre-existing v290/v294 split)
cd ../backend
alembic heads
# If 2 heads: alembic merge -m "merge v290 and v294" <head1> <head2>
```

---

## Open questions / future polish

- **Tauri plugin-shell** — already configured in `src-tauri/capabilities/` (memory said `shell:allow-open` is granted). Confirm by reading `frontend/src-tauri/capabilities/desktop.json` before declaring "Open in Finder" works.
- **Large bundle export** — current `export_bundle()` builds the whole zip in memory. For projects with multi-GB BIM, switch to a streaming response that writes to a temp file and `FileResponse`s it. Out of scope for v1; flag in the export wizard's UI ("Don't close this tab while exporting").
- **`.openestimator` typo cleanup** — file the migration as a separate ticket; this PR only surfaces it.
- **i18n quality** — at least RU translations should be reviewed by the user (he speaks RU natively).
