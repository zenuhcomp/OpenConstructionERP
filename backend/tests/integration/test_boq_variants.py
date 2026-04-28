"""CWICR abstract-resource variant flow on BOQ positions.

Covers the production-quality variant pipeline:

* Creating a position with ``metadata.variant`` stamps an immutable
  ``variant_snapshot`` carrying the rate, currency, label, source, and
  a UTC capture timestamp.
* Creating a position with ``metadata.variant_default = 'mean'`` stamps the
  same snapshot with ``source = 'default_mean'`` so the auto-applied price
  is also frozen.
* Updating a position to switch from a default to a specific variant
  re-stamps the snapshot (new label, new rate, new source) — older
  snapshot is replaced.
* A pure metadata patch that does not alter ``variant`` /
  ``variant_default`` does NOT advance ``captured_at`` (idempotency).
* A patch that only changes an unrelated field (e.g. quantity) preserves
  the existing snapshot bit-for-bit.

Run:
    cd backend
    python -m pytest tests/integration/test_boq_variants.py -v --tb=short
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import create_app

# ── Shared fixtures (same pattern as other BOQ integration tests) ────────


@pytest_asyncio.fixture(scope="module")
async def shared_client() -> AsyncClient:
    """Module-scoped client with full app lifecycle."""
    app = create_app()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan_ctx():
        async with app.router.lifespan_context(app):
            yield

    async with lifespan_ctx():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest_asyncio.fixture(scope="module")
async def shared_auth(shared_client: AsyncClient) -> dict[str, str]:
    """Module-scoped auth: register + force-promote-to-admin + login."""
    unique = uuid.uuid4().hex[:8]
    email = f"boqvar-{unique}@test.io"
    password = f"BoqVar{unique}9!"

    reg = await shared_client.post(
        "/api/v1/users/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "BOQ Variant Tester",
            "role": "admin",
        },
    )
    assert reg.status_code == 201, f"Registration failed: {reg.text}"

    from sqlalchemy import update as sa_update

    from app.database import async_session_factory
    from app.modules.users.models import User

    async with async_session_factory() as session:
        await session.execute(sa_update(User).where(User.email == email.lower()).values(role="admin", is_active=True))
        await session.commit()

    token = ""
    for attempt in range(3):
        resp = await shared_client.post(
            "/api/v1/users/auth/login",
            json={"email": email, "password": password},
        )
        data = resp.json()
        token = data.get("access_token", "")
        if token:
            break
        if "Too many login attempts" in data.get("detail", ""):
            await asyncio.sleep(5 * (attempt + 1))
            continue
        break
    assert token, f"Login failed: {data}"
    return {"Authorization": f"Bearer {token}"}


# ── Per-module helpers ────────────────────────────────────────────────────


async def _create_project(client: AsyncClient, auth: dict[str, str]) -> str:
    resp = await client.post(
        "/api/v1/projects/",
        json={
            "name": f"VariantTest {uuid.uuid4().hex[:6]}",
            "description": "Variant integration",
            "region": "DACH",
            "classification_standard": "din276",
            "currency": "EUR",
        },
        headers=auth,
    )
    assert resp.status_code == 201, f"Create project failed: {resp.text}"
    return resp.json()["id"]


async def _create_boq(client: AsyncClient, auth: dict[str, str], project_id: str) -> str:
    resp = await client.post(
        "/api/v1/boq/boqs/",
        json={
            "project_id": project_id,
            "name": f"VariantBOQ {uuid.uuid4().hex[:6]}",
            "description": "Variant integration",
        },
        headers=auth,
    )
    assert resp.status_code == 201, f"Create BOQ failed: {resp.text}"
    return resp.json()["id"]


# ═══════════════════════════════════════════════════════════════════════════
#  Variant snapshot creation
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_with_variant_stamps_snapshot(shared_client: AsyncClient, shared_auth: dict[str, str]) -> None:
    """POST a position with metadata.variant must emit variant_snapshot."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.001",
            "description": "Concrete C30/37, ready-mix",
            "unit": "m3",
            "quantity": 12.5,
            "unit_rate": 185.00,
            "source": "cost_database",
            "metadata": {
                "currency": "EUR",
                "variant": {"label": "ready-mix delivered", "price": 185.00, "index": 0},
            },
        },
        headers=auth,
    )
    assert resp.status_code == 201, f"Create failed: {resp.text}"
    pos = resp.json()
    snap = pos["metadata"].get("variant_snapshot")
    assert snap is not None, f"variant_snapshot missing in {pos['metadata']}"
    assert snap["label"] == "ready-mix delivered"
    assert snap["rate"] == 185.00
    assert snap["currency"] == "EUR"
    assert snap["source"] == "user_pick"
    # captured_at must be a parseable ISO-8601 timestamp.
    parsed = datetime.fromisoformat(snap["captured_at"].replace("Z", "+00:00"))
    assert parsed.tzinfo is not None


@pytest.mark.asyncio
async def test_create_with_variant_default_mean_stamps_snapshot(
    shared_client: AsyncClient, shared_auth: dict[str, str]
) -> None:
    """A 'use average' apply (variant_default='mean') still freezes the rate."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.002",
            "description": "Concrete C30/37, average across 5 quotes",
            "unit": "m3",
            "quantity": 1.0,
            "unit_rate": 167.50,
            "source": "cost_database",
            "metadata": {
                "currency": "EUR",
                "variant_default": "mean",
            },
        },
        headers=auth,
    )
    assert resp.status_code == 201, f"Create failed: {resp.text}"
    pos = resp.json()
    snap = pos["metadata"].get("variant_snapshot")
    assert snap is not None
    assert snap["label"] == "average"
    assert snap["rate"] == 167.50
    assert snap["source"] == "default_mean"
    assert snap["currency"] == "EUR"


@pytest.mark.asyncio
async def test_create_without_variant_does_not_stamp_snapshot(
    shared_client: AsyncClient, shared_auth: dict[str, str]
) -> None:
    """Plain manual positions must NOT receive a variant_snapshot."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.003",
            "description": "Manual line",
            "unit": "m3",
            "quantity": 1.0,
            "unit_rate": 100.0,
            "source": "manual",
        },
        headers=auth,
    )
    assert resp.status_code == 201, f"Create failed: {resp.text}"
    assert "variant_snapshot" not in resp.json()["metadata"]


# ═══════════════════════════════════════════════════════════════════════════
#  Variant snapshot lifecycle on update
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_patch_default_to_specific_variant_restamps_snapshot(
    shared_client: AsyncClient, shared_auth: dict[str, str]
) -> None:
    """User refines a default → snapshot must update to the explicit pick."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    create_resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.004",
            "description": "Concrete C30/37, default mean",
            "unit": "m3",
            "quantity": 1.0,
            "unit_rate": 167.50,
            "source": "cost_database",
            "metadata": {"currency": "EUR", "variant_default": "mean"},
        },
        headers=auth,
    )
    assert create_resp.status_code == 201, create_resp.text
    pos_id = create_resp.json()["id"]
    initial_snap = create_resp.json()["metadata"]["variant_snapshot"]
    assert initial_snap["source"] == "default_mean"

    # User picks a specific variant — patch with new metadata + new rate.
    patch_resp = await client.patch(
        f"/api/v1/boq/positions/{pos_id}",
        json={
            "unit_rate": 195.0,
            "metadata": {
                "currency": "EUR",
                "variant": {"label": "premium ready-mix", "price": 195.0, "index": 4},
            },
        },
        headers=auth,
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    new_snap = patched["metadata"]["variant_snapshot"]
    assert new_snap["label"] == "premium ready-mix"
    assert new_snap["rate"] == 195.0
    assert new_snap["source"] == "user_pick"
    # variant_default should be gone now (we replaced metadata wholesale).
    assert "variant_default" not in patched["metadata"]
    # captured_at must be at-or-after the original (clock can be at the same
    # second on fast hardware so >= is the safe assertion).
    assert new_snap["captured_at"] >= initial_snap["captured_at"]


@pytest.mark.asyncio
async def test_quantity_only_patch_preserves_snapshot(shared_client: AsyncClient, shared_auth: dict[str, str]) -> None:
    """Editing quantity must not touch a previously-stamped variant_snapshot."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    create_resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.005",
            "description": "Concrete C30/37 — locked rate",
            "unit": "m3",
            "quantity": 1.0,
            "unit_rate": 185.0,
            "source": "cost_database",
            "metadata": {
                "currency": "EUR",
                "variant": {"label": "ready-mix delivered", "price": 185.0, "index": 0},
            },
        },
        headers=auth,
    )
    assert create_resp.status_code == 201, create_resp.text
    pos_id = create_resp.json()["id"]
    original_snap = create_resp.json()["metadata"]["variant_snapshot"]

    # Edit only the quantity — metadata + unit_rate are untouched.
    patch_resp = await client.patch(
        f"/api/v1/boq/positions/{pos_id}",
        json={"quantity": 25.0},
        headers=auth,
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["quantity"] == 25.0
    # Total must scale: 25 * 185 = 4625
    assert float(patched["total"]) == pytest.approx(4625.0)
    # Snapshot must be byte-identical (stable label, rate, captured_at, source).
    new_snap = patched["metadata"].get("variant_snapshot")
    assert new_snap == original_snap, (
        f"variant_snapshot drifted on a quantity-only edit:\n  before={original_snap}\n  after ={new_snap}"
    )


@pytest.mark.asyncio
async def test_idempotent_metadata_patch_does_not_advance_captured_at(
    shared_client: AsyncClient, shared_auth: dict[str, str]
) -> None:
    """Re-sending the same variant payload must keep captured_at stable."""
    client, auth = shared_client, shared_auth
    project_id = await _create_project(client, auth)
    boq_id = await _create_boq(client, auth, project_id)

    create_resp = await client.post(
        f"/api/v1/boq/boqs/{boq_id}/positions/",
        json={
            "boq_id": boq_id,
            "ordinal": "VAR.006",
            "description": "Concrete C30/37 — idempotent",
            "unit": "m3",
            "quantity": 1.0,
            "unit_rate": 185.0,
            "source": "cost_database",
            "metadata": {
                "currency": "EUR",
                "variant": {"label": "ready-mix delivered", "price": 185.0, "index": 0},
            },
        },
        headers=auth,
    )
    assert create_resp.status_code == 201, create_resp.text
    pos_id = create_resp.json()["id"]
    original_snap = create_resp.json()["metadata"]["variant_snapshot"]

    # No-op patch — same metadata payload.
    patch_resp = await client.patch(
        f"/api/v1/boq/positions/{pos_id}",
        json={
            "metadata": {
                "currency": "EUR",
                "variant": {"label": "ready-mix delivered", "price": 185.0, "index": 0},
            },
        },
        headers=auth,
    )
    assert patch_resp.status_code == 200, patch_resp.text
    new_snap = patch_resp.json()["metadata"]["variant_snapshot"]
    assert new_snap["captured_at"] == original_snap["captured_at"], (
        "Idempotent metadata patch advanced captured_at — snapshot is not stable."
    )
    assert new_snap == original_snap
