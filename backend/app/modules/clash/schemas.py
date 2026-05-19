# DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
"""‌⁠‍Pydantic schemas for the clash detection module."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# Review-workflow states a clash can move through.
CLASH_STATUSES = ("new", "active", "reviewed", "approved", "resolved", "ignored")
# A clash that still needs attention (drives the "open clashes" KPI).
OPEN_STATUSES = ("new", "active", "reviewed")
# Geometry-derived triage urgency, worst → least. The ordinal index
# doubles as the sort key for ``order_by=severity``.
CLASH_SEVERITIES = ("critical", "high", "medium", "low")
SEVERITY_ORDER = {s: i for i, s in enumerate(CLASH_SEVERITIES)}


class ClashSelectionSet(BaseModel):
    """One side (A or B) of a Navisworks-style selection-set clash.

    A *set* is a filter over the project's own elements: every element
    whose ``element_type`` is in :attr:`element_types`, whose
    ``discipline`` is in :attr:`disciplines`, whose grouping *category*
    is in :attr:`categories` **or** whose IFC entity is in
    :attr:`ifc_entities` belongs to the set (union — each chip the user
    adds widens it). Used only with ``mode="selection_sets"``: a pair is
    reported iff one element is in Set A and the other is in Set B
    (strictly cross, e.g. walls × pipes, no wall × wall noise).

    ``element_types`` is the indexed ``element_type`` column;
    ``categories`` is the source-native category (Revit category /
    ``ifc_class``, falling back to the element type); ``ifc_entities`` is
    the raw IFC entity (``IfcWall``, …) from the element ``properties``
    — only meaningful for IFC-sourced models. ``properties`` is the
    open-ended ``{property_key: [allowed_values]}`` map: an element is
    also in the set when, for *any* key, its source-native
    ``properties[key]`` (string-coerced + trimmed) is one of the listed
    values — so the picker can facet by *any* element property, not just
    the four built-ins. The extra lists/maps keep older payloads (which
    only carried ``disciplines``/``element_types``) forward-compatible.
    """

    disciplines: list[str] = Field(default_factory=list, max_length=200)
    element_types: list[str] = Field(default_factory=list, max_length=2000)
    categories: list[str] = Field(default_factory=list, max_length=2000)
    ifc_entities: list[str] = Field(default_factory=list, max_length=2000)
    properties: dict[str, list[str]] = Field(default_factory=dict)

    @property
    def is_empty(self) -> bool:
        return not (
            self.disciplines
            or self.element_types
            or self.categories
            or self.ifc_entities
            or any(self.properties.values())
        )


# The kind of interference an engine pass looks for. Mirrors the
# Navisworks Clash Detective "Type" rule selector:
#   * ``hard``      — only report true geometric interpenetration
#                     (triangles actually intersect beyond ``tolerance_m``).
#   * ``clearance`` — only report proximity: pairs that do NOT intersect
#                     but sit within ``clearance_m`` (e.g. maintenance
#                     access around an AHU). Hard hits are suppressed.
#   * ``both``      — report hard interpenetration AND, for non-hard
#                     pairs, clearance violations (the legacy behaviour).
CLASH_TYPES = ("hard", "clearance", "both")


class ClashRunCreate(BaseModel):
    """‌⁠‍Configure + launch a clash run."""

    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Free-text note so a run is identifiable in history "
        "(scope, intent, reviewer). Optional.",
    )
    model_ids: list[uuid.UUID] = Field(
        ...,
        min_length=1,
        description="BIM models to test. One = intra-model; many = federated.",
    )
    clash_type: str = Field(
        default="both",
        description="hard | clearance | both — which interference an "
        "engine pass reports (Navisworks-style Type selector). "
        "'hard' = interpenetration only; 'clearance' = proximity only; "
        "'both' = hard, then clearance for the non-hard pairs.",
    )
    ignore_same_model: bool = Field(
        default=False,
        description="Federated coordination noise filter: when true a "
        "pair is only reported if its two elements come from "
        "*different* BIM models (Navisworks 'ignore clashes within the "
        "same file'). Skipped — has no effect — on a single-model run.",
    )
    tolerance_m: float = Field(
        default=0.01, ge=0.0, le=10.0,
        description="Hard-clash interpenetration threshold in metres.",
    )
    clearance_m: float = Field(
        default=0.0, ge=0.0, le=50.0,
        description="Proximity threshold in metres (0 disables the soft pass).",
    )
    mode: str = Field(
        default="cross_discipline",
        description="cross_discipline | all | selected | selection_sets",
    )
    discipline_filter: list[list[str]] | None = Field(
        default=None,
        description="Optional allow-list of [discipline_a, discipline_b] pairs.",
    )
    set_a: ClashSelectionSet | None = Field(
        default=None,
        description="Selection Set A (mode=selection_sets) — e.g. all walls.",
    )
    set_b: ClashSelectionSet | None = Field(
        default=None,
        description="Selection Set B (mode=selection_sets) — e.g. all pipes.",
    )
    carry_forward: bool = Field(
        default=True,
        description="Carry triage (status, assignee, due date, comments) "
        "forward from the most recent prior completed run of this "
        "project that shares a model, matching clashes by their stable "
        "signature. Keeps coordination state across re-runs.",
    )


# Grouping parameters the Set A / Set B pickers can be faceted by.
# ``discipline``/``type`` exist for every model; ``category`` and
# ``ifc_entity`` only when the selected models actually carry that data
# (Revit category / IFC entity in element ``properties``). In addition to
# these four built-ins, ``group_by`` also accepts the open-ended form
# ``property:<key>`` (the literal ``property:`` prefix + a raw element
# property key, e.g. ``property:FireRating``) — the facet is then the
# distinct values of that property across the selected models. The keys
# the UI can offer are advertised in
# :attr:`ClashCategoriesResponse.available_properties`.
CLASH_GROUP_BY = ("discipline", "type", "category", "ifc_entity")
# Marker prefix for the open-ended per-property grouping form.
CLASH_PROPERTY_GROUP_PREFIX = "property:"


class ClashCategoryItem(BaseModel):
    """One distinct grouping value with its element count."""

    value: str
    count: int


class ClashPropertyFacet(BaseModel):
    """One enumerable element-property key with its element coverage.

    ``key`` is a raw scalar property key present on the selected models'
    elements; ``count`` is how many bounding-box-carrying elements carry
    that key. The UI uses this list to build the "group by any property"
    selector — request ``group_by=property:<key>`` to facet by it.
    """

    key: str
    count: int


class ClashCategoriesResponse(BaseModel):
    """Facets for building the Set A / Set B pickers (one project).

    ``groups`` is the facet list for the *requested* grouping parameter
    (``group_by`` — one of the four built-ins or ``property:<key>``).
    ``element_types`` / ``disciplines`` are kept for backward
    compatibility (older frontends read them directly).
    ``available_group_by`` lists only the *built-in* parameters that
    actually have data across the selected models, so the UI never
    offers an empty "IfcEntity" grouping on a pure-Revit project.
    ``available_properties`` enumerates the open-ended element-property
    keys the UI may additionally group by (always populated regardless
    of ``group_by`` so the selector can be built up-front).
    """

    group_by: str = "type"
    groups: list[ClashCategoryItem] = Field(default_factory=list)
    available_group_by: list[str] = Field(default_factory=list)
    available_properties: list[ClashPropertyFacet] = Field(
        default_factory=list
    )
    element_types: list[ClashCategoryItem] = Field(default_factory=list)
    disciplines: list[ClashCategoryItem] = Field(default_factory=list)


class ClashComment(BaseModel):
    """One threaded triage note on a clash result."""

    author: str = ""
    author_id: str | None = None
    ts: str = ""
    text: str = ""


class ClashResultResponse(BaseModel):
    """‌⁠‍A single clashing pair."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    run_id: uuid.UUID
    a_element_id: uuid.UUID
    b_element_id: uuid.UUID
    a_stable_id: str
    b_stable_id: str
    a_name: str
    b_name: str
    a_discipline: str
    b_discipline: str
    a_element_type: str = ""
    b_element_type: str = ""
    a_model_id: uuid.UUID
    b_model_id: uuid.UUID
    a_storey: int | None = None
    b_storey: int | None = None
    clash_type: str
    penetration_m: float
    distance_m: float
    cx: float
    cy: float
    cz: float
    status: str
    severity: str = "medium"
    signature: str = ""
    assigned_to: str | None
    due_date: str | None = None
    comments: list[ClashComment] = Field(default_factory=list)
    bcf_topic_guid: str | None


class ClashAddComment(BaseModel):
    """Append a triage note. ``author``/``author_id`` are optional —
    when omitted they resolve from the request's auth context."""

    text: str = Field(..., min_length=1, max_length=5000)
    author: str | None = Field(default=None, max_length=255)
    author_id: str | None = Field(default=None, max_length=64)


class ClashResultUpdate(BaseModel):
    """Triage a clash — status, assignee, due date and/or a new comment."""

    status: str | None = Field(default=None)
    assigned_to: str | None = Field(default=None)
    due_date: str | None = Field(default=None, max_length=20)
    add_comment: ClashAddComment | None = Field(default=None)


class ClashMatrixCell(BaseModel):
    """One discipline×discipline cell of the clash matrix."""

    a: str
    b: str
    count: int
    open_count: int


class ClashLevelMatrixCell(BaseModel):
    """One storey×storey cell of the level matrix.

    Same shape/convention as :class:`ClashMatrixCell` so the frontend can
    render it with the identical grid component — only the axis keys are
    integer storey indices instead of discipline strings.
    """

    a: int
    b: int
    count: int
    open_count: int


class ClashRunSummary(BaseModel):
    """Rendered dashboard payload cached on the run.

    ``matrix`` is the discipline×discipline grid (correct for true
    multi-discipline federated uploads). ``level_matrix`` is the
    storey×storey grid (the meaningful coordination view for the common
    single-discipline intra-model run). Both follow the same cell shape.
    """

    disciplines: list[str] = Field(default_factory=list)
    matrix: list[ClashMatrixCell] = Field(default_factory=list)
    storeys: list[int] = Field(default_factory=list)
    level_matrix: list[ClashLevelMatrixCell] = Field(default_factory=list)
    by_status: dict[str, int] = Field(default_factory=dict)
    by_type: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)


class ClashRunResponse(BaseModel):
    """A clash run with its cached summary."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None = None
    model_ids: list[uuid.UUID]
    clash_type: str = "both"
    ignore_same_model: bool = False
    tolerance_m: float
    clearance_m: float
    mode: str
    discipline_filter: list[list[str]] | None
    set_a: ClashSelectionSet | None = None
    set_b: ClashSelectionSet | None = None
    status: str
    error: str | None
    element_count: int
    total_clashes: int
    summary: ClashRunSummary
    created_by: str
    created_at: datetime
    completed_at: datetime | None


class ClashRunListItem(BaseModel):
    """Lightweight run row for the runs list (no result rows)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    clash_type: str = "both"
    status: str
    model_ids: list[uuid.UUID]
    element_count: int
    total_clashes: int
    created_at: datetime
    completed_at: datetime | None


class ClashResultPage(BaseModel):
    """Paginated clash-result slice."""

    items: list[ClashResultResponse]
    total: int
    offset: int
    limit: int


class ClashBCFExportRequest(BaseModel):
    """Export selected clashes (or all open) as native BCF topics."""

    result_ids: list[uuid.UUID] | None = Field(
        default=None,
        description="Specific clashes to export. Omit → all OPEN clashes.",
    )


class ClashBCFExportResponse(BaseModel):
    """Outcome of a BCF export."""

    exported: int
    skipped: int


class ClashResultSummary(BaseModel):
    """Compact clash row used by the run-to-run comparison."""

    id: uuid.UUID
    a_name: str
    b_name: str
    clash_type: str
    severity: str
    penetration_m: float
    distance_m: float
    status: str
    assigned_to: str | None = None


class ClashPersistentPair(BaseModel):
    """A clash present in both the base and the current run (same signature)."""

    current: ClashResultSummary
    base: ClashResultSummary


class ClashCompareStats(BaseModel):
    """Counts behind a run-to-run comparison."""

    new: int
    resolved: int
    persistent: int
    base_total: int
    current_total: int


class ClashCompareResponse(BaseModel):
    """Diff of the current run against a base run, partitioned by signature.

    ``new`` = clashes whose signature appears only in the current run;
    ``resolved`` = signatures that were in the base run but are gone now;
    ``persistent`` = signatures present in both (paired current↔base).
    """

    new: list[ClashResultSummary] = Field(default_factory=list)
    resolved: list[ClashResultSummary] = Field(default_factory=list)
    persistent: list[ClashPersistentPair] = Field(default_factory=list)
    stats: ClashCompareStats
