"""‌⁠‍Property Development ORM models.

Tables (all prefixed ``oe_property_dev_``):
    development          — top-level development (1:1 with a Project)
    house_type           — reusable house type within a development
    house_type_variant   — price-modifying variant of a house type
    plot                 — sale-able plot within a development
    buyer_option_group   — group of buyer-selectable options (kitchen, bathroom, ...)
    buyer_option         — individual option (with price delta, lead time, ...)
    buyer                — buyer / lead linked to a plot
    buyer_selection      — buyer's current options selection
    buyer_selection_item — single line within a buyer selection
    handover             — handover ceremony / snag record per plot
    snag                 — defect noted during/after handover
    warranty_claim       — post-handover warranty claim

External references (kept as plain UUID columns, NO FK):
    portal_user_id              → oe_portal_user.id  (Module 21)
    bim_model_ref               → canonical BIM model id (string)
    linked_service_ticket_id    → oe_service_ticket.id  (Module 18)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import GUID, Base

# ── Development ─────────────────────────────────────────────────────────


class Development(Base):
    """‌⁠‍A property development — a collection of plots tied to one project."""

    __tablename__ = "oe_property_dev_development"

    project_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_projects_project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    location_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_plots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sales_phase: Mapped[str] = mapped_column(
        String(40), nullable=False, default="planning", index=True
    )
    launch_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    completion_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    marketing_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="active", index=True
    )
    units: Mapped[str] = mapped_column(String(16), nullable=False, default="metric")
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Development {self.code} ({self.sales_phase}/{self.status})>"


# ── House Types & Variants ──────────────────────────────────────────────


class HouseType(Base):
    """‌⁠‍A reusable house type / model within a development."""

    __tablename__ = "oe_property_dev_house_type"
    __table_args__ = (
        UniqueConstraint(
            "development_id", "code", name="uq_oe_property_dev_house_type_dev_code"
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bathrooms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_area_m2: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    footprint_m2: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    levels: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    base_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    # Canonical BIM model id — NO FK (intentional, see module docstring).
    bim_model_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<HouseType {self.code} ({self.bedrooms}BR/{self.total_area_m2}m2)>"


class HouseTypeVariant(Base):
    """A price-modifying variant of a house type (mirror, extra bedroom, ...)."""

    __tablename__ = "oe_property_dev_house_type_variant"
    __table_args__ = (
        UniqueConstraint(
            "house_type_id", "code", name="uq_oe_property_dev_variant_house_code"
        ),
    )

    house_type_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_house_type.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Modifier as percentage points off base_price (e.g. 5.50 = +5.5%).
    modifier_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<HouseTypeVariant {self.code} ({self.modifier_pct}%)>"


# ── Plot ────────────────────────────────────────────────────────────────


class Plot(Base):
    """A sale-able plot within a development."""

    __tablename__ = "oe_property_dev_plot"
    __table_args__ = (
        UniqueConstraint(
            "development_id", "plot_number", name="uq_oe_property_dev_plot_dev_number"
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plot_number: Mapped[str] = mapped_column(String(50), nullable=False)
    house_type_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_house_type.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    house_type_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_house_type_variant.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Task #138: Phase/Block hierarchy — Plot belongs to a Block, Block belongs
    # to a Phase, Phase belongs to a Development. All FKs nullable so legacy
    # Plot rows (created before the hierarchy existed) keep working.
    block_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_block.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    level_in_block: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position_on_floor: Mapped[str | None] = mapped_column(
        String(40), nullable=True
    )
    orientation: Mapped[str | None] = mapped_column(String(16), nullable=True)
    area_m2: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    garden_area_m2: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    # ``price_base`` = explicit override (priority 1).
    # ``computed_price`` = cached value from PriceMatrix.compute(plot) (prio 2).
    # Effective price helper lives in service.compute_plot_price().
    price_base: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    computed_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="planned", index=True
    )
    reservation_deadline: Mapped[str | None] = mapped_column(String(20), nullable=True)
    construction_status_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Plot {self.plot_number} ({self.status})>"


# ── Buyer Option Catalogue ──────────────────────────────────────────────


class BuyerOptionGroup(Base):
    """A group of buyer-selectable options (kitchen, bathroom, flooring, ...)."""

    __tablename__ = "oe_property_dev_buyer_option_group"
    __table_args__ = (
        UniqueConstraint(
            "development_id",
            "code",
            name="uq_oe_property_dev_option_group_dev_code",
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    group_type: Mapped[str] = mapped_column(String(40), nullable=False, default="extras")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    freeze_offset_days_before_handover: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<BuyerOptionGroup {self.code} ({self.group_type})>"


class BuyerOption(Base):
    """A single buyer-selectable option."""

    __tablename__ = "oe_property_dev_buyer_option"

    group_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_buyer_option_group.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sku: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    price_delta: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    supplier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )
    # JSON compatibility rules. Schema:
    #   {"must_have": ["opt_code", ...], "must_not_have": ["opt_code", ...]}
    compatibility_rules: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        JSON, nullable=False, default=dict, server_default="{}"
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<BuyerOption {self.code} ({self.price_delta})>"


# ── Buyer ───────────────────────────────────────────────────────────────


class Buyer(Base):
    """A buyer / lead linked to a plot (eventually)."""

    __tablename__ = "oe_property_dev_buyer"
    __table_args__ = (
        UniqueConstraint(
            "plot_id", name="uq_oe_property_dev_buyer_plot"
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plot_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_plot.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Plain UUID — refers to oe_portal_user.id but NOT a FK (cross-module).
    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(255), nullable=False, default="", index=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="lead", index=True
    )
    contract_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    contract_signed_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    deposit_paid_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    freeze_deadline: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Deposit accounting — drives forfeiture rules per jurisdiction.
    deposit_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    deposit_forfeited: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    deposit_refunded: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    # ISO 3166-1 alpha-2 country code — selects forfeiture rules.
    jurisdiction: Mapped[str] = mapped_column(
        String(8), nullable=False, default="", server_default=""
    )
    cancelled_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cancelled_reason: Mapped[str] = mapped_column(
        String(500), nullable=False, default="", server_default=""
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Buyer {self.full_name!s} ({self.status})>"


# ── Buyer Selection ─────────────────────────────────────────────────────


class BuyerSelection(Base):
    """A buyer's current selection of options."""

    __tablename__ = "oe_property_dev_buyer_selection"

    buyer_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_buyer.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="draft", index=True
    )
    submitted_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    locked_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    total_options_value: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<BuyerSelection buyer={self.buyer_id} status={self.status}>"


class BuyerSelectionItem(Base):
    """A single line inside a buyer's selection."""

    __tablename__ = "oe_property_dev_buyer_selection_item"

    selection_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_buyer_selection.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_buyer_option.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    total_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    included_in_production: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<SelectionItem option={self.option_id} qty={self.quantity}>"


# ── Handover ────────────────────────────────────────────────────────────


class Handover(Base):
    """A handover ceremony / state record per plot (one per plot)."""

    __tablename__ = "oe_property_dev_handover"
    __table_args__ = (
        UniqueConstraint("plot_id", name="uq_oe_property_dev_handover_plot"),
    )

    plot_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_plot.id", ondelete="CASCADE"),
        nullable=False,
    )
    scheduled_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    snag_count_at_handover: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    final_check_passed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    keys_handed_over_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    customer_signature_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Handover plot={self.plot_id} completed={self.completed_at}>"


class HandoverDoc(Base):
    """A document delivered to the buyer at handover.

    Handover-doc bundle (CDM 2015 Reg 32–35 / Building Safety Act):
    warranty cert, instructions/manuals, key receipt, H&S file, EPC,
    NHBC cert, ...).  ``is_required=True`` means handover is incomplete
    until the doc is delivered.
    """

    __tablename__ = "oe_property_dev_handover_doc"

    handover_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_handover.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    delivered_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<HandoverDoc {self.doc_type} ({'delivered' if self.is_delivered else 'pending'})>"


class Snag(Base):
    """A defect noted during/after handover."""

    __tablename__ = "oe_property_dev_snag"

    handover_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_handover.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_in_plot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="minor", index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", index=True
    )
    reported_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fixed_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fix_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Snag handover={self.handover_id} ({self.severity}/{self.status})>"


# ── Warranty ────────────────────────────────────────────────────────────


class WarrantyClaim(Base):
    """A post-handover warranty claim."""

    __tablename__ = "oe_property_dev_warranty_claim"

    plot_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_plot.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_buyer.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    raised_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str] = mapped_column(
        String(40), nullable=False, default="defect", index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="raised", index=True
    )
    accepted_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    closed_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Cross-module ref to oe_service_ticket.id — plain UUID, NO FK.
    linked_service_ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), nullable=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<WarrantyClaim plot={self.plot_id} "
            f"({self.category}/{self.status})>"
        )


# ── Phase / Block hierarchy (task #138) ─────────────────────────────────


class Phase(Base):
    """A sales/build phase within a Development (e.g. "Launch Q3 2026").

    Phases group Blocks; Blocks group Plots. The hierarchy lets phased
    multi-tower / multi-cluster developments stage launches without
    creating a separate Development row per release.
    """

    __tablename__ = "oe_property_dev_phase"
    __table_args__ = (
        UniqueConstraint(
            "development_id", "code", name="uq_oe_property_dev_phase_dev_code"
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planned_start: Mapped[str | None] = mapped_column(String(20), nullable=True)
    planned_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="planned", index=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Phase {self.code} ({self.status})>"


class Block(Base):
    """A building / cluster within a Phase. Groups Plots by level/position."""

    __tablename__ = "oe_property_dev_block"
    __table_args__ = (
        UniqueConstraint(
            "phase_id", "code", name="uq_oe_property_dev_block_phase_code"
        ),
    )

    phase_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_phase.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    levels_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    units_per_level: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    orientation: Mapped[str | None] = mapped_column(String(16), nullable=True)
    geo_coordinates: Mapped[dict | None] = mapped_column(  # type: ignore[assignment]
        JSON, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="planned", index=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Block {self.code} ({self.status})>"


# ── Broker / Commission (task #138) ─────────────────────────────────────


class Broker(Base):
    """External property broker / agent that brings in deals.

    Carries a KYC lifecycle (pending → verified → expired/rejected). A broker
    can have many CommissionAgreements (one per development or one global).
    """

    __tablename__ = "oe_property_dev_broker"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "license_number",
            name="uq_oe_property_dev_broker_tenant_license",
        ),
    )

    # Multi-tenant key. Held as a plain UUID (no FK) — mirrors the
    # cross-module convention used elsewhere in property_dev.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    license_number: Mapped[str] = mapped_column(
        String(120), nullable=False, default="", index=True
    )
    # ISO 3166-2 region (e.g. "AE-DU", "RU-MOW"); broader than ISO 3166-1.
    jurisdiction: Mapped[str] = mapped_column(
        String(16), nullable=False, default="", index=True
    )
    contact_email: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    default_commission_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    kyc_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    kyc_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return f"<Broker {self.name!r} ({self.kyc_status})>"


class CommissionAgreement(Base):
    """A broker's commission contract on a development (or all developments).

    ``structure_type`` determines the shape of the ``structure`` JSONB:
      - ``flat``:    ``{"amount": "5000", "currency": "EUR"}``
      - ``percent``: ``{"pct": "2.50"}``
      - ``ladder``:  ``{"tiers": [{"threshold": "100000", "pct": "1.5"}, ...]}``

    ``accrual_trigger`` controls which event lifecycle stage flips this
    agreement into an accrual: lead_qualified / reservation_paid /
    spa_signed (default) / handover_complete.
    """

    __tablename__ = "oe_property_dev_commission_agreement"

    broker_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_broker.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable → applies to ALL developments for this broker.
    development_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Array of plot UUIDs (as strings) — empty/null means "all plots".
    specific_plot_ids: Mapped[list | None] = mapped_column(  # type: ignore[assignment]
        JSON, nullable=True
    )
    structure_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="percent"
    )
    structure: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        JSON, nullable=False, default=dict, server_default="{}"
    )
    accrual_trigger: Mapped[str] = mapped_column(
        String(40), nullable=False, default="spa_signed", index=True
    )
    payout_terms: Mapped[str] = mapped_column(
        String(20), nullable=False, default="net30"
    )
    withholding_tax_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    effective_from: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    effective_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", index=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<CommissionAgreement broker={self.broker_id} "
            f"{self.structure_type} ({self.status})>"
        )


class CommissionAccrual(Base):
    """A concrete commission earned by a broker on a specific event.

    State machine: accrued → approved → paid (or cancelled at any step).
    Approval + payment gates are MANAGER+ only.
    """

    __tablename__ = "oe_property_dev_commission_accrual"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey(
            "oe_property_dev_commission_agreement.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    broker_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_broker.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_event: Mapped[str] = mapped_column(
        String(40), nullable=False, default="", index=True
    )
    trigger_entity_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default=""
    )
    trigger_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), nullable=True, index=True
    )
    base_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    commission_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="accrued", index=True
    )
    accrued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payment_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    withholding_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    net_payable: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<CommissionAccrual broker={self.broker_id} "
            f"{self.commission_amount}{self.currency} ({self.state})>"
        )


# ── Escrow (task #138) ──────────────────────────────────────────────────


class EscrowAccount(Base):
    """A regulator-supervised escrow account holding buyer instalments.

    One Development can have multiple accounts — typically one per currency
    + regulator (RERA AED, MAHARERA INR, etc).
    """

    __tablename__ = "oe_property_dev_escrow_account"
    __table_args__ = (
        UniqueConstraint(
            "development_id", "currency", "regulator_ref",
            name="uq_oe_property_dev_escrow_dev_ccy_reg",
        ),
    )

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    regulator_ref: Mapped[str] = mapped_column(
        String(40), nullable=False, default="other", index=True
    )
    regulator_account_number: Mapped[str] = mapped_column(
        String(120), nullable=False, default=""
    )
    bank_name: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    iban: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    swift_bic: Mapped[str] = mapped_column(
        String(16), nullable=False, default=""
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    opened_at: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    closed_at: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<EscrowAccount dev={self.development_id} "
            f"{self.currency} ({self.regulator_ref})>"
        )


class EscrowTransaction(Base):
    """A single debit/credit movement on an escrow account."""

    __tablename__ = "oe_property_dev_escrow_transaction"

    escrow_account_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey(
            "oe_property_dev_escrow_account.id", ondelete="CASCADE"
        ),
        nullable=False,
        index=True,
    )
    direction: Mapped[str] = mapped_column(
        String(8), nullable=False, default="credit"
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    source_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="instalment", index=True
    )
    # Plain UUID (no FK) — instalment lives in PaymentSchedule (task #137).
    source_instalment_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), nullable=True, index=True
    )
    source_reference: Mapped[str] = mapped_column(
        String(255), nullable=False, default=""
    )
    bank_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    transaction_date: Mapped[str] = mapped_column(
        String(20), nullable=False, default="", index=True
    )
    reconciliation_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unreconciled", index=True
    )
    reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reconciled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), nullable=True
    )
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<EscrowTx {self.direction} {self.amount}{self.currency} "
            f"({self.reconciliation_state})>"
        )


# ── PriceMatrix (task #138) ─────────────────────────────────────────────


class PriceMatrix(Base):
    """A versioned price grid that computes plot prices via JSONB rules.

    ``rules`` is an ordered list of factor descriptors::

        [
          {"factor_type": "floor",          "condition": {"min": 5},   "multiplier": "1.04"},
          {"factor_type": "view",           "condition": {"value": "sea"}, "multiplier": "1.15"},
          {"factor_type": "corner",         "condition": {"value": true},  "multiplier": "1.08"},
          {"factor_type": "launch_discount","condition": {"before": "2026-09-01"}, "multiplier": "0.97"},
          {"factor_type": "phase_escalator","condition": {"phase_code": "P2"}, "multiplier": "1.06"}
        ]

    Final price = plot.area_m2 * base_price_per_m2 * ∏ multipliers.
    """

    __tablename__ = "oe_property_dev_price_matrix"

    development_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("oe_property_dev_development.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    base_price_per_m2: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    effective_from: Mapped[str] = mapped_column(
        String(20), nullable=False, default="", index=True
    )
    effective_to: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rules: Mapped[list] = mapped_column(  # type: ignore[assignment]
        JSON, nullable=False, default=list, server_default="[]"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    metadata_: Mapped[dict] = mapped_column(  # type: ignore[assignment]
        "metadata", JSON, nullable=False, default=dict, server_default="{}"
    )

    def __repr__(self) -> str:
        return (
            f"<PriceMatrix {self.name!r} v{self.version} ({self.status})>"
        )


__all__ = [
    "Block",
    "Broker",
    "Buyer",
    "BuyerOption",
    "BuyerOptionGroup",
    "BuyerSelection",
    "BuyerSelectionItem",
    "CommissionAccrual",
    "CommissionAgreement",
    "Development",
    "EscrowAccount",
    "EscrowTransaction",
    "Handover",
    "HandoverDoc",
    "HouseType",
    "HouseTypeVariant",
    "Phase",
    "Plot",
    "PriceMatrix",
    "Snag",
    "WarrantyClaim",
]


# Unused import sentinels for tooling: Date is used implicitly through
# String(20) ISO date columns; suppress lint by referencing here.
_unused = (Date,)
