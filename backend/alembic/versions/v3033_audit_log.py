# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
# Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
"""System-wide activity log table + data backfill for FSM-managed entities.

Adds ``oe_activity_log`` — an append-only audit row store keyed on
``(entity_type, entity_id)`` with ``from_status`` / ``to_status`` columns
so dispute timelines (FIDIC, ISO 9001, SCL Protocol) can be reproduced.

The migration also performs two data-cleanup passes so existing rows are
valid against the new FSM registry (:mod:`app.core.fsm.registry`):

* **Legacy status remap** — historical statuses that don't appear in the
  declarative FSMs are rewritten to their nearest current node so the
  next service-layer ``apply()`` call doesn't 409 on every row.

  * Invoice  ``pending`` / ``approved``  →  ``sent``
  * Invoice  ``paid``                    →  ``paid`` (unchanged)
  * RFQ      ``issued``                  →  ``published``
  * NCR      ``identified``              →  ``open``
  * NCR      ``under_review``            →  ``in_review``
  * NCR      ``corrective_action``       →  ``in_review``
  * NCR      ``verification``            →  ``resolved``
  * NCR      ``void``                    →  ``rejected``
  * Submittal ``draft``                  →  ``open``
  * Submittal ``submitted``              →  ``under_review``
  * Submittal ``revise_and_resubmit``    →  ``revise_resubmit``

  Anything that doesn't match a known legacy value is left alone — the
  FSM tolerates unknown ``current`` nodes by simply having zero
  allowed transitions, and the row stays auditable.

* **Synthetic import audit row** — one ``ActivityLog`` row per existing
  entity so the audit history is contiguous from day one. Action is
  ``imported``; ``from_status`` is NULL, ``to_status`` matches the
  current status; reason is ``"v3033 import — pre-FSM baseline"``.

  The backfill is idempotent: re-running the migration is a no-op
  because it checks for an existing ``imported`` row per entity_id
  before inserting a new one.

Revision ID: v3033_audit_log
Revises: v3032_wave_merge
Created: 2026-05-13
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "v3033_audit_log"
down_revision: Union[str, Sequence[str], None] = "v3032_wave_merge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Helpers ──────────────────────────────────────────────────────────────


def _has_table(inspector: sa.engine.reflection.Inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(
    inspector: sa.engine.reflection.Inspector, table: str, column: str,
) -> bool:
    if not _has_table(inspector, table):
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


# ── Legacy status remap tables (data migration) ──────────────────────────

# (table, status_column, {old_value: new_value})
_LEGACY_REMAPS: list[tuple[str, str, dict[str, str]]] = [
    (
        "oe_finance_invoice",
        "status",
        {"pending": "sent", "approved": "sent"},
    ),
    (
        "oe_rfq_rfq",
        "status",
        {"issued": "published"},
    ),
    (
        "oe_ncr_ncr",
        "status",
        {
            "identified": "open",
            "under_review": "in_review",
            "corrective_action": "in_review",
            "verification": "resolved",
            "void": "rejected",
        },
    ),
    (
        "oe_submittals_submittal",
        "status",
        {
            "draft": "open",
            "submitted": "under_review",
            "revise_and_resubmit": "revise_resubmit",
        },
    ),
]


# Entity tables to seed with a synthetic "imported" audit row so the
# activity log is contiguous from v3033 onwards.
_BACKFILL_ENTITIES: list[tuple[str, str]] = [
    # (entity_type, table_name)
    ("boq", "oe_boq_boq"),
    ("project", "oe_projects_project"),
    ("invoice", "oe_finance_invoice"),
    ("ncr", "oe_ncr_ncr"),
    ("rfq", "oe_rfq_rfq"),
    ("submittal", "oe_submittals_submittal"),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ── 1. Create the oe_activity_log table ───────────────────────────
    if not _has_table(inspector, "oe_activity_log"):
        op.create_table(
            "oe_activity_log",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("tenant_id", sa.String(length=36), nullable=True),
            sa.Column("actor_id", sa.String(length=36), nullable=True),
            sa.Column("entity_type", sa.String(length=64), nullable=False),
            sa.Column("entity_id", sa.String(length=64), nullable=True),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("from_status", sa.String(length=64), nullable=True),
            sa.Column("to_status", sa.String(length=64), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column(
                "metadata",
                sa.JSON(),
                nullable=False,
                server_default="{}",
            ),
        )
        op.create_index(
            "ix_activity_log_entity",
            "oe_activity_log",
            ["entity_type", "entity_id"],
        )
        op.create_index(
            "ix_activity_log_tenant_created",
            "oe_activity_log",
            ["tenant_id", "created_at"],
        )
        op.create_index(
            "ix_activity_log_actor",
            "oe_activity_log",
            ["actor_id"],
        )
        op.create_index(
            "ix_oe_activity_log_action",
            "oe_activity_log",
            ["action"],
        )

    # Re-inspect after create_table so subsequent guards see the new table.
    inspector = sa.inspect(bind)

    # ── 2. Legacy status remaps ───────────────────────────────────────
    for table, column, mapping in _LEGACY_REMAPS:
        if not _has_column(inspector, table, column):
            continue
        for old_value, new_value in mapping.items():
            op.execute(
                sa.text(
                    f"UPDATE {table} SET {column} = :new WHERE {column} = :old",
                ).bindparams(new=new_value, old=old_value)
            )

    # ── 3. Synthetic "imported" audit rows ────────────────────────────
    # Idempotent: skip entities that already have an "imported" row in
    # the activity log.
    if not _has_table(inspector, "oe_activity_log"):
        # Table create failed somehow — skip backfill.
        return

    for entity_type, table in _BACKFILL_ENTITIES:
        if not _has_table(inspector, table):
            continue
        if not _has_column(inspector, table, "status"):
            continue
        # Bulk insert via SELECT … NOT EXISTS so re-runs are no-ops.
        # We use NEWID()-style UUIDs by binding via Python so this works
        # the same way on SQLite + Postgres.
        rows = bind.execute(
            sa.text(f"SELECT id, status FROM {table}")
        ).fetchall()
        now = datetime.now(UTC)
        empty_meta = json.dumps({"source": "v3033_audit_log_backfill"})
        for row in rows:
            ent_id = str(row[0])
            cur_status = row[1]
            # Check for existing "imported" row — idempotency guard.
            existing = bind.execute(
                sa.text(
                    "SELECT id FROM oe_activity_log "
                    "WHERE entity_type = :et "
                    "AND entity_id = :eid "
                    "AND action = 'imported' LIMIT 1"
                ).bindparams(et=entity_type, eid=ent_id)
            ).fetchone()
            if existing:
                continue
            bind.execute(
                sa.text(
                    "INSERT INTO oe_activity_log "
                    "(id, created_at, updated_at, tenant_id, actor_id, "
                    "entity_type, entity_id, action, from_status, "
                    "to_status, reason, metadata) "
                    "VALUES (:id, :ts, :ts, NULL, NULL, :et, :eid, "
                    "'imported', NULL, :status, "
                    "'v3033 import — pre-FSM baseline', :meta)"
                ).bindparams(
                    id=str(uuid.uuid4()),
                    ts=now,
                    et=entity_type,
                    eid=ent_id,
                    status=cur_status,
                    meta=empty_meta,
                )
            )


def downgrade() -> None:
    """Drop ``oe_activity_log`` and reverse-map legacy statuses.

    Status remaps are NOT reversed automatically because the legacy values
    are no longer valid FSM nodes; if a caller really needs to revert,
    they can run a custom data fix. We only drop the audit table.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "oe_activity_log"):
        for idx in (
            "ix_activity_log_entity",
            "ix_activity_log_tenant_created",
            "ix_activity_log_actor",
            "ix_oe_activity_log_action",
        ):
            try:
                op.drop_index(idx, table_name="oe_activity_log")
            except Exception:  # noqa: BLE001 — idempotent drop
                pass
        op.drop_table("oe_activity_log")
