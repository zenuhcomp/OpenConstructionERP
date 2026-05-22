# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
"""Geo Hub business logic + FSM transitions + IDOR closures."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import event_bus
from app.modules.geo_hub.geojson_io import kml_to_geojson, validate_geojson
from app.modules.geo_hub.models import (
    GeoAnchor,
    GeoOverlay,
    GeoViewpoint,
    ImageryLayer,
    TerrainSource,
    TileGenerationJob,
    Tileset,
)
from app.modules.geo_hub.repository import (
    GeoAnchorRepository,
    GeoOverlayRepository,
    ImageryLayerRepository,
    TerrainSourceRepository,
    TileJobRepository,
    TilesetRepository,
    ViewpointRepository,
)
from app.modules.geo_hub.schemas import (
    GeoAnchorCreate,
    GeoAnchorUpdate,
    GeoJSONImportRequest,
    GeoOverlayCreate,
    GeoOverlayUpdate,
    ImageryLayerCreate,
    ImageryLayerUpdate,
    KMLImportRequest,
    TerrainSourceCreate,
    TerrainSourceUpdate,
    TileGenerateRequest,
    TilesetCreate,
    TilesetUpdate,
    ViewpointCreate,
    ViewpointUpdate,
)

logger = logging.getLogger(__name__)


# ── FSMs ────────────────────────────────────────────────────────────────


# TileGenerationJob state transitions. ``queued -> running`` is the
# only forward path that exposes ``cancelled`` as a side-exit so a
# user can abort a long-running tile build.
_JOB_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"running", "cancelled", "failed"},
    "running": {"completed", "failed", "cancelled"},
    "completed": set(),
    "failed": {"queued"},  # allow retry
    "cancelled": {"queued"},  # allow restart
}


def _validate_job_transition(current: str, target: str) -> None:
    allowed = _JOB_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Invalid TileGenerationJob transition {current!r} -> "
                f"{target!r}. Allowed: {sorted(allowed)}"
            ),
        )


# Tileset lifecycle — mirrors the job FSM in the obvious way.
_TILESET_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"generating", "obsolete"},
    "generating": {"ready", "failed", "obsolete"},
    "ready": {"obsolete", "generating"},
    "failed": {"draft", "obsolete"},
    "obsolete": set(),
}


def _validate_tileset_transition(current: str, target: str) -> None:
    allowed = _TILESET_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Invalid Tileset transition {current!r} -> {target!r}. "
                f"Allowed: {sorted(allowed)}"
            ),
        )


# ── Helpers ─────────────────────────────────────────────────────────────


def _dump(model: Any) -> dict[str, Any]:
    """``model.model_dump(exclude_unset=True)`` with ``metadata`` -> ``metadata_``."""
    if model is None:
        return {}
    data = model.model_dump(exclude_unset=True)
    if "metadata" in data:
        data["metadata_"] = data.pop("metadata")
    return data


# ── Service ─────────────────────────────────────────────────────────────


class GeoHubService:
    """Business logic + workflow orchestration."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.anchors = GeoAnchorRepository(session)
        self.tilesets = TilesetRepository(session)
        self.imagery = ImageryLayerRepository(session)
        self.terrain = TerrainSourceRepository(session)
        self.viewpoints = ViewpointRepository(session)
        self.overlays = GeoOverlayRepository(session)
        self.jobs = TileJobRepository(session)

    # ── IDOR helper ─────────────────────────────────────────────────────

    async def _verify_project_owner(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None,
        *,
        not_found_detail: str = "Not found",
    ) -> None:
        """404 (not 403) cross-tenant accesses.

        Admins bypass. Anonymous callers (no payload) raise 404 so this
        helper composes with ``RequirePermission`` without leaking.
        Resolves project -> owner_id; on mismatch we collapse the
        response to "not found" so the endpoint cannot be turned into
        a UUID-existence oracle.
        """
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail,
            )
        if payload.get("role") == "admin":
            return
        user_id = payload.get("sub") or payload.get("user_id")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail,
            )
        from app.modules.projects.repository import ProjectRepository

        project = await ProjectRepository(self.session).get_by_id(project_id)
        if project is None or str(project.owner_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail,
            )

    # ── GeoAnchor ────────────────────────────────────────────────────────

    async def create_anchor(
        self, data: GeoAnchorCreate,
        payload: dict[str, Any] | None = None,
    ) -> GeoAnchor:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        existing = await self.anchors.get_by_project(data.project_id)
        if existing is not None:
            # Idempotent: project already has an anchor — overwrite in
            # place. Mutate the ORM attributes directly so we avoid the
            # ``expire_all()`` cycle in ``update_fields`` which can
            # break lazy-load attribute access in the same request.
            existing.lat = data.lat
            existing.lon = data.lon
            existing.alt = data.alt
            existing.epsg_code = data.epsg_code
            existing.region_code = data.region_code
            existing.address = data.address
            existing.accuracy_m = data.accuracy_m
            existing.metadata_ = data.metadata
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        obj = GeoAnchor(
            project_id=data.project_id,
            lat=data.lat,
            lon=data.lon,
            alt=data.alt,
            epsg_code=data.epsg_code,
            region_code=data.region_code,
            address=data.address,
            accuracy_m=data.accuracy_m,
            metadata_=data.metadata,
        )
        obj = await self.anchors.create(obj)
        await event_bus.publish(
            "geo_hub.anchor.created",
            {
                "anchor_id": str(obj.id),
                "project_id": str(obj.project_id),
                "lat": str(obj.lat),
                "lon": str(obj.lon),
            },
            source_module="geo_hub",
        )
        return obj

    async def get_anchor(self, anchor_id: uuid.UUID) -> GeoAnchor:
        obj = await self.anchors.get_by_id(anchor_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Anchor not found")
        return obj

    async def get_anchor_for_project(
        self, project_id: uuid.UUID,
    ) -> GeoAnchor | None:
        return await self.anchors.get_by_project(project_id)

    async def update_anchor(
        self,
        anchor_id: uuid.UUID,
        data: GeoAnchorUpdate,
        payload: dict[str, Any] | None = None,
    ) -> GeoAnchor:
        obj = await self.get_anchor(anchor_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Anchor not found",
        )
        await self.anchors.update_fields(anchor_id, **_dump(data))
        return await self.get_anchor(anchor_id)

    async def delete_anchor(
        self,
        anchor_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> None:
        obj = await self.get_anchor(anchor_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Anchor not found",
        )
        await self.anchors.delete(anchor_id)

    # ── Tileset ──────────────────────────────────────────────────────────

    async def create_tileset(
        self,
        data: TilesetCreate,
        payload: dict[str, Any] | None = None,
    ) -> Tileset:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        obj = Tileset(
            project_id=data.project_id,
            source_kind=data.source_kind,
            source_id=data.source_id,
            name=data.name,
            bucket=data.bucket,
            prefix=data.prefix,
            tileset_json_uri=data.tileset_json_uri,
            bounding_volume=data.bounding_volume,
            geometric_error=data.geometric_error,
            tile_format=data.tile_format,
            tile_count=data.tile_count,
            total_bytes=data.total_bytes,
            status=data.status,
            metadata_=data.metadata,
        )
        return await self.tilesets.create(obj)

    async def get_tileset(self, tileset_id: uuid.UUID) -> Tileset:
        obj = await self.tilesets.get_by_id(tileset_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Tileset not found")
        return obj

    async def update_tileset(
        self,
        tileset_id: uuid.UUID,
        data: TilesetUpdate,
        payload: dict[str, Any] | None = None,
    ) -> Tileset:
        obj = await self.get_tileset(tileset_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Tileset not found",
        )
        if data.status is not None:
            _validate_tileset_transition(obj.status, data.status)
        await self.tilesets.update_fields(tileset_id, **_dump(data))
        return await self.get_tileset(tileset_id)

    async def list_tilesets_for_project(
        self,
        project_id: uuid.UUID,
        *,
        payload: dict[str, Any] | None = None,
        offset: int = 0,
        limit: int = 50,
        tileset_status: str | None = None,
    ) -> list[Tileset]:
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        return await self.tilesets.list_for_project(
            project_id, offset=offset, limit=limit, status=tileset_status,
        )

    async def delete_tileset(
        self,
        tileset_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> None:
        obj = await self.get_tileset(tileset_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Tileset not found",
        )
        await self.tilesets.delete(tileset_id)

    # ── TileGenerationJob ────────────────────────────────────────────────

    async def enqueue_tile_generation(
        self,
        data: TileGenerateRequest,
        payload: dict[str, Any] | None = None,
    ) -> TileGenerationJob:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        existing = await self.tilesets.find_for_source(
            data.source_kind, data.source_id,
        )
        if existing is not None and existing.status == "ready" and not data.force:
            # Idempotent: hand the user back the existing tileset by
            # creating a no-op "completed" job that points at it.
            job = TileGenerationJob(
                tileset_id=existing.id,
                project_id=data.project_id,
                source_kind=data.source_kind,
                source_id=data.source_id,
                requested_by=_extract_user_id(payload),
                state="completed",
                progress_pct=100,
                started_at=datetime.now(UTC),
                completed_at=datetime.now(UTC),
                output_uri=existing.tileset_json_uri,
                metadata_={"reused": True, "tileset_id": str(existing.id)},
            )
            return await self.jobs.create(job)

        # Spin up a queued job. The actual pipeline runs detached so
        # the request returns immediately with the job id and the
        # frontend polls ``GET /jobs/{id}`` for progress.
        job = TileGenerationJob(
            tileset_id=None,
            project_id=data.project_id,
            source_kind=data.source_kind,
            source_id=data.source_id,
            requested_by=_extract_user_id(payload),
            state="queued",
            progress_pct=0,
            metadata_={"force": data.force},
        )
        job = await self.jobs.create(job)
        await event_bus.publish(
            "geo_hub.tile_job.queued",
            {
                "job_id": str(job.id),
                "project_id": str(job.project_id),
                "source_kind": job.source_kind,
                "source_id": str(job.source_id),
            },
            source_module="geo_hub",
        )
        return job

    async def cancel_tile_job(
        self,
        job_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> TileGenerationJob:
        job = await self.jobs.get_by_id(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        await self._verify_project_owner(
            job.project_id, payload, not_found_detail="Job not found",
        )
        _validate_job_transition(job.state, "cancelled")
        await self.jobs.update_fields(
            job_id,
            state="cancelled",
            completed_at=datetime.now(UTC),
        )
        return await self.jobs.get_by_id(job_id)

    async def get_job(self, job_id: uuid.UUID) -> TileGenerationJob:
        obj = await self.jobs.get_by_id(job_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return obj

    async def list_jobs_for_project(
        self,
        project_id: uuid.UUID,
        *,
        payload: dict[str, Any] | None = None,
        state: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[TileGenerationJob]:
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        return await self.jobs.list_for_project(
            project_id, state=state, offset=offset, limit=limit,
        )

    # ── ImageryLayer ─────────────────────────────────────────────────────

    async def create_imagery_layer(
        self,
        data: ImageryLayerCreate,
        payload: dict[str, Any] | None = None,
    ) -> ImageryLayer:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        if data.default_for_project:
            await self.imagery.clear_default_for_project(data.project_id)
        obj = ImageryLayer(
            project_id=data.project_id,
            name=data.name,
            provider=data.provider,
            url_template=data.url_template,
            attribution=data.attribution,
            requires_api_key=data.requires_api_key,
            default_for_project=data.default_for_project,
            is_visible=data.is_visible,
            metadata_=data.metadata,
        )
        return await self.imagery.create(obj)

    async def get_imagery_layer(self, layer_id: uuid.UUID) -> ImageryLayer:
        obj = await self.imagery.get_by_id(layer_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Imagery layer not found")
        return obj

    async def update_imagery_layer(
        self,
        layer_id: uuid.UUID,
        data: ImageryLayerUpdate,
        payload: dict[str, Any] | None = None,
    ) -> ImageryLayer:
        obj = await self.get_imagery_layer(layer_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Imagery layer not found",
        )
        if data.default_for_project is True:
            await self.imagery.clear_default_for_project(obj.project_id)
        await self.imagery.update_fields(layer_id, **_dump(data))
        return await self.get_imagery_layer(layer_id)

    async def list_imagery_for_project(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> list[ImageryLayer]:
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        return await self.imagery.list_for_project(project_id)

    async def delete_imagery_layer(
        self,
        layer_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> None:
        obj = await self.get_imagery_layer(layer_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Imagery layer not found",
        )
        await self.imagery.delete(layer_id)

    # ── TerrainSource (system-wide) ──────────────────────────────────────

    async def create_terrain_source(
        self, data: TerrainSourceCreate,
    ) -> TerrainSource:
        if data.is_default:
            await self.terrain.clear_default()
        obj = TerrainSource(
            name=data.name,
            provider=data.provider,
            endpoint=data.endpoint,
            ion_token=data.ion_token,
            is_default=data.is_default,
            metadata_=data.metadata,
        )
        return await self.terrain.create(obj)

    async def get_terrain_source(self, src_id: uuid.UUID) -> TerrainSource:
        obj = await self.terrain.get_by_id(src_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Terrain source not found")
        return obj

    async def update_terrain_source(
        self, src_id: uuid.UUID, data: TerrainSourceUpdate,
    ) -> TerrainSource:
        obj = await self.get_terrain_source(src_id)
        if data.is_default is True:
            await self.terrain.clear_default()
        await self.terrain.update_fields(src_id, **_dump(data))
        return await self.get_terrain_source(src_id)

    async def list_terrain_sources(self) -> list[TerrainSource]:
        return await self.terrain.list_all()

    async def delete_terrain_source(self, src_id: uuid.UUID) -> None:
        await self.get_terrain_source(src_id)
        await self.terrain.delete(src_id)

    # ── Viewpoint ────────────────────────────────────────────────────────

    async def save_viewpoint(
        self,
        data: ViewpointCreate,
        payload: dict[str, Any] | None = None,
    ) -> GeoViewpoint:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        obj = GeoViewpoint(
            project_id=data.project_id,
            name=data.name,
            description=data.description,
            camera_lat=data.camera_lat,
            camera_lon=data.camera_lon,
            camera_alt=data.camera_alt,
            heading=data.heading,
            pitch=data.pitch,
            roll=data.roll,
            created_by=_extract_user_id(payload),
            metadata_=data.metadata,
        )
        return await self.viewpoints.create(obj)

    async def get_viewpoint(self, vp_id: uuid.UUID) -> GeoViewpoint:
        obj = await self.viewpoints.get_by_id(vp_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Viewpoint not found")
        return obj

    async def update_viewpoint(
        self,
        vp_id: uuid.UUID,
        data: ViewpointUpdate,
        payload: dict[str, Any] | None = None,
    ) -> GeoViewpoint:
        obj = await self.get_viewpoint(vp_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Viewpoint not found",
        )
        await self.viewpoints.update_fields(vp_id, **_dump(data))
        return await self.get_viewpoint(vp_id)

    async def list_viewpoints(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> list[GeoViewpoint]:
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        return await self.viewpoints.list_for_project(project_id)

    async def delete_viewpoint(
        self,
        vp_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> None:
        obj = await self.get_viewpoint(vp_id)
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Viewpoint not found",
        )
        await self.viewpoints.delete(vp_id)

    # ── Overlay + GeoJSON / KML I/O ─────────────────────────────────────

    async def create_overlay(
        self,
        data: GeoOverlayCreate,
        payload: dict[str, Any] | None = None,
    ) -> GeoOverlay:
        await self._verify_project_owner(
            data.project_id, payload, not_found_detail="Project not found",
        )
        if data.geojson:
            try:
                data_geojson = validate_geojson(data.geojson)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        else:
            data_geojson = {"type": "FeatureCollection", "features": []}
        obj = GeoOverlay(
            project_id=data.project_id,
            name=data.name,
            kind=data.kind,
            geojson=data_geojson,
            source_file=data.source_file,
            style=data.style,
            is_visible=data.is_visible,
            metadata_=data.metadata,
        )
        return await self.overlays.create(obj)

    async def update_overlay(
        self,
        overlay_id: uuid.UUID,
        data: GeoOverlayUpdate,
        payload: dict[str, Any] | None = None,
    ) -> GeoOverlay:
        obj = await self.overlays.get_by_id(overlay_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Overlay not found")
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Overlay not found",
        )
        if data.geojson is not None:
            try:
                validate_geojson(data.geojson)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        await self.overlays.update_fields(overlay_id, **_dump(data))
        return await self.overlays.get_by_id(overlay_id)

    async def import_geojson(
        self,
        req: GeoJSONImportRequest,
        payload: dict[str, Any] | None = None,
    ) -> GeoOverlay:
        await self._verify_project_owner(
            req.project_id, payload, not_found_detail="Project not found",
        )
        try:
            geojson = validate_geojson(req.geojson)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        obj = GeoOverlay(
            project_id=req.project_id,
            name=req.name or "Imported GeoJSON",
            kind=req.kind,
            geojson=geojson,
            style=req.style,
            is_visible=True,
            metadata_={
                "imported_from": "geojson",
                "feature_count": len(geojson.get("features", [])),
            },
        )
        return await self.overlays.create(obj)

    async def import_kml(
        self,
        req: KMLImportRequest,
        payload: dict[str, Any] | None = None,
    ) -> GeoOverlay:
        await self._verify_project_owner(
            req.project_id, payload, not_found_detail="Project not found",
        )
        try:
            geojson = kml_to_geojson(req.kml.encode("utf-8"))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        obj = GeoOverlay(
            project_id=req.project_id,
            name=req.name or "Imported KML",
            kind=req.kind,
            geojson=geojson,
            style=req.style,
            is_visible=True,
            metadata_={
                "imported_from": "kml",
                "feature_count": len(geojson.get("features", [])),
            },
        )
        return await self.overlays.create(obj)

    async def list_overlays(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
        *,
        kind: str | None = None,
    ) -> list[GeoOverlay]:
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        return await self.overlays.list_for_project(project_id, kind=kind)

    async def export_geojson(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
        *,
        kind: str | None = None,
    ) -> dict[str, Any]:
        """Merge every overlay for the project into one FeatureCollection."""
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        overlays = await self.overlays.list_for_project(
            project_id, kind=kind, limit=1000,
        )
        merged_features: list[dict[str, Any]] = []
        for ov in overlays:
            data = ov.geojson or {}
            for feat in data.get("features") or []:
                merged_features.append(feat)
        return {"type": "FeatureCollection", "features": merged_features}

    async def delete_overlay(
        self,
        overlay_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> None:
        obj = await self.overlays.get_by_id(overlay_id)
        if obj is None:
            raise HTTPException(status_code=404, detail="Overlay not found")
        await self._verify_project_owner(
            obj.project_id, payload, not_found_detail="Overlay not found",
        )
        await self.overlays.delete(overlay_id)

    # ── Map-config one-shot bundle ──────────────────────────────────────

    async def map_config(
        self,
        project_id: uuid.UUID,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Single round-trip bundle for the Cesium viewer boot path."""
        await self._verify_project_owner(
            project_id, payload, not_found_detail="Project not found",
        )
        anchor = await self.anchors.get_by_project(project_id)
        imagery = await self.imagery.list_for_project(project_id)
        terrain = await self.terrain.get_default()
        tilesets = await self.tilesets.list_for_project(
            project_id, limit=50,
        )
        overlays = await self.overlays.list_for_project(
            project_id, limit=200,
        )
        viewpoints = await self.viewpoints.list_for_project(project_id)
        active_jobs = await self.jobs.list_active_for_project(project_id)
        return {
            "project_id": project_id,
            "anchor": anchor,
            "imagery_layers": imagery,
            "terrain_source": terrain,
            "tilesets": tilesets,
            "overlays": overlays,
            "viewpoints": viewpoints,
            "active_jobs": active_jobs,
        }


def _extract_user_id(
    payload: dict[str, Any] | None,
) -> uuid.UUID | None:
    if payload is None:
        return None
    value = payload.get("sub") or payload.get("user_id")
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


__all__ = ["GeoHubService"]
