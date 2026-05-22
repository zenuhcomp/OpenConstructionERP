# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
"""Property Development cross-module event subscribers (task #138).

Cross-module event flow handled here:

Inbound (we subscribe to)
    property_dev.spa.signed             → compute_commission_on_event('spa_signed')
    property_dev.reservation.created    → compute_commission_on_event('reservation_paid')
                                          (only when ``deposit_paid_at`` set)
    property_dev.handover.completed     → compute_commission_on_event('handover_complete')
    property_dev.instalment.paid        → create EscrowTransaction credit if
                                          ``escrow_account_id`` is in payload

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
    from app.database import async_session_factory
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


# ── Commission triggers ────────────────────────────────────────────────


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


def register_subscribers() -> None:
    """Wire up cross-module subscribers. Idempotent."""
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


__all__ = ["register_subscribers"]
