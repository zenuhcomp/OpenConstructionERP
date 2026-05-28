// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// Wire types for Approval Routes (Wave 2, Epic A).
//
// Mirrors backend/app/modules/approval_routes/schemas.py — keep in sync.
// A *Route* is a reusable workflow template (steps with approver role/user
// + decision mode + optional SLA). An *Instance* is a running workflow on
// a specific target (markup, submittal, RFI, file, …).

/** Decision mode for a step — how many approvers must approve before it
 *  closes. ``all`` = unanimous, ``any`` = first one wins, ``majority`` =
 *  > 50 % of pinned approvers. */
export type RouteStepMode = 'all' | 'any' | 'majority';

/** Status of a running instance. */
export type InstanceStatus =
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'cancelled';

/** Per-step status inside an instance. */
export type InstanceStepStatus =
  | 'pending'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'skipped';

/** Outcome a user can submit via the decide endpoint. */
export type StepDecision = 'approve' | 'reject';

/** A template step — pinned to a role OR a specific user (mutually
 *  exclusive). One of the two must be set. */
export interface RouteStep {
  id: string;
  route_id: string;
  sort_order: number;
  approver_role: string | null;
  approver_user_id: string | null;
  mode: RouteStepMode;
  sla_hours: number | null;
}

/** A reusable approval-route template scoped to a project (or global). */
export interface ApprovalRoute {
  id: string;
  project_id: string | null;
  target_kind: string;
  name: string;
  description: string | null;
  is_active: boolean;
  steps: RouteStep[];
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

/** Payload shape when creating/updating a step inside a route. */
export interface RouteStepPayload {
  sort_order?: number;
  approver_role?: string | null;
  approver_user_id?: string | null;
  mode: RouteStepMode;
  sla_hours?: number | null;
}

export interface ApprovalRouteCreatePayload {
  project_id?: string | null;
  target_kind: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  steps: RouteStepPayload[];
}

export interface ApprovalRouteUpdatePayload {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  steps?: RouteStepPayload[];
}

/** One assigned approver inside a running instance step. Populated by the
 *  backend by expanding the role/user pin against the project team. */
export interface InstanceStepAssignee {
  user_id: string;
  user_email?: string | null;
  user_name?: string | null;
  decided_at: string | null;
  decision: StepDecision | null;
  comment: string | null;
}

/** One step inside a running instance — mirrors the template step but
 *  carries decision state and a snapshot of the approvers picked at
 *  start-time. */
export interface InstanceStep {
  id: string;
  instance_id: string;
  sort_order: number;
  approver_role: string | null;
  approver_user_id: string | null;
  mode: RouteStepMode;
  sla_hours: number | null;
  status: InstanceStepStatus;
  assignees: InstanceStepAssignee[];
  closed_at: string | null;
}

/** A running approval workflow on a specific target. */
export interface ApprovalInstance {
  id: string;
  route_id: string;
  route_name: string | null;
  project_id: string | null;
  target_kind: string;
  target_id: string;
  status: InstanceStatus;
  current_step_index: number;
  steps: InstanceStep[];
  started_by_id: string | null;
  started_at: string;
  closed_at: string | null;
  cancelled_reason: string | null;
}

export interface InstanceCreatePayload {
  route_id: string;
  target_kind: string;
  target_id: string;
  /** Optional one-off note shown next to the started-at audit row. */
  note?: string | null;
}

export interface InstanceDecidePayload {
  step_id: string;
  decision: StepDecision;
  comment?: string | null;
}

export interface InstanceCancelPayload {
  reason?: string | null;
}
