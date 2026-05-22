# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
"""‌⁠‍Property Development event registry.

Documents events PUBLISHED by the property_dev module + wires
cross-module SUBSCRIBERS that mutate property_dev state in response to
events fired by other modules (``schedule``, ``correspondence``,
``documents``) and that compute commissions / escrow on internal
property_dev events.

Events published (payload schemas in handler docstrings):

  Lead lifecycle:
    - ``property_dev.lead.created``         {lead_id, development_id?, source, status, email}
    - ``property_dev.lead.converted``       {lead_id, reservation_id, buyer_id?, plot_id, deposit_amount, currency}

  Reservation lifecycle:
    - ``property_dev.reservation.created``  {reservation_id, plot_id, lead_id?, buyer_id?, deposit_amount, currency}
    - ``property_dev.reservation.cancelled``{reservation_id, plot_id}
    - ``property_dev.reservation.expired``  {reservation_id, plot_id}

  SalesContract (SPA) lifecycle:
    - ``property_dev.spa.draft_created``     {spa_id, plot_id, total_value, currency}
    - ``property_dev.spa.created``           {spa_id, plot_id, reservation_id, total_value, currency}
    - ``property_dev.spa.sent_for_signature``{spa_id, envelope_id?, party_count}
    - ``property_dev.spa.signed``            {spa_id, plot_id, status, signing_date}
    - ``property_dev.spa.cancelled``         {spa_id}

  Payment lifecycle:
    - ``property_dev.payment_schedule.activated`` {schedule_id, sales_contract_id}
    - ``property_dev.payment_schedule.completed`` {schedule_id}
    - ``property_dev.instalment.paid``        {instalment_id, schedule_id, amount_paid, amount_total_paid, status}
    - ``property_dev.instalment.waived``      {instalment_id, schedule_id, reason}

  ContractParty:
    - ``property_dev.contract_party.added``   {spa_id, buyer_id, party_id, ownership_pct, party_role, ownership_total}
    - ``property_dev.contract_party.removed`` {spa_id, buyer_id, party_id}

  Cross-module signals fanned out by property_dev:
    - ``finance.cashflow.actual_received`` (mirrors ``instalment.paid``)
    - ``correspondence.outbound.requested`` (template=INSTALMENT_DEMAND)

Cross-module event flow handled here (task #138):

Inbound (we subscribe to)
    property_dev.spa.signed             → compute_commission_on_event('spa_signed')
    property_dev.reservation.created    → compute_commission_on_event('reservation_paid')
                                          (only when ``deposit_paid_at`` set)
    property_dev.handover.completed     → compute_commission_on_event('handover_complete')
    property_dev.instalment.paid        → create EscrowTransaction credit if
                                          ``escrow_account_id`` is in payload
    schedule.milestone.reached          → mark matching instalments due
    correspondence.outbound.delivered   → stamp instalment demand audit
    documents.uploaded                  → cross-link SPA envelope_id

Outbound (published by the service layer)
    property_dev.commission.accrued
    property_dev.commission.approved
    property_dev.commission.paid
    property_dev.escrow.transaction.created
    property_dev.escrow.transaction.reconciled
    property_dev.price_matrix.activated
    property_dev.regulator_report.generated

All handlers are fail-soft: errors are logged but never raise. They open
fresh sessions because the event bus has no caller-session context.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Any

from app.core.events import Event, event_bus
from app.database import async_session_factory

logger = logging.getLogger(__name__)


_SUBSCRIBED_FLAG = "_property_dev_subscribers_registered"


# ── Helpers ────────────────────────────────────────────────────────────


def _coerce_uuid(value: Any) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


async def _with_service(handler):
    """Open a fresh session, build a PropertyDevService, call handler.

    The event bus does not carry a session — subscribers must spin up
    their own. Mirrors the pattern in bi_dashboards/events.py.
    """
    from app.modules.property_dev.service import PropertyDevService

    async with async_session_factory() as session:
        try:
            svc = PropertyDevService(session)
            result = await handler(svc)
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise


# ── Subscribers (task #137 — schedule/correspondence/documents) ─────────


async def _on_schedule_milestone_reached(event: Event) -> dict[str, Any]:
    """React to a ``schedule.milestone.reached`` event.

    Payload (best-effort):
        sales_contract_id?: UUID — when present, scope to that SPA.
        milestone_event: str — e.g. ``foundation_complete``.
        plot_id?: UUID — fallback when sales_contract_id is missing.

    Marks pending instalments whose ``milestone_event`` matches as due
    and auto-issues a demand letter for each affected line.
    """
    from app.modules.property_dev.service import PropertyDevService

    payload = event.data or {}
    milestone_event = payload.get("milestone_event") or payload.get("milestone")
    if not milestone_event:
        return {"status": "ignored", "reason": "no milestone_event in payload"}
    spa_id = payload.get("sales_contract_id") or payload.get("spa_id")

    try:
        async with async_session_factory() as session:
            svc = PropertyDevService(session)
            touched = 0
            if spa_id:
                import uuid as _uuid
                try:
                    spa_uuid = _uuid.UUID(str(spa_id))
                except (TypeError, ValueError):
                    return {"status": "ignored", "reason": "bad spa_id"}
                touched = await svc._fire_milestone(spa_uuid, milestone_event)
            else:
                # Fan out across every SPA — match by milestone alone.
                # Only used in tests/diagnostics; production callers
                # always supply spa_id.
                instalments = await svc.instalments.list_due_for_milestone(
                    milestone_event
                )
                for ins in instalments:
                    await svc.instalments.update_fields(ins.id, status="due")
                    touched += 1
            await session.commit()
            return {"status": "ok", "touched": touched}
    except Exception as exc:  # noqa: BLE001 — never crash event loop
        logger.warning(
            "property_dev._on_schedule_milestone_reached failed: %s", exc
        )
        return {"status": "error", "error": str(exc)}


async def _on_correspondence_outbound_delivered(
    event: Event,
) -> dict[str, Any]:
    """React to ``correspondence.outbound.delivered`` for demand letters.

    Payload:
        template: str — only INSTALMENT_DEMAND is handled here.
        instalment_id: UUID
        delivered_at?: str
        delivery_ref?: str

    Stamps ``metadata.demand_delivered_at`` + ``metadata.demand_ref`` on
    the matching instalment so the audit trail is preserved.
    """
    payload = event.data or {}
    if payload.get("template") != "INSTALMENT_DEMAND":
        return {"status": "ignored"}
    instalment_id = payload.get("instalment_id")
    if not instalment_id:
        return {"status": "ignored"}

    from app.modules.property_dev.repository import InstalmentRepository

    try:
        import uuid as _uuid
        try:
            ins_uuid = _uuid.UUID(str(instalment_id))
        except (TypeError, ValueError):
            return {"status": "ignored", "reason": "bad instalment_id"}

        async with async_session_factory() as session:
            repo = InstalmentRepository(session)
            ins = await repo.get_by_id(ins_uuid)
            if ins is None:
                return {"status": "ignored", "reason": "instalment gone"}
            md = dict(ins.metadata_ or {})
            md["demand_delivered_at"] = payload.get("delivered_at") or ""
            md["demand_ref"] = payload.get("delivery_ref") or ""
            await repo.update_fields(ins_uuid, metadata_=md)
            await session.commit()
            return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "property_dev._on_correspondence_outbound_delivered: %s", exc
        )
        return {"status": "error", "error": str(exc)}


async def _on_documents_uploaded(event: Event) -> dict[str, Any]:
    """React to ``documents.uploaded`` for category=spa.

    Payload:
        category: str — only ``spa`` is handled.
        external_id: str — envelope id / doc ref.
        sales_contract_id: UUID — required.

    Sets ``SalesContract.e_sign_envelope_id`` for cross-linking.
    """
    payload = event.data or {}
    if (payload.get("category") or "").lower() != "spa":
        return {"status": "ignored"}
    spa_id = payload.get("sales_contract_id") or payload.get("spa_id")
    envelope_id = payload.get("external_id") or payload.get("envelope_id")
    if not spa_id or not envelope_id:
        return {"status": "ignored"}

    from app.modules.property_dev.repository import SalesContractRepository

    try:
        import uuid as _uuid
        try:
            spa_uuid = _uuid.UUID(str(spa_id))
        except (TypeError, ValueError):
            return {"status": "ignored", "reason": "bad spa_id"}

        async with async_session_factory() as session:
            repo = SalesContractRepository(session)
            spa = await repo.get_by_id(spa_uuid)
            if spa is None:
                return {"status": "ignored", "reason": "spa gone"}
            await repo.update_fields(spa_uuid, e_sign_envelope_id=envelope_id)
            await session.commit()
            return {"status": "ok", "envelope_id": envelope_id}
    except Exception as exc:  # noqa: BLE001
        logger.warning("property_dev._on_documents_uploaded failed: %s", exc)
        return {"status": "error", "error": str(exc)}


# ── Commission triggers (task #138) ────────────────────────────────────


async def _on_spa_signed(event: Event) -> dict[str, Any] | None:
    """Compute broker commissions on SPA signature."""
    dev_id = _coerce_uuid(event.data.get("development_id"))
    entity_id = _coerce_uuid(event.data.get("spa_id"))
    base_amount = event.data.get("contract_value") or event.data.get("amount") or 0
    currency = event.data.get("currency") or ""
    plot_id = _coerce_uuid(event.data.get("plot_id"))
    on_date = event.data.get("signed_at") or event.data.get("event_date")
    if dev_id is None or entity_id is None:
        return None

    async def _run(svc):
        accruals = await svc.compute_commission_on_event(
            event_type="spa_signed",
            development_id=dev_id,
            base_amount=Decimal(str(base_amount)),
            currency=currency,
            trigger_entity_type="spa",
            trigger_entity_id=entity_id,
            plot_id=plot_id,
            on_date=on_date,
        )
        return {"accruals_created": len(accruals)}

    try:
        return await _with_service(_run)
    except Exception:
        logger.exception("property_dev.spa.signed handler failed")
        return None


async def _on_reservation_created(event: Event) -> dict[str, Any] | None:
    """Compute commissions when deposit is paid against a reservation."""
    if not event.data.get("deposit_paid_at"):
        return None
    dev_id = _coerce_uuid(event.data.get("development_id"))
    entity_id = _coerce_uuid(event.data.get("reservation_id"))
    base_amount = event.data.get("deposit_amount") or event.data.get("amount") or 0
    currency = event.data.get("currency") or ""
    plot_id = _coerce_uuid(event.data.get("plot_id"))
    on_date = event.data.get("deposit_paid_at")
    if dev_id is None or entity_id is None:
        return None

    async def _run(svc):
        accruals = await svc.compute_commission_on_event(
            event_type="reservation_paid",
            development_id=dev_id,
            base_amount=Decimal(str(base_amount)),
            currency=currency,
            trigger_entity_type="reservation",
            trigger_entity_id=entity_id,
            plot_id=plot_id,
            on_date=on_date,
        )
        return {"accruals_created": len(accruals)}

    try:
        return await _with_service(_run)
    except Exception:
        logger.exception("property_dev.reservation.created handler failed")
        return None


async def _on_handover_completed(event: Event) -> dict[str, Any] | None:
    """Compute commissions on handover completion."""
    # Lookup development via the plot (events carry plot_id, not dev_id).
    plot_id = _coerce_uuid(event.data.get("plot_id"))
    entity_id = _coerce_uuid(event.data.get("handover_id"))
    on_date = event.data.get("completed_at")
    if plot_id is None or entity_id is None:
        return None

    async def _run(svc):
        plot = await svc.plots.get_by_id(plot_id)
        if plot is None:
            return None
        # Use price_base as the commission base for handover events.
        base_amount = Decimal(str(plot.price_base or 0))
        accruals = await svc.compute_commission_on_event(
            event_type="handover_complete",
            development_id=plot.development_id,
            base_amount=base_amount,
            currency=plot.currency or "",
            trigger_entity_type="handover",
            trigger_entity_id=entity_id,
            plot_id=plot_id,
            on_date=on_date,
        )
        return {"accruals_created": len(accruals)}

    try:
        return await _with_service(_run)
    except Exception:
        logger.exception("property_dev.handover.completed handler failed")
        return None


# ── Escrow auto-credit on instalment ───────────────────────────────────


async def _on_instalment_paid(event: Event) -> dict[str, Any] | None:
    """Mirror an instalment payment as an EscrowTransaction credit.

    Triggers only when the payload includes ``escrow_account_id`` (which
    the PaymentSchedule module sets when the instalment is escrow-bound).
    """
    escrow_id = _coerce_uuid(event.data.get("escrow_account_id"))
    instalment_id = _coerce_uuid(event.data.get("instalment_id"))
    amount = event.data.get("amount")
    currency = event.data.get("currency") or ""
    transaction_date = (
        event.data.get("paid_at") or event.data.get("transaction_date") or ""
    )
    if escrow_id is None or amount is None or not transaction_date:
        return None

    from app.modules.property_dev.schemas import EscrowTransactionCreate

    payload = EscrowTransactionCreate(
        escrow_account_id=escrow_id,
        direction="credit",
        amount=Decimal(str(amount)),
        currency=(currency or "USD").upper(),
        source_type="instalment",
        source_instalment_id=instalment_id,
        source_reference=f"instalment:{instalment_id or 'unknown'}",
        bank_reference=event.data.get("bank_reference"),
        transaction_date=str(transaction_date)[:10],
        metadata={"source_event": event.name},
    )

    async def _run(svc):
        tx = await svc.create_escrow_transaction(payload)
        return {"transaction_id": str(tx.id)}

    try:
        return await _with_service(_run)
    except Exception:
        logger.exception("property_dev.instalment.paid handler failed")
        return None


# ── Registration ───────────────────────────────────────────────────────


def register_property_dev_event_subscribers() -> None:
    """Wire :class:`Event` subscribers for cross-module sources.

    Idempotent — safe to call multiple times because each subscription
    appends to the underlying handler list (the framework keeps it
    de-duplicated at startup via module loader call-once semantics).
    """
    event_bus.subscribe(
        "schedule.milestone.reached", _on_schedule_milestone_reached
    )
    event_bus.subscribe(
        "correspondence.outbound.delivered",
        _on_correspondence_outbound_delivered,
    )
    event_bus.subscribe("documents.uploaded", _on_documents_uploaded)


def register_subscribers() -> None:
    """Wire up cross-module subscribers (task #138). Idempotent."""
    flag = getattr(event_bus, _SUBSCRIBED_FLAG, False)
    if flag:
        return
    event_bus.subscribe("property_dev.spa.signed", _on_spa_signed)
    event_bus.subscribe(
        "property_dev.reservation.created", _on_reservation_created,
    )
    event_bus.subscribe(
        "property_dev.handover.completed", _on_handover_completed,
    )
    event_bus.subscribe("property_dev.instalment.paid", _on_instalment_paid)
    setattr(event_bus, _SUBSCRIBED_FLAG, True)
    logger.info("property_dev cross-module subscribers registered")


__all__ = [
    "register_property_dev_event_subscribers",
    "register_subscribers",
]
