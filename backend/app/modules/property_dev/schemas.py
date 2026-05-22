"""‌⁠‍Property Development Pydantic schemas — request/response models."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Development ─────────────────────────────────────────────────────────


class DevelopmentCreate(BaseModel):
    """‌⁠‍Create a new development."""

    model_config = ConfigDict(str_strip_whitespace=True)

    project_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    location_address: str | None = None
    total_plots: int = Field(default=0, ge=0)
    sales_phase: str = Field(
        default="planning",
        pattern=r"^(planning|launch|sales|handover|closed)$",
    )
    launch_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    completion_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    marketing_brief: str | None = None
    status: str = Field(default="active", pattern=r"^(active|paused|completed)$")
    units: str = Field(default="metric", pattern=r"^(metric|imperial)$")
    metadata: dict[str, Any] = Field(default_factory=dict)


class DevelopmentUpdate(BaseModel):
    """‌⁠‍Partial update for a development."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    location_address: str | None = None
    total_plots: int | None = Field(default=None, ge=0)
    sales_phase: str | None = Field(
        default=None, pattern=r"^(planning|launch|sales|handover|closed)$"
    )
    launch_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    completion_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    marketing_brief: str | None = None
    status: str | None = Field(default=None, pattern=r"^(active|paused|completed)$")
    units: str | None = Field(default=None, pattern=r"^(metric|imperial)$")
    metadata: dict[str, Any] | None = None


class DevelopmentResponse(BaseModel):
    """Development returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    project_id: UUID
    code: str
    name: str = ""
    location_address: str | None = None
    total_plots: int = 0
    sales_phase: str = "planning"
    launch_date: str | None = None
    completion_date: str | None = None
    marketing_brief: str | None = None
    status: str = "active"
    units: str = "metric"
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── House Type ──────────────────────────────────────────────────────────


class HouseTypeCreate(BaseModel):
    """Create a new house type."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    bedrooms: int = Field(default=0, ge=0)
    bathrooms: int = Field(default=0, ge=0)
    total_area_m2: Decimal = Field(default=Decimal("0"), ge=0)
    footprint_m2: Decimal = Field(default=Decimal("0"), ge=0)
    levels: int = Field(default=1, ge=1)
    base_price: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="", max_length=8)
    bim_model_ref: str | None = Field(default=None, max_length=120)
    thumbnail_url: str | None = Field(default=None, max_length=1024)
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class HouseTypeUpdate(BaseModel):
    """Partial update for a house type."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    bedrooms: int | None = Field(default=None, ge=0)
    bathrooms: int | None = Field(default=None, ge=0)
    total_area_m2: Decimal | None = Field(default=None, ge=0)
    footprint_m2: Decimal | None = Field(default=None, ge=0)
    levels: int | None = Field(default=None, ge=1)
    base_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    bim_model_ref: str | None = Field(default=None, max_length=120)
    thumbnail_url: str | None = Field(default=None, max_length=1024)
    description: str | None = None
    metadata: dict[str, Any] | None = None


class HouseTypeResponse(BaseModel):
    """House type returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    code: str
    name: str = ""
    bedrooms: int = 0
    bathrooms: int = 0
    total_area_m2: Decimal = Decimal("0")
    footprint_m2: Decimal = Decimal("0")
    levels: int = 1
    base_price: Decimal = Decimal("0")
    currency: str = ""
    bim_model_ref: str | None = None
    thumbnail_url: str | None = None
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── House Type Variant ──────────────────────────────────────────────────


class HouseTypeVariantCreate(BaseModel):
    """Create a new house type variant."""

    model_config = ConfigDict(str_strip_whitespace=True)

    house_type_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    modifier_pct: Decimal = Field(default=Decimal("0"))
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class HouseTypeVariantUpdate(BaseModel):
    """Partial update for a variant."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    modifier_pct: Decimal | None = None
    description: str | None = None
    metadata: dict[str, Any] | None = None


class HouseTypeVariantResponse(BaseModel):
    """Variant returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    house_type_id: UUID
    code: str
    name: str = ""
    modifier_pct: Decimal = Decimal("0")
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Plot ────────────────────────────────────────────────────────────────


class PlotCreate(BaseModel):
    """Create a new plot."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    plot_number: str = Field(..., min_length=1, max_length=50)
    house_type_id: UUID | None = None
    house_type_variant_id: UUID | None = None
    block_id: UUID | None = None
    level_in_block: int | None = Field(default=None, ge=-10, le=200)
    position_on_floor: str | None = Field(default=None, max_length=40)
    orientation: str | None = Field(default=None, max_length=16)
    area_m2: Decimal = Field(default=Decimal("0"), ge=0)
    garden_area_m2: Decimal | None = Field(default=None, ge=0)
    price_base: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="", max_length=8)
    status: str = Field(
        default="planned",
        pattern=r"^(planned|reserved|under_construction|ready|sold|handed_over)$",
    )
    reservation_deadline: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    construction_status_percent: Decimal = Field(
        default=Decimal("0"), ge=0, le=100
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlotUpdate(BaseModel):
    """Partial update for a plot."""

    model_config = ConfigDict(str_strip_whitespace=True)

    house_type_id: UUID | None = None
    house_type_variant_id: UUID | None = None
    block_id: UUID | None = None
    level_in_block: int | None = Field(default=None, ge=-10, le=200)
    position_on_floor: str | None = Field(default=None, max_length=40)
    orientation: str | None = Field(default=None, max_length=16)
    area_m2: Decimal | None = Field(default=None, ge=0)
    garden_area_m2: Decimal | None = Field(default=None, ge=0)
    price_base: Decimal | None = Field(default=None, ge=0)
    computed_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    status: str | None = Field(
        default=None,
        pattern=r"^(planned|reserved|under_construction|ready|sold|handed_over)$",
    )
    reservation_deadline: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    construction_status_percent: Decimal | None = Field(default=None, ge=0, le=100)
    metadata: dict[str, Any] | None = None


class PlotResponse(BaseModel):
    """Plot returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    plot_number: str
    house_type_id: UUID | None = None
    house_type_variant_id: UUID | None = None
    block_id: UUID | None = None
    level_in_block: int | None = None
    position_on_floor: str | None = None
    orientation: str | None = None
    area_m2: Decimal = Decimal("0")
    garden_area_m2: Decimal | None = None
    price_base: Decimal = Decimal("0")
    computed_price: Decimal | None = None
    currency: str = ""
    status: str = "planned"
    reservation_deadline: str | None = None
    construction_status_percent: Decimal = Decimal("0")
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


class PlotReserveRequest(BaseModel):
    """Payload for /plots/{id}/reserve."""

    model_config = ConfigDict(str_strip_whitespace=True)

    buyer_id: UUID | None = None
    full_name: str = Field(default="", max_length=255)
    email: str = Field(default="", max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    language: str = Field(default="en", max_length=10)
    reservation_deadline: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Buyer Option Group ──────────────────────────────────────────────────


class BuyerOptionGroupCreate(BaseModel):
    """Create a buyer option group."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    group_type: str = Field(
        default="extras",
        pattern=r"^(kitchen|bathroom|flooring|extras|exterior|technology|other)$",
    )
    display_order: int = Field(default=0, ge=0)
    allow_multiple: bool = False
    max_count: int | None = Field(default=None, ge=1)
    freeze_offset_days_before_handover: int = Field(default=60, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerOptionGroupUpdate(BaseModel):
    """Partial update for a buyer option group."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    group_type: str | None = Field(
        default=None,
        pattern=r"^(kitchen|bathroom|flooring|extras|exterior|technology|other)$",
    )
    display_order: int | None = Field(default=None, ge=0)
    allow_multiple: bool | None = None
    max_count: int | None = Field(default=None, ge=1)
    freeze_offset_days_before_handover: int | None = Field(default=None, ge=0)
    metadata: dict[str, Any] | None = None


class BuyerOptionGroupResponse(BaseModel):
    """Buyer option group returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    code: str
    name: str = ""
    group_type: str = "extras"
    display_order: int = 0
    allow_multiple: bool = False
    max_count: int | None = None
    freeze_offset_days_before_handover: int = 60
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Buyer Option ────────────────────────────────────────────────────────


class BuyerOptionCreate(BaseModel):
    """Create a buyer option."""

    model_config = ConfigDict(str_strip_whitespace=True)

    group_id: UUID
    code: str = Field(..., min_length=1, max_length=80)
    name: str = Field(default="", max_length=255)
    sku: str | None = Field(default=None, max_length=120)
    price_delta: Decimal = Field(default=Decimal("0"))
    currency: str = Field(default="", max_length=8)
    lead_time_days: int = Field(default=0, ge=0)
    supplier_name: str | None = Field(default=None, max_length=255)
    thumbnail_url: str | None = Field(default=None, max_length=1024)
    is_active: bool = True
    compatibility_rules: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerOptionUpdate(BaseModel):
    """Partial update for a buyer option."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    sku: str | None = Field(default=None, max_length=120)
    price_delta: Decimal | None = None
    currency: str | None = Field(default=None, max_length=8)
    lead_time_days: int | None = Field(default=None, ge=0)
    supplier_name: str | None = Field(default=None, max_length=255)
    thumbnail_url: str | None = Field(default=None, max_length=1024)
    is_active: bool | None = None
    compatibility_rules: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class BuyerOptionResponse(BaseModel):
    """Buyer option returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    group_id: UUID
    code: str
    name: str = ""
    sku: str | None = None
    price_delta: Decimal = Decimal("0")
    currency: str = ""
    lead_time_days: int = 0
    supplier_name: str | None = None
    thumbnail_url: str | None = None
    is_active: bool = True
    compatibility_rules: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Buyer ───────────────────────────────────────────────────────────────


class BuyerCreate(BaseModel):
    """Create a buyer / lead."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    plot_id: UUID | None = None
    portal_user_id: UUID | None = None
    full_name: str = Field(default="", max_length=255)
    email: str = Field(default="", max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    language: str = Field(default="en", max_length=10)
    status: str = Field(
        default="lead",
        pattern=r"^(lead|reserved|contracted|completed|cancelled)$",
    )
    contract_value: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="", max_length=8)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerUpdate(BaseModel):
    """Partial update for a buyer."""

    model_config = ConfigDict(str_strip_whitespace=True)

    plot_id: UUID | None = None
    portal_user_id: UUID | None = None
    full_name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    language: str | None = Field(default=None, max_length=10)
    status: str | None = Field(
        default=None,
        pattern=r"^(lead|reserved|contracted|completed|cancelled)$",
    )
    contract_value: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    contract_signed_at: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    deposit_paid_at: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    freeze_deadline: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    # Optional financial / jurisdiction fields exposed so the edit flow
    # introduced in task #134 can adjust them post-contract without
    # forcing the user back through ``POST /buyers/{id}/contract``.
    deposit_amount: Decimal | None = Field(default=None, ge=0)
    jurisdiction: str | None = Field(default=None, max_length=8)
    metadata: dict[str, Any] | None = None


class BuyerResponse(BaseModel):
    """Buyer returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    plot_id: UUID | None = None
    portal_user_id: UUID | None = None
    full_name: str = ""
    email: str = ""
    phone: str | None = None
    language: str = "en"
    status: str = "lead"
    contract_value: Decimal = Decimal("0")
    currency: str = ""
    contract_signed_at: str | None = None
    deposit_paid_at: str | None = None
    freeze_deadline: str | None = None
    deposit_amount: Decimal = Decimal("0")
    deposit_forfeited: Decimal = Decimal("0")
    deposit_refunded: Decimal = Decimal("0")
    jurisdiction: str = ""
    cancelled_at: str | None = None
    cancelled_reason: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


class BuyerContractRequest(BaseModel):
    """Payload for /buyers/{id}/contract."""

    model_config = ConfigDict(str_strip_whitespace=True)

    contract_value: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=1, max_length=8)
    contract_signed_at: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    deposit_paid_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    freeze_deadline: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    deposit_amount: Decimal | None = Field(default=None, ge=0)
    jurisdiction: str | None = Field(default=None, max_length=8)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerCancelRequest(BaseModel):
    """Payload for /buyers/{id}/cancel — cancel + compute forfeiture."""

    model_config = ConfigDict(str_strip_whitespace=True)

    cancelled_at: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    reason: str = Field(default="", max_length=500)
    jurisdiction_override: str | None = Field(default=None, max_length=8)


class DepositForfeitureResponse(BaseModel):
    """Result of a deposit-forfeiture computation."""

    buyer_id: UUID
    jurisdiction: str
    deposit_amount: Decimal = Decimal("0")
    forfeited_amount: Decimal = Decimal("0")
    refundable_amount: Decimal = Decimal("0")
    rule_citation: str = ""
    rule_summary: str = ""


# ── Buyer Selection ─────────────────────────────────────────────────────


class BuyerSelectionCreate(BaseModel):
    """Create a buyer selection."""

    model_config = ConfigDict(str_strip_whitespace=True)

    buyer_id: UUID
    status: str = Field(
        default="draft", pattern=r"^(draft|submitted|locked|cancelled)$"
    )
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerSelectionUpdate(BaseModel):
    """Partial update for a buyer selection."""

    model_config = ConfigDict(str_strip_whitespace=True)

    status: str | None = Field(
        default=None, pattern=r"^(draft|submitted|locked|cancelled)$"
    )
    notes: str | None = None
    metadata: dict[str, Any] | None = None


class BuyerSelectionResponse(BaseModel):
    """Buyer selection returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    buyer_id: UUID
    status: str = "draft"
    submitted_at: str | None = None
    locked_at: str | None = None
    total_options_value: Decimal = Decimal("0")
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


class BuyerSelectionItemCreate(BaseModel):
    """Create a buyer selection item."""

    model_config = ConfigDict(str_strip_whitespace=True)

    option_id: UUID
    quantity: int = Field(default=1, ge=1)
    unit_price_snapshot: Decimal | None = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuyerSelectionItemResponse(BaseModel):
    """Buyer selection item returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    selection_id: UUID
    option_id: UUID
    quantity: int = 1
    unit_price_snapshot: Decimal = Decimal("0")
    total_price: Decimal = Decimal("0")
    included_in_production: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Handover & Snag ─────────────────────────────────────────────────────


class HandoverCreate(BaseModel):
    """Create a handover record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    plot_id: UUID
    scheduled_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class HandoverUpdate(BaseModel):
    """Partial update for a handover record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    scheduled_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    completed_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    snag_count_at_handover: int | None = Field(default=None, ge=0)
    final_check_passed: bool | None = None
    keys_handed_over_at: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    customer_signature_ref: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    metadata: dict[str, Any] | None = None


class HandoverResponse(BaseModel):
    """Handover record returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    plot_id: UUID
    scheduled_at: str | None = None
    completed_at: str | None = None
    snag_count_at_handover: int = 0
    final_check_passed: bool = False
    keys_handed_over_at: str | None = None
    customer_signature_ref: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


class HandoverCompleteRequest(BaseModel):
    """Payload for /handovers/{id}/complete."""

    model_config = ConfigDict(str_strip_whitespace=True)

    completed_at: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    customer_signature_ref: str = Field(..., min_length=1, max_length=255)
    keys_handed_over_at: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    final_check_passed: bool = True
    snag_count_at_handover: int = Field(default=0, ge=0)
    notes: str | None = None


class SnagCreate(BaseModel):
    """Create a snag entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    handover_id: UUID
    location_in_plot: str | None = Field(default=None, max_length=255)
    severity: str = Field(
        default="minor", pattern=r"^(cosmetic|minor|major|safety)$"
    )
    description: str = Field(..., min_length=1)
    status: str = Field(
        default="open", pattern=r"^(open|in_progress|fixed|wont_fix)$"
    )
    reported_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    metadata: dict[str, Any] = Field(default_factory=dict)


class SnagUpdate(BaseModel):
    """Partial update for a snag entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    location_in_plot: str | None = Field(default=None, max_length=255)
    severity: str | None = Field(
        default=None, pattern=r"^(cosmetic|minor|major|safety)$"
    )
    description: str | None = Field(default=None, min_length=1)
    status: str | None = Field(
        default=None, pattern=r"^(open|in_progress|fixed|wont_fix)$"
    )
    fixed_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    fix_notes: str | None = None
    metadata: dict[str, Any] | None = None


class SnagResponse(BaseModel):
    """Snag returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    handover_id: UUID
    location_in_plot: str | None = None
    severity: str = "minor"
    description: str = ""
    status: str = "open"
    reported_at: str | None = None
    fixed_at: str | None = None
    fix_notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Warranty ────────────────────────────────────────────────────────────


class WarrantyClaimCreate(BaseModel):
    """Create a warranty claim."""

    model_config = ConfigDict(str_strip_whitespace=True)

    plot_id: UUID
    buyer_id: UUID
    raised_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: str = Field(
        default="defect", pattern=r"^(defect|snag|service)$"
    )
    description: str = Field(..., min_length=1)
    status: str = Field(
        default="raised",
        pattern=r"^(raised|under_review|accepted|rejected|closed)$",
    )
    linked_service_ticket_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WarrantyClaimUpdate(BaseModel):
    """Partial update for a warranty claim."""

    model_config = ConfigDict(str_strip_whitespace=True)

    category: str | None = Field(
        default=None, pattern=r"^(defect|snag|service)$"
    )
    description: str | None = Field(default=None, min_length=1)
    status: str | None = Field(
        default=None,
        pattern=r"^(raised|under_review|accepted|rejected|closed)$",
    )
    accepted_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    closed_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    linked_service_ticket_id: UUID | None = None
    metadata: dict[str, Any] | None = None


class WarrantyClaimResponse(BaseModel):
    """Warranty claim returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    plot_id: UUID
    buyer_id: UUID
    raised_at: str | None = None
    category: str = "defect"
    description: str = ""
    status: str = "raised"
    accepted_at: str | None = None
    closed_at: str | None = None
    linked_service_ticket_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime


# ── Composite responses ─────────────────────────────────────────────────


class PlotPricingResponse(BaseModel):
    """Pricing breakdown for a plot."""

    plot_id: UUID
    base_price: Decimal
    variant_modifier_value: Decimal = Decimal("0")
    selections_total: Decimal = Decimal("0")
    final_price: Decimal
    currency: str = ""


class BuyerConfiguratorResponse(BaseModel):
    """Configurator state for a buyer on a plot."""

    plot: PlotResponse
    house_type: HouseTypeResponse | None = None
    variant: HouseTypeVariantResponse | None = None
    option_groups: list[BuyerOptionGroupResponse] = Field(default_factory=list)
    options_by_group: dict[str, list[BuyerOptionResponse]] = Field(default_factory=dict)
    current_selection: BuyerSelectionResponse | None = None
    current_items: list[BuyerSelectionItemResponse] = Field(default_factory=list)
    pricing: PlotPricingResponse | None = None


class DevelopmentDashboard(BaseModel):
    """Sales dashboard KPIs for a development."""

    development_id: UUID
    total_plots: int = 0
    plots_by_status: dict[str, int] = Field(default_factory=dict)
    buyers_by_status: dict[str, int] = Field(default_factory=dict)
    contracted_value: Decimal = Decimal("0")
    open_snags: int = 0
    open_warranty_claims: int = 0
    completed_handovers: int = 0
    scheduled_handovers: int = 0
    sell_through_percent: Decimal = Decimal("0")


# ── Handover docs ───────────────────────────────────────────────────────


_HANDOVER_DOC_TYPES = r"^(warranty|manual|key_receipt|hs_file|epc|nhbc|inspection_cert|certificate_completion|insurance|other)$"


class HandoverDocCreate(BaseModel):
    """Create a handover document entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    handover_id: UUID
    doc_type: str = Field(..., pattern=_HANDOVER_DOC_TYPES)
    title: str = Field(default="", max_length=255)
    file_url: str | None = Field(default=None, max_length=1024)
    is_required: bool = False
    is_delivered: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class HandoverDocUpdate(BaseModel):
    """Patch a handover document entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, max_length=255)
    file_url: str | None = Field(default=None, max_length=1024)
    is_required: bool | None = None
    is_delivered: bool | None = None
    metadata: dict[str, Any] | None = None


class HandoverDocResponse(BaseModel):
    """Handover doc returned from the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    handover_id: UUID
    doc_type: str
    title: str = ""
    file_url: str | None = None
    is_required: bool = False
    is_delivered: bool = False
    delivered_at: str | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


class HandoverBundleResponse(BaseModel):
    """Aggregate of all handover docs + missing-required-doc warning."""

    handover_id: UUID
    docs: list[HandoverDocResponse] = Field(default_factory=list)
    delivered_count: int = 0
    required_count: int = 0
    missing_required: list[str] = Field(default_factory=list)
    ready_for_handover: bool = True


# ── Sales pipeline kanban ───────────────────────────────────────────────


class SalesKanbanBuyerCard(BaseModel):
    """One buyer card on the kanban."""

    buyer_id: UUID
    full_name: str
    email: str = ""
    plot_id: UUID | None = None
    plot_number: str | None = None
    status: str
    contract_value: Decimal = Decimal("0")
    currency: str = ""
    contract_signed_at: str | None = None
    freeze_deadline: str | None = None


class SalesKanbanColumn(BaseModel):
    """One column on the kanban (one status)."""

    status: str
    buyers: list[SalesKanbanBuyerCard] = Field(default_factory=list)
    count: int = 0
    total_value: Decimal = Decimal("0")


class SalesKanbanResponse(BaseModel):
    """Kanban response — one column per buyer-status."""

    development_id: UUID
    columns: list[SalesKanbanColumn] = Field(default_factory=list)


# ── Reservation calendar ────────────────────────────────────────────────


class ReservationCalendarEntry(BaseModel):
    """One entry on the reservation calendar."""

    plot_id: UUID
    plot_number: str
    buyer_id: UUID | None = None
    buyer_name: str = ""
    reservation_deadline: str | None = None
    freeze_deadline: str | None = None
    status: str


class ReservationCalendarResponse(BaseModel):
    """All upcoming reservation-related deadlines for a development."""

    development_id: UUID
    period_start: str
    period_end: str
    entries: list[ReservationCalendarEntry] = Field(default_factory=list)


# ── Development P&L ─────────────────────────────────────────────────────


class DevelopmentPnLResponse(BaseModel):
    """Aggregate P&L for a development.

    Reads from CRM/finance via the cross-module events; service-layer
    aggregates contract revenue + actual costs + deposit retention.
    """

    development_id: UUID
    currency: str = ""
    mixed_currency: bool = False
    revenue_contracted: Decimal = Decimal("0")
    revenue_completed: Decimal = Decimal("0")
    deposits_held: Decimal = Decimal("0")
    deposits_forfeited: Decimal = Decimal("0")
    plot_count_sold: int = 0
    plot_count_handed_over: int = 0
    avg_sale_price: Decimal = Decimal("0")
    open_warranty_count: int = 0
    open_snag_count: int = 0


# ════════════════════════════════════════════════════════════════════════
# Task #138 — Broker / Commission / Escrow / PriceMatrix / Phase / Block
# ════════════════════════════════════════════════════════════════════════


# ── Common validators ───────────────────────────────────────────────────


_REGULATOR_REFS = (
    "rera_dubai",
    "rera_abu_dhabi",
    "maharera",
    "214_FZ_RU",
    "cma_saudi",
    "section32_au",
    "other",
)
_REGULATOR_REF_PATTERN = (
    r"^(rera_dubai|rera_abu_dhabi|maharera|214_FZ_RU|cma_saudi|section32_au|other)$"
)

# Loose IBAN format: 15-34 alphanumeric, first 2 letters = country code,
# next 2 = check digits. Real-world IBANs span this range; we do not run
# the mod-97 check here to keep this layer purely structural.
_IBAN_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$")


def _validate_iban(value: str) -> str:
    """Validate IBAN structurally. Empty string is allowed (no IBAN set)."""
    if not value:
        return value
    normalised = value.replace(" ", "").upper()
    if not _IBAN_RE.match(normalised):
        raise ValueError(
            "Invalid IBAN format — expected 15-34 alphanumeric chars starting "
            "with 2-letter country code + 2-digit checksum"
        )
    return normalised


def _validate_iso_date_order(
    start: str | None, end: str | None, *, field_pair: str
) -> None:
    """Reject ``effective_from > effective_to`` style mistakes."""
    if start and end and start > end:
        raise ValueError(
            f"{field_pair}: effective_from ({start}) must precede "
            f"effective_to ({end})"
        )


# ── Phase ───────────────────────────────────────────────────────────────


class PhaseCreate(BaseModel):
    """Create a sales/build Phase within a Development."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    sequence: int = Field(default=0, ge=0)
    planned_start: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    planned_end: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str = Field(
        default="planned",
        pattern=r"^(planned|under_construction|completed)$",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_dates(self) -> "PhaseCreate":
        _validate_iso_date_order(
            self.planned_start, self.planned_end, field_pair="phase"
        )
        return self


class PhaseUpdate(BaseModel):
    """Partial update for a Phase."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    sequence: int | None = Field(default=None, ge=0)
    planned_start: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    planned_end: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str | None = Field(
        default=None, pattern=r"^(planned|under_construction|completed)$"
    )
    metadata: dict[str, Any] | None = None


class PhaseResponse(BaseModel):
    """Phase as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    code: str
    name: str = ""
    sequence: int = 0
    planned_start: str | None = None
    planned_end: str | None = None
    status: str = "planned"
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


# ── Block ───────────────────────────────────────────────────────────────


class BlockCreate(BaseModel):
    """Create a Block within a Phase."""

    model_config = ConfigDict(str_strip_whitespace=True)

    phase_id: UUID
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(default="", max_length=255)
    levels_count: int = Field(default=1, ge=1, le=400)
    units_per_level: int = Field(default=1, ge=1, le=200)
    orientation: str | None = Field(default=None, max_length=16)
    geo_coordinates: dict[str, Any] | None = None
    status: str = Field(
        default="planned",
        pattern=r"^(planned|under_construction|handed_over)$",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class BlockUpdate(BaseModel):
    """Partial update for a Block."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=255)
    levels_count: int | None = Field(default=None, ge=1, le=400)
    units_per_level: int | None = Field(default=None, ge=1, le=200)
    orientation: str | None = Field(default=None, max_length=16)
    geo_coordinates: dict[str, Any] | None = None
    status: str | None = Field(
        default=None,
        pattern=r"^(planned|under_construction|handed_over)$",
    )
    metadata: dict[str, Any] | None = None


class BlockResponse(BaseModel):
    """Block as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    phase_id: UUID
    code: str
    name: str = ""
    levels_count: int = 1
    units_per_level: int = 1
    orientation: str | None = None
    geo_coordinates: dict[str, Any] | None = None
    status: str = "planned"
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


# ── Broker ──────────────────────────────────────────────────────────────


class BrokerCreate(BaseModel):
    """Create a Broker master record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    tenant_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=255)
    license_number: str = Field(..., min_length=1, max_length=120)
    # ISO 3166-2 region code such as "AE-DU"; we allow blank for staging.
    jurisdiction: str = Field(default="", max_length=16)
    contact_email: str = Field(default="", max_length=255)
    contact_phone: str | None = Field(default=None, max_length=40)
    default_commission_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    kyc_status: str = Field(
        default="pending", pattern=r"^(pending|verified|expired|rejected)$"
    )
    active: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class BrokerUpdate(BaseModel):
    """Partial update for a Broker."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    license_number: str | None = Field(default=None, min_length=1, max_length=120)
    jurisdiction: str | None = Field(default=None, max_length=16)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=40)
    default_commission_pct: Decimal | None = Field(default=None, ge=0, le=100)
    kyc_status: str | None = Field(
        default=None, pattern=r"^(pending|verified|expired|rejected)$"
    )
    active: bool | None = None
    metadata: dict[str, Any] | None = None


class BrokerResponse(BaseModel):
    """Broker as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID | None = None
    name: str
    license_number: str
    jurisdiction: str = ""
    contact_email: str = ""
    contact_phone: str | None = None
    default_commission_pct: Decimal = Decimal("0")
    kyc_status: str = "pending"
    kyc_verified_at: datetime | None = None
    active: bool = True
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


# ── Commission structure (discriminated union) ─────────────────────────


class FlatCommissionStructure(BaseModel):
    """Single fixed amount in a given currency."""

    type: Literal["flat"] = "flat"
    amount: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=3)


class PercentCommissionStructure(BaseModel):
    """Single percentage of the base amount."""

    type: Literal["percent"] = "percent"
    pct: Decimal = Field(..., ge=0, le=100)


class LadderTier(BaseModel):
    """One tier in a ladder commission structure."""

    threshold: Decimal = Field(..., ge=0)
    pct: Decimal = Field(..., ge=0, le=100)


class LadderCommissionStructure(BaseModel):
    """Tiered commission: highest threshold whose ``base >= threshold`` wins."""

    type: Literal["ladder"] = "ladder"
    tiers: list[LadderTier] = Field(..., min_length=1)


# ── CommissionAgreement ────────────────────────────────────────────────


class CommissionAgreementCreate(BaseModel):
    """Create a CommissionAgreement.

    ``structure`` is a free-form JSON shape; the explicit ``structure_type``
    field tells us which validator to apply when reading it back. We
    validate the shape via :meth:`_check_structure`.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    broker_id: UUID
    development_id: UUID | None = None
    specific_plot_ids: list[UUID] | None = None
    structure_type: str = Field(..., pattern=r"^(flat|percent|ladder)$")
    structure: dict[str, Any] = Field(default_factory=dict)
    accrual_trigger: str = Field(
        default="spa_signed",
        pattern=r"^(lead_qualified|reservation_paid|spa_signed|handover_complete)$",
    )
    payout_terms: str = Field(
        default="net30",
        pattern=r"^(immediate|net30|net60|per_milestone)$",
    )
    withholding_tax_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    currency: str = Field(..., min_length=3, max_length=8)
    effective_from: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    effective_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str = Field(
        default="draft", pattern=r"^(draft|active|expired|cancelled)$"
    )
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_structure(self) -> "CommissionAgreementCreate":
        """Validate the JSONB structure with plain-Python checks.

        We *don't* delegate to PercentCommissionStructure.model_validate
        here: when Pydantic raises in a nested validator, the resulting
        ValidationError carries Decimal-typed ``input`` values that
        FastAPI's default JSON serialiser refuses to emit (the 422
        response then 500s with ``Decimal is not JSON serializable``).
        Manual validation keeps every error value as a JSON-safe string.
        """
        try:
            if self.structure_type == "flat":
                amount = self.structure.get("amount")
                currency = self.structure.get("currency")
                if amount is None or currency is None:
                    raise ValueError(
                        "flat structure requires {amount, currency}"
                    )
                amt_dec = Decimal(str(amount))
                if amt_dec < 0:
                    raise ValueError("amount must be >= 0")
                if not isinstance(currency, str) or len(currency) != 3:
                    raise ValueError("currency must be a 3-letter ISO code")
            elif self.structure_type == "percent":
                pct = self.structure.get("pct")
                if pct is None:
                    raise ValueError("percent structure requires {pct}")
                pct_dec = Decimal(str(pct))
                if pct_dec < 0 or pct_dec > 100:
                    raise ValueError("pct must be between 0 and 100")
            elif self.structure_type == "ladder":
                tiers = self.structure.get("tiers")
                if not tiers or not isinstance(tiers, list):
                    raise ValueError(
                        "ladder structure requires non-empty tiers[]"
                    )
                for tier in tiers:
                    t = Decimal(str(tier.get("threshold", 0)))
                    p = Decimal(str(tier.get("pct", 0)))
                    if t < 0:
                        raise ValueError("tier.threshold must be >= 0")
                    if p < 0 or p > 100:
                        raise ValueError("tier.pct must be between 0 and 100")
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid {self.structure_type!r} commission structure: {exc}"
            ) from exc
        _validate_iso_date_order(
            self.effective_from, self.effective_to,
            field_pair="commission_agreement",
        )
        return self


class CommissionAgreementUpdate(BaseModel):
    """Partial update for a CommissionAgreement."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID | None = None
    specific_plot_ids: list[UUID] | None = None
    structure_type: str | None = Field(default=None, pattern=r"^(flat|percent|ladder)$")
    structure: dict[str, Any] | None = None
    accrual_trigger: str | None = Field(
        default=None,
        pattern=r"^(lead_qualified|reservation_paid|spa_signed|handover_complete)$",
    )
    payout_terms: str | None = Field(
        default=None, pattern=r"^(immediate|net30|net60|per_milestone)$"
    )
    withholding_tax_pct: Decimal | None = Field(default=None, ge=0, le=100)
    currency: str | None = Field(default=None, min_length=3, max_length=8)
    effective_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    effective_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: str | None = Field(
        default=None, pattern=r"^(draft|active|expired|cancelled)$"
    )
    metadata: dict[str, Any] | None = None


class CommissionAgreementResponse(BaseModel):
    """CommissionAgreement as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    broker_id: UUID
    development_id: UUID | None = None
    specific_plot_ids: list[Any] | None = None
    structure_type: str = "percent"
    structure: dict[str, Any] = Field(default_factory=dict)
    accrual_trigger: str = "spa_signed"
    payout_terms: str = "net30"
    withholding_tax_pct: Decimal = Decimal("0")
    currency: str = ""
    effective_from: str = ""
    effective_to: str | None = None
    status: str = "draft"
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


# ── CommissionAccrual ───────────────────────────────────────────────────


class CommissionAccrualResponse(BaseModel):
    """CommissionAccrual as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    agreement_id: UUID
    broker_id: UUID
    trigger_event: str = ""
    trigger_entity_type: str = ""
    trigger_entity_id: UUID | None = None
    base_amount: Decimal = Decimal("0")
    commission_amount: Decimal = Decimal("0")
    currency: str = ""
    state: str = "accrued"
    accrued_at: datetime | None = None
    approved_at: datetime | None = None
    paid_at: datetime | None = None
    payment_ref: str | None = None
    withholding_amount: Decimal = Decimal("0")
    net_payable: Decimal = Decimal("0")
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


class CommissionAccrualPayRequest(BaseModel):
    """Payload for /commission-accruals/{id}/pay."""

    model_config = ConfigDict(str_strip_whitespace=True)

    payment_ref: str = Field(..., min_length=1, max_length=255)


# ── EscrowAccount ───────────────────────────────────────────────────────


class EscrowAccountCreate(BaseModel):
    """Create a regulator-supervised EscrowAccount."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    regulator_ref: str = Field(..., pattern=_REGULATOR_REF_PATTERN)
    regulator_account_number: str = Field(default="", max_length=120)
    bank_name: str = Field(default="", max_length=255)
    iban: str = Field(default="", max_length=40)
    swift_bic: str = Field(default="", max_length=16)
    currency: str = Field(..., min_length=3, max_length=8)
    opened_at: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_active: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("iban")
    @classmethod
    def _iban_format(cls, v: str) -> str:
        return _validate_iban(v)


class EscrowAccountUpdate(BaseModel):
    """Partial update for an EscrowAccount."""

    model_config = ConfigDict(str_strip_whitespace=True)

    regulator_account_number: str | None = Field(default=None, max_length=120)
    bank_name: str | None = Field(default=None, max_length=255)
    iban: str | None = Field(default=None, max_length=40)
    swift_bic: str | None = Field(default=None, max_length=16)
    closed_at: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    is_active: bool | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("iban")
    @classmethod
    def _iban_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_iban(v)


class EscrowAccountResponse(BaseModel):
    """EscrowAccount as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    regulator_ref: str = "other"
    regulator_account_number: str = ""
    bank_name: str = ""
    iban: str = ""
    swift_bic: str = ""
    currency: str = ""
    opened_at: str = ""
    closed_at: str | None = None
    is_active: bool = True
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


class EscrowBalanceResponse(BaseModel):
    """Computed balance for an EscrowAccount as of a given date."""

    escrow_account_id: UUID
    currency: str
    as_of_date: str | None = None
    credit_total: Decimal = Decimal("0")
    debit_total: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")
    transaction_count: int = 0
    unreconciled_count: int = 0


# ── EscrowTransaction ───────────────────────────────────────────────────


class EscrowTransactionCreate(BaseModel):
    """Create an EscrowTransaction.

    ``amount`` is typed ``Decimal`` but we run the gt=0 check inside a
    custom validator so a failing input doesn't end up as a Decimal in
    the 422 response body (FastAPI's default JSON encoder raises
    ``TypeError: Decimal is not JSON serializable`` when the error's
    ``input`` field holds a Decimal). Manual validation keeps the
    rejected value as the original string.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    escrow_account_id: UUID
    direction: str = Field(..., pattern=r"^(debit|credit)$")
    amount: Decimal
    currency: str = Field(..., min_length=3, max_length=8)
    source_type: str = Field(
        ...,
        pattern=r"^(instalment|refund|draw_request|bank_charge|interest|transfer)$",
    )
    source_instalment_id: UUID | None = None
    source_reference: str = Field(default="", max_length=255)
    bank_reference: str | None = Field(default=None, max_length=255)
    transaction_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("amount", mode="before")
    @classmethod
    def _amount_positive(cls, v: Any) -> Any:
        try:
            d = Decimal(str(v))
        except (TypeError, ValueError, ArithmeticError) as exc:
            raise ValueError("amount must be a valid decimal") from exc
        if d <= 0:
            raise ValueError("amount must be greater than 0")
        return d


class EscrowTransactionUpdate(BaseModel):
    """Partial update for an EscrowTransaction."""

    model_config = ConfigDict(str_strip_whitespace=True)

    source_reference: str | None = Field(default=None, max_length=255)
    bank_reference: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] | None = None


class EscrowTransactionResponse(BaseModel):
    """EscrowTransaction as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    escrow_account_id: UUID
    direction: str = "credit"
    amount: Decimal = Decimal("0")
    currency: str = ""
    source_type: str = "instalment"
    source_instalment_id: UUID | None = None
    source_reference: str = ""
    bank_reference: str | None = None
    transaction_date: str = ""
    reconciliation_state: str = "unreconciled"
    reconciled_at: datetime | None = None
    reconciled_by_user_id: UUID | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


class EscrowTransactionReconcileRequest(BaseModel):
    """Payload for /escrow-transactions/{id}/reconcile."""

    model_config = ConfigDict(str_strip_whitespace=True)

    bank_reference: str = Field(..., min_length=1, max_length=255)


# ── PriceMatrix ─────────────────────────────────────────────────────────


_PRICE_MATRIX_FACTOR_TYPES = (
    "floor",
    "view",
    "orientation",
    "corner",
    "launch_discount",
    "phase_escalator",
)


class PriceMatrixRule(BaseModel):
    """One pricing rule inside a :class:`PriceMatrix`."""

    factor_type: str = Field(
        ...,
        pattern=(
            r"^(floor|view|orientation|corner|launch_discount|phase_escalator)$"
        ),
    )
    condition: dict[str, Any] = Field(default_factory=dict)
    multiplier: Decimal = Field(..., gt=0)


class PriceMatrixCreate(BaseModel):
    """Create a PriceMatrix."""

    model_config = ConfigDict(str_strip_whitespace=True)

    development_id: UUID
    name: str = Field(..., min_length=1, max_length=255)
    base_price_per_m2: Decimal = Field(..., ge=0)
    currency: str = Field(..., min_length=3, max_length=8)
    effective_from: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    effective_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    rules: list[PriceMatrixRule] = Field(default_factory=list)
    status: str = Field(
        default="draft", pattern=r"^(draft|active|expired|archived)$"
    )
    version: int = Field(default=1, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_dates(self) -> "PriceMatrixCreate":
        _validate_iso_date_order(
            self.effective_from, self.effective_to, field_pair="price_matrix"
        )
        return self


class PriceMatrixUpdate(BaseModel):
    """Partial update for a PriceMatrix."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    base_price_per_m2: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=8)
    effective_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    effective_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    rules: list[PriceMatrixRule] | None = None
    status: str | None = Field(
        default=None, pattern=r"^(draft|active|expired|archived)$"
    )
    version: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] | None = None


class PriceMatrixResponse(BaseModel):
    """PriceMatrix as returned by the API."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    development_id: UUID
    name: str
    base_price_per_m2: Decimal = Decimal("0")
    currency: str = ""
    effective_from: str = ""
    effective_to: str | None = None
    rules: list[Any] = Field(default_factory=list)
    status: str = "draft"
    version: int = 1
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="metadata_"
    )
    created_at: datetime
    updated_at: datetime


class PriceMatrixPreviewResponse(BaseModel):
    """Pricing breakdown produced by ``service.compute_plot_price``."""

    plot_id: UUID
    matrix_id: UUID | None = None
    currency: str = ""
    base_price_per_m2: Decimal = Decimal("0")
    area_m2: Decimal = Decimal("0")
    base_price: Decimal = Decimal("0")
    applied_rules: list[dict[str, Any]] = Field(default_factory=list)
    combined_multiplier: Decimal = Decimal("1")
    final_price: Decimal = Decimal("0")


class PriceMatrixBulkRecomputeResponse(BaseModel):
    """Result of /price-matrices/{id}/bulk-recompute."""

    matrix_id: UUID
    development_id: UUID
    plots_updated: int = 0
    plots_unchanged: int = 0


# ── Regulator report ────────────────────────────────────────────────────


class RegulatorReportResponse(BaseModel):
    """JSON envelope returned alongside the generated PDF."""

    development_id: UUID
    regulator: str
    quarter: str
    generated_at: datetime
    currency: str = ""
    summary: dict[str, Any] = Field(default_factory=dict)
    pdf_size_bytes: int = 0
    pdf_base64: str = ""


__all_task_138__ = (
    "BlockCreate",
    "BlockResponse",
    "BlockUpdate",
    "BrokerCreate",
    "BrokerResponse",
    "BrokerUpdate",
    "CommissionAccrualPayRequest",
    "CommissionAccrualResponse",
    "CommissionAgreementCreate",
    "CommissionAgreementResponse",
    "CommissionAgreementUpdate",
    "EscrowAccountCreate",
    "EscrowAccountResponse",
    "EscrowAccountUpdate",
    "EscrowBalanceResponse",
    "EscrowTransactionCreate",
    "EscrowTransactionReconcileRequest",
    "EscrowTransactionResponse",
    "EscrowTransactionUpdate",
    "FlatCommissionStructure",
    "LadderCommissionStructure",
    "LadderTier",
    "PercentCommissionStructure",
    "PhaseCreate",
    "PhaseResponse",
    "PhaseUpdate",
    "PriceMatrixBulkRecomputeResponse",
    "PriceMatrixCreate",
    "PriceMatrixPreviewResponse",
    "PriceMatrixResponse",
    "PriceMatrixRule",
    "PriceMatrixUpdate",
    "RegulatorReportResponse",
)
