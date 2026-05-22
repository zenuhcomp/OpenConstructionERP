"""‌⁠‍Property Development data access layer.

Each entity gets its own repository with CRUD + a small set of query
helpers tuned to the most common access patterns.
"""

from __future__ import annotations

import uuid
from typing import Any

from datetime import date
from decimal import Decimal

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.property_dev.models import (
    Block,
    Broker,
    Buyer,
    BuyerOption,
    BuyerOptionGroup,
    BuyerSelection,
    BuyerSelectionItem,
    CommissionAccrual,
    CommissionAgreement,
    Development,
    EscrowAccount,
    EscrowTransaction,
    Handover,
    HandoverDoc,
    HouseType,
    HouseTypeVariant,
    Phase,
    Plot,
    PriceMatrix,
    Snag,
    WarrantyClaim,
)


class _BaseRepo:
    """‌⁠‍Tiny shared helper for create/update/delete boilerplate."""

    model: type

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, entity_id: uuid.UUID) -> Any:
        return await self.session.get(self.model, entity_id)

    async def create(self, obj: Any) -> Any:
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update_fields(
        self, entity_id: uuid.UUID, **fields: object
    ) -> None:
        if not fields:
            return
        stmt = (
            update(self.model)
            .where(self.model.id == entity_id)  # type: ignore[attr-defined]
            .values(**fields)
        )
        await self.session.execute(stmt)
        await self.session.flush()
        self.session.expire_all()

    async def delete(self, entity_id: uuid.UUID) -> None:
        obj = await self.get_by_id(entity_id)
        if obj is not None:
            await self.session.delete(obj)
            await self.session.flush()


# ── Development ─────────────────────────────────────────────────────────


class DevelopmentRepository(_BaseRepo):
    """‌⁠‍Data access for Development models."""

    model = Development

    async def list_all(
        self, *, offset: int = 0, limit: int = 50
    ) -> tuple[list[Development], int]:
        base = select(Development)
        total = (
            await self.session.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar_one()
        stmt = base.order_by(Development.created_at.desc()).offset(offset).limit(limit)
        rows = (await self.session.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_by_code(self, code: str) -> Development | None:
        result = await self.session.execute(
            select(Development).where(Development.code == code)
        )
        return result.scalar_one_or_none()


# ── House Type ──────────────────────────────────────────────────────────


class HouseTypeRepository(_BaseRepo):
    """Data access for HouseType models."""

    model = HouseType

    async def list_for_development(
        self, development_id: uuid.UUID
    ) -> list[HouseType]:
        result = await self.session.execute(
            select(HouseType)
            .where(HouseType.development_id == development_id)
            .order_by(HouseType.code)
        )
        return list(result.scalars().all())


# ── House Type Variant ──────────────────────────────────────────────────


class HouseTypeVariantRepository(_BaseRepo):
    """Data access for HouseTypeVariant models."""

    model = HouseTypeVariant

    async def list_for_house_type(
        self, house_type_id: uuid.UUID
    ) -> list[HouseTypeVariant]:
        result = await self.session.execute(
            select(HouseTypeVariant)
            .where(HouseTypeVariant.house_type_id == house_type_id)
            .order_by(HouseTypeVariant.code)
        )
        return list(result.scalars().all())


# ── Plot ────────────────────────────────────────────────────────────────


class PlotRepository(_BaseRepo):
    """Data access for Plot models."""

    model = Plot

    async def list_for_development(
        self,
        development_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
        status: str | None = None,
    ) -> tuple[list[Plot], int]:
        base = select(Plot).where(Plot.development_id == development_id)
        if status is not None:
            base = base.where(Plot.status == status)
        total = (
            await self.session.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar_one()
        stmt = base.order_by(Plot.plot_number).offset(offset).limit(limit)
        rows = (await self.session.execute(stmt)).scalars().all()
        return list(rows), total

    async def count_for_development_by_status(
        self, development_id: uuid.UUID
    ) -> dict[str, int]:
        stmt = (
            select(Plot.status, func.count())
            .where(Plot.development_id == development_id)
            .group_by(Plot.status)
        )
        result = await self.session.execute(stmt)
        return {status: count for status, count in result.all()}


# ── Buyer Option Group ──────────────────────────────────────────────────


class BuyerOptionGroupRepository(_BaseRepo):
    """Data access for BuyerOptionGroup models."""

    model = BuyerOptionGroup

    async def list_for_development(
        self, development_id: uuid.UUID
    ) -> list[BuyerOptionGroup]:
        result = await self.session.execute(
            select(BuyerOptionGroup)
            .where(BuyerOptionGroup.development_id == development_id)
            .order_by(BuyerOptionGroup.display_order, BuyerOptionGroup.code)
        )
        return list(result.scalars().all())


# ── Buyer Option ────────────────────────────────────────────────────────


class BuyerOptionRepository(_BaseRepo):
    """Data access for BuyerOption models."""

    model = BuyerOption

    async def list_active_options_for_group(
        self, group_id: uuid.UUID, *, active_only: bool = True
    ) -> list[BuyerOption]:
        base = select(BuyerOption).where(BuyerOption.group_id == group_id)
        if active_only:
            base = base.where(BuyerOption.is_active.is_(True))
        result = await self.session.execute(base.order_by(BuyerOption.code))
        return list(result.scalars().all())

    async def list_for_group(
        self, group_id: uuid.UUID, *, active_only: bool = False
    ) -> list[BuyerOption]:
        return await self.list_active_options_for_group(
            group_id, active_only=active_only
        )


# ── Buyer ───────────────────────────────────────────────────────────────


class BuyerRepository(_BaseRepo):
    """Data access for Buyer models."""

    model = Buyer

    async def list_for_development(
        self,
        development_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
        status: str | None = None,
    ) -> tuple[list[Buyer], int]:
        base = select(Buyer).where(Buyer.development_id == development_id)
        if status is not None:
            base = base.where(Buyer.status == status)
        total = (
            await self.session.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar_one()
        stmt = base.order_by(Buyer.created_at.desc()).offset(offset).limit(limit)
        rows = (await self.session.execute(stmt)).scalars().all()
        return list(rows), total

    async def get_for_plot(self, plot_id: uuid.UUID) -> Buyer | None:
        result = await self.session.execute(
            select(Buyer).where(Buyer.plot_id == plot_id)
        )
        return result.scalar_one_or_none()

    async def count_for_development_by_status(
        self, development_id: uuid.UUID
    ) -> dict[str, int]:
        stmt = (
            select(Buyer.status, func.count())
            .where(Buyer.development_id == development_id)
            .group_by(Buyer.status)
        )
        result = await self.session.execute(stmt)
        return {status: count for status, count in result.all()}

    async def sum_contract_value(
        self, development_id: uuid.UUID, *, status_in: list[str] | None = None
    ) -> Any:
        base = select(func.coalesce(func.sum(Buyer.contract_value), 0)).where(
            Buyer.development_id == development_id
        )
        if status_in:
            base = base.where(Buyer.status.in_(status_in))
        result = await self.session.execute(base)
        return result.scalar_one()


# ── Buyer Selection ─────────────────────────────────────────────────────


class BuyerSelectionRepository(_BaseRepo):
    """Data access for BuyerSelection models."""

    model = BuyerSelection

    async def list_for_buyer(
        self, buyer_id: uuid.UUID
    ) -> list[BuyerSelection]:
        result = await self.session.execute(
            select(BuyerSelection)
            .where(BuyerSelection.buyer_id == buyer_id)
            .order_by(BuyerSelection.created_at.desc())
        )
        return list(result.scalars().all())

    async def current_selection_for_buyer(
        self, buyer_id: uuid.UUID
    ) -> BuyerSelection | None:
        """Return the most recently created selection for a buyer."""
        result = await self.session.execute(
            select(BuyerSelection)
            .where(BuyerSelection.buyer_id == buyer_id)
            .order_by(BuyerSelection.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


class BuyerSelectionItemRepository(_BaseRepo):
    """Data access for BuyerSelectionItem models."""

    model = BuyerSelectionItem

    async def list_for_selection(
        self, selection_id: uuid.UUID
    ) -> list[BuyerSelectionItem]:
        result = await self.session.execute(
            select(BuyerSelectionItem)
            .where(BuyerSelectionItem.selection_id == selection_id)
            .order_by(BuyerSelectionItem.created_at)
        )
        return list(result.scalars().all())


# ── Handover ────────────────────────────────────────────────────────────


class HandoverRepository(_BaseRepo):
    """Data access for Handover models."""

    model = Handover

    async def list_for_plot(self, plot_id: uuid.UUID) -> list[Handover]:
        result = await self.session.execute(
            select(Handover)
            .where(Handover.plot_id == plot_id)
            .order_by(Handover.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_for_development(
        self, development_id: uuid.UUID
    ) -> list[Handover]:
        # Join via Plot.development_id.
        stmt = (
            select(Handover)
            .join(Plot, Plot.id == Handover.plot_id)
            .where(Plot.development_id == development_id)
            .order_by(Handover.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_progress_for_development(
        self, development_id: uuid.UUID
    ) -> tuple[int, int]:
        """Return ``(completed, scheduled_not_completed)`` handover counts.

        SQL aggregate — avoids materialising every handover row just to
        derive two dashboard tallies (was an N-rows-in-Python scan).
        """
        completed_expr = func.count().filter(Handover.completed_at.isnot(None))
        scheduled_expr = func.count().filter(
            Handover.scheduled_at.isnot(None), Handover.completed_at.is_(None)
        )
        stmt = (
            select(completed_expr, scheduled_expr)
            .select_from(Handover)
            .join(Plot, Plot.id == Handover.plot_id)
            .where(Plot.development_id == development_id)
        )
        row = (await self.session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)


# ── Snag ────────────────────────────────────────────────────────────────


class SnagRepository(_BaseRepo):
    """Data access for Snag models."""

    model = Snag

    async def list_for_handover(
        self, handover_id: uuid.UUID, *, status: str | None = None
    ) -> list[Snag]:
        base = select(Snag).where(Snag.handover_id == handover_id)
        if status is not None:
            base = base.where(Snag.status == status)
        result = await self.session.execute(base.order_by(Snag.created_at))
        return list(result.scalars().all())

    async def count_open_for_development(
        self, development_id: uuid.UUID
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Snag)
            .join(Handover, Handover.id == Snag.handover_id)
            .join(Plot, Plot.id == Handover.plot_id)
            .where(Plot.development_id == development_id)
            .where(Snag.status.in_(["open", "in_progress"]))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() or 0


# ── Warranty ────────────────────────────────────────────────────────────


class WarrantyClaimRepository(_BaseRepo):
    """Data access for WarrantyClaim models."""

    model = WarrantyClaim

    async def list_for_buyer(
        self, buyer_id: uuid.UUID, *, status: str | None = None
    ) -> list[WarrantyClaim]:
        base = select(WarrantyClaim).where(WarrantyClaim.buyer_id == buyer_id)
        if status is not None:
            base = base.where(WarrantyClaim.status == status)
        result = await self.session.execute(
            base.order_by(WarrantyClaim.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_for_plot(
        self, plot_id: uuid.UUID, *, status: str | None = None
    ) -> list[WarrantyClaim]:
        base = select(WarrantyClaim).where(WarrantyClaim.plot_id == plot_id)
        if status is not None:
            base = base.where(WarrantyClaim.status == status)
        result = await self.session.execute(
            base.order_by(WarrantyClaim.created_at.desc())
        )
        return list(result.scalars().all())

    async def open_warranty_claims_for_buyer(
        self, buyer_id: uuid.UUID
    ) -> list[WarrantyClaim]:
        result = await self.session.execute(
            select(WarrantyClaim)
            .where(WarrantyClaim.buyer_id == buyer_id)
            .where(
                WarrantyClaim.status.in_(["raised", "under_review", "accepted"])
            )
            .order_by(WarrantyClaim.created_at.desc())
        )
        return list(result.scalars().all())

    async def count_open_for_development(
        self, development_id: uuid.UUID
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(WarrantyClaim)
            .join(Plot, Plot.id == WarrantyClaim.plot_id)
            .where(Plot.development_id == development_id)
            .where(
                WarrantyClaim.status.in_(["raised", "under_review", "accepted"])
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() or 0


# ── HandoverDoc ─────────────────────────────────────────────────────────


class HandoverDocRepository(_BaseRepo):
    """Data access for HandoverDoc rows (buyer-handover document bundle)."""

    model = HandoverDoc

    async def list_for_handover(
        self, handover_id: uuid.UUID,
    ) -> list[HandoverDoc]:
        result = await self.session.execute(
            select(HandoverDoc)
            .where(HandoverDoc.handover_id == handover_id)
            .order_by(HandoverDoc.doc_type, HandoverDoc.created_at)
        )
        return list(result.scalars().all())


# ── Buyer pipeline helpers ──────────────────────────────────────────────


class BuyerPipelineQueries:
    """Read-only helpers for the sales pipeline kanban + reservation
    calendar.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def kanban_for_development(
        self, development_id: uuid.UUID,
    ) -> list[tuple[Buyer, Plot | None]]:
        """Return (buyer, plot) tuples ordered by status / contract date."""
        stmt = (
            select(Buyer, Plot)
            .outerjoin(Plot, Plot.id == Buyer.plot_id)
            .where(Buyer.development_id == development_id)
            .order_by(Buyer.status, Buyer.created_at)
        )
        result = await self.session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def reservation_calendar(
        self,
        development_id: uuid.UUID,
        period_start: str,
        period_end: str,
    ) -> list[tuple[Plot, Buyer | None]]:
        """Return plots with reservation_deadline OR buyer.freeze_deadline
        in the supplied [period_start, period_end] window.
        """
        # Need to fetch plots in development + their buyers (left join).
        stmt = (
            select(Plot, Buyer)
            .outerjoin(Buyer, Buyer.plot_id == Plot.id)
            .where(Plot.development_id == development_id)
            .order_by(Plot.reservation_deadline.nullslast(), Plot.plot_number)
        )
        result = await self.session.execute(stmt)
        rows = [(row[0], row[1]) for row in result.all()]
        # Filter to entries with at least one deadline within window
        out: list[tuple[Plot, Buyer | None]] = []
        for plot, buyer in rows:
            in_window = False
            for deadline in (
                plot.reservation_deadline,
                (buyer.freeze_deadline if buyer is not None else None),
                (buyer.contract_signed_at if buyer is not None else None),
            ):
                if deadline and period_start <= deadline[:10] <= period_end:
                    in_window = True
                    break
            if in_window:
                out.append((plot, buyer))
        return out


# ════════════════════════════════════════════════════════════════════════
# Task #138 — Broker / Commission / Escrow / PriceMatrix / Phase / Block
# ════════════════════════════════════════════════════════════════════════


# ── Phase ───────────────────────────────────────────────────────────────


class PhaseRepository(_BaseRepo):
    """Data access for Phase."""

    model = Phase

    async def list_for_dev_ordered(
        self, development_id: uuid.UUID,
    ) -> list[Phase]:
        """Return Phases ordered by sequence then code."""
        result = await self.session.execute(
            select(Phase)
            .where(Phase.development_id == development_id)
            .order_by(Phase.sequence, Phase.code)
        )
        return list(result.scalars().all())


# ── Block ───────────────────────────────────────────────────────────────


class BlockRepository(_BaseRepo):
    """Data access for Block."""

    model = Block

    async def list_for_phase_ordered(
        self, phase_id: uuid.UUID,
    ) -> list[Block]:
        """Return Blocks ordered by code (typical Tower-A / Tower-B layout)."""
        result = await self.session.execute(
            select(Block)
            .where(Block.phase_id == phase_id)
            .order_by(Block.code)
        )
        return list(result.scalars().all())

    async def list_for_development(
        self, development_id: uuid.UUID,
    ) -> list[Block]:
        """Return Blocks belonging to any Phase of the development."""
        stmt = (
            select(Block)
            .join(Phase, Phase.id == Block.phase_id)
            .where(Phase.development_id == development_id)
            .order_by(Phase.sequence, Block.code)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


# ── Broker ──────────────────────────────────────────────────────────────


class BrokerRepository(_BaseRepo):
    """Data access for Broker."""

    model = Broker

    async def find_by_license_number(
        self, tenant_id: uuid.UUID | None, license_number: str,
    ) -> Broker | None:
        """Tenant-scoped broker lookup by regulator license number."""
        stmt = select(Broker).where(Broker.license_number == license_number)
        if tenant_id is None:
            stmt = stmt.where(Broker.tenant_id.is_(None))
        else:
            stmt = stmt.where(Broker.tenant_id == tenant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active(
        self,
        tenant_id: uuid.UUID | None,
        *,
        jurisdiction: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Broker]:
        stmt = select(Broker).where(Broker.active.is_(True))
        if tenant_id is not None:
            stmt = stmt.where(Broker.tenant_id == tenant_id)
        if jurisdiction:
            stmt = stmt.where(Broker.jurisdiction == jurisdiction)
        stmt = stmt.order_by(Broker.name).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_all(
        self,
        tenant_id: uuid.UUID | None,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Broker]:
        stmt = select(Broker)
        if tenant_id is not None:
            stmt = stmt.where(Broker.tenant_id == tenant_id)
        stmt = stmt.order_by(Broker.name).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


# ── CommissionAgreement ────────────────────────────────────────────────


class CommissionAgreementRepository(_BaseRepo):
    """Data access for CommissionAgreement."""

    model = CommissionAgreement

    async def list_active_for_broker(
        self, broker_id: uuid.UUID, on_date: str,
    ) -> list[CommissionAgreement]:
        """Agreements that are ``status='active'`` and effective on date.

        ``on_date`` is an ISO ``YYYY-MM-DD`` string — strings compare in
        the right order across SQLite + Postgres for ISO dates.
        """
        stmt = (
            select(CommissionAgreement)
            .where(CommissionAgreement.broker_id == broker_id)
            .where(CommissionAgreement.status == "active")
            .where(CommissionAgreement.effective_from <= on_date)
            .where(
                or_(
                    CommissionAgreement.effective_to.is_(None),
                    CommissionAgreement.effective_to >= on_date,
                )
            )
            .order_by(CommissionAgreement.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_matching(
        self,
        *,
        development_id: uuid.UUID,
        on_date: str,
        accrual_trigger: str,
    ) -> list[CommissionAgreement]:
        """All active agreements applicable to a (development, trigger) pair.

        Picks agreements where development_id is NULL (broker-wide) OR
        matches the supplied development_id, AND accrual_trigger matches,
        AND status='active' AND effective_from <= on_date <= effective_to.
        """
        stmt = (
            select(CommissionAgreement)
            .where(CommissionAgreement.status == "active")
            .where(CommissionAgreement.accrual_trigger == accrual_trigger)
            .where(
                or_(
                    CommissionAgreement.development_id.is_(None),
                    CommissionAgreement.development_id == development_id,
                )
            )
            .where(CommissionAgreement.effective_from <= on_date)
            .where(
                or_(
                    CommissionAgreement.effective_to.is_(None),
                    CommissionAgreement.effective_to >= on_date,
                )
            )
            .order_by(CommissionAgreement.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


# ── CommissionAccrual ──────────────────────────────────────────────────


class CommissionAccrualRepository(_BaseRepo):
    """Data access for CommissionAccrual."""

    model = CommissionAccrual

    async def list_for_broker(
        self,
        broker_id: uuid.UUID,
        *,
        state: str | None = None,
        offset: int = 0,
        limit: int = 200,
    ) -> list[CommissionAccrual]:
        base = select(CommissionAccrual).where(
            CommissionAccrual.broker_id == broker_id
        )
        if state:
            base = base.where(CommissionAccrual.state == state)
        stmt = (
            base.order_by(CommissionAccrual.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_for_agreement(
        self, agreement_id: uuid.UUID,
    ) -> list[CommissionAccrual]:
        result = await self.session.execute(
            select(CommissionAccrual)
            .where(CommissionAccrual.agreement_id == agreement_id)
            .order_by(CommissionAccrual.created_at.desc())
        )
        return list(result.scalars().all())

    async def compute_payable_total(
        self, broker_id: uuid.UUID,
    ) -> dict[str, Decimal]:
        """Sum approved-but-unpaid net_payable per currency for a broker."""
        stmt = (
            select(
                CommissionAccrual.currency,
                func.coalesce(func.sum(CommissionAccrual.net_payable), 0),
            )
            .where(CommissionAccrual.broker_id == broker_id)
            .where(CommissionAccrual.state == "approved")
            .group_by(CommissionAccrual.currency)
        )
        result = await self.session.execute(stmt)
        out: dict[str, Decimal] = {}
        for ccy, total in result.all():
            out[ccy or ""] = Decimal(str(total or 0))
        return out


# ── EscrowAccount ──────────────────────────────────────────────────────


class EscrowAccountRepository(_BaseRepo):
    """Data access for EscrowAccount."""

    model = EscrowAccount

    async def list_for_development(
        self, development_id: uuid.UUID,
    ) -> list[EscrowAccount]:
        result = await self.session.execute(
            select(EscrowAccount)
            .where(EscrowAccount.development_id == development_id)
            .order_by(EscrowAccount.currency, EscrowAccount.regulator_ref)
        )
        return list(result.scalars().all())


# ── EscrowTransaction ──────────────────────────────────────────────────


class EscrowTransactionRepository(_BaseRepo):
    """Data access for EscrowTransaction."""

    model = EscrowTransaction

    async def list_for_account(
        self,
        escrow_account_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 500,
    ) -> list[EscrowTransaction]:
        result = await self.session.execute(
            select(EscrowTransaction)
            .where(EscrowTransaction.escrow_account_id == escrow_account_id)
            .order_by(EscrowTransaction.transaction_date.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def compute_balance(
        self,
        escrow_account_id: uuid.UUID,
        *,
        as_of_date: str | None = None,
    ) -> dict[str, Any]:
        """Compute credit/debit totals + balance for the account.

        ``as_of_date`` is an inclusive upper bound (ISO date). When None,
        all transactions count.
        """
        base = select(
            EscrowTransaction.direction,
            func.coalesce(func.sum(EscrowTransaction.amount), 0),
            func.count(),
        ).where(EscrowTransaction.escrow_account_id == escrow_account_id)
        if as_of_date is not None:
            base = base.where(EscrowTransaction.transaction_date <= as_of_date)
        base = base.group_by(EscrowTransaction.direction)
        result = await self.session.execute(base)
        credit = Decimal("0")
        debit = Decimal("0")
        count = 0
        for direction, total, cnt in result.all():
            if direction == "credit":
                credit = Decimal(str(total or 0))
            elif direction == "debit":
                debit = Decimal(str(total or 0))
            count += int(cnt or 0)
        unreconciled_stmt = (
            select(func.count())
            .select_from(EscrowTransaction)
            .where(EscrowTransaction.escrow_account_id == escrow_account_id)
            .where(EscrowTransaction.reconciliation_state == "unreconciled")
        )
        if as_of_date is not None:
            unreconciled_stmt = unreconciled_stmt.where(
                EscrowTransaction.transaction_date <= as_of_date
            )
        unreconciled = (
            await self.session.execute(unreconciled_stmt)
        ).scalar_one() or 0
        return {
            "credit_total": credit,
            "debit_total": debit,
            "balance": credit - debit,
            "transaction_count": count,
            "unreconciled_count": int(unreconciled),
        }

    async def list_unreconciled(
        self, escrow_account_id: uuid.UUID,
    ) -> list[EscrowTransaction]:
        result = await self.session.execute(
            select(EscrowTransaction)
            .where(EscrowTransaction.escrow_account_id == escrow_account_id)
            .where(EscrowTransaction.reconciliation_state == "unreconciled")
            .order_by(EscrowTransaction.transaction_date)
        )
        return list(result.scalars().all())


# ── PriceMatrix ────────────────────────────────────────────────────────


class PriceMatrixRepository(_BaseRepo):
    """Data access for PriceMatrix."""

    model = PriceMatrix

    async def list_for_development(
        self, development_id: uuid.UUID,
    ) -> list[PriceMatrix]:
        result = await self.session.execute(
            select(PriceMatrix)
            .where(PriceMatrix.development_id == development_id)
            .order_by(PriceMatrix.effective_from.desc(), PriceMatrix.version.desc())
        )
        return list(result.scalars().all())

    async def find_active_for_dev_on_date(
        self,
        dev_id: uuid.UUID,
        on_date: str | date,
    ) -> PriceMatrix | None:
        """Return the active matrix whose [effective_from, effective_to]
        window covers ``on_date``. If multiple match, the highest version
        (most-recent) wins.
        """
        if isinstance(on_date, date):
            on_date = on_date.isoformat()
        stmt = (
            select(PriceMatrix)
            .where(PriceMatrix.development_id == dev_id)
            .where(PriceMatrix.status == "active")
            .where(PriceMatrix.effective_from <= on_date)
            .where(
                or_(
                    PriceMatrix.effective_to.is_(None),
                    PriceMatrix.effective_to >= on_date,
                )
            )
            .order_by(PriceMatrix.version.desc(), PriceMatrix.effective_from.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


# ── unused-import sentinels (keep ruff happy) ──────────────────────────

_unused_sa = (and_,)  # ``and_`` reserved for future composite filters
