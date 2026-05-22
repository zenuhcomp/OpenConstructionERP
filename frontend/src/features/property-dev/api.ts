/**
 * API helpers for the Property Development module.
 *
 * Backed by /api/v1/property-dev/ — see backend/app/modules/property_dev/router.py
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/lib/api';

/* ── Types ─────────────────────────────────────────────────────────────── */

export type DevelopmentSalesPhase = 'planning' | 'launch' | 'sales' | 'handover' | 'closed';
export type DevelopmentStatus = 'active' | 'paused' | 'completed';
export type PlotStatus =
  | 'planned'
  | 'reserved'
  | 'under_construction'
  | 'ready'
  | 'sold'
  | 'handed_over';
export type BuyerStatus =
  | 'lead'
  | 'reserved'
  | 'contracted'
  | 'completed'
  | 'cancelled';
export type SelectionStatus = 'draft' | 'submitted' | 'locked' | 'cancelled';
export type SnagSeverity = 'cosmetic' | 'minor' | 'major' | 'safety';
export type SnagStatus = 'open' | 'in_progress' | 'fixed' | 'wont_fix';
export type WarrantyStatus =
  | 'raised'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'closed';
export type WarrantyCategory = 'defect' | 'snag' | 'service';

export interface Development {
  id: string;
  project_id: string;
  code: string;
  name: string;
  location_address: string | null;
  total_plots: number;
  sales_phase: DevelopmentSalesPhase;
  launch_date: string | null;
  completion_date: string | null;
  marketing_brief: string | null;
  status: DevelopmentStatus;
  units: 'metric' | 'imperial';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Plot {
  id: string;
  development_id: string;
  plot_number: string;
  house_type_id: string | null;
  house_type_variant_id: string | null;
  orientation: string | null;
  area_m2: number | string;
  garden_area_m2: number | string | null;
  price_base: number | string;
  currency: string;
  status: PlotStatus;
  reservation_deadline: string | null;
  construction_status_percent: number | string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HouseType {
  id: string;
  development_id: string;
  code: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  total_area_m2: number | string;
  footprint_m2: number | string;
  levels: number;
  base_price: number | string;
  currency: string;
  bim_model_ref: string | null;
  thumbnail_url: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HouseTypeVariant {
  id: string;
  house_type_id: string;
  code: string;
  name: string;
  modifier_pct: number | string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Buyer {
  id: string;
  development_id: string;
  plot_id: string | null;
  portal_user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  language: string;
  status: BuyerStatus;
  contract_value: number | string;
  currency: string;
  contract_signed_at: string | null;
  deposit_paid_at: string | null;
  freeze_deadline: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BuyerSelection {
  id: string;
  buyer_id: string;
  status: SelectionStatus;
  submitted_at: string | null;
  locked_at: string | null;
  total_options_value: number | string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BuyerSelectionItem {
  id: string;
  selection_id: string;
  option_id: string;
  quantity: number;
  unit_price_snapshot: number | string;
  total_price: number | string;
  included_in_production: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Handover {
  id: string;
  plot_id: string;
  scheduled_at: string | null;
  completed_at: string | null;
  snag_count_at_handover: number;
  final_check_passed: boolean;
  keys_handed_over_at: string | null;
  customer_signature_ref: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Snag {
  id: string;
  handover_id: string;
  location_in_plot: string | null;
  severity: SnagSeverity;
  description: string;
  status: SnagStatus;
  reported_at: string | null;
  fixed_at: string | null;
  fix_notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WarrantyClaim {
  id: string;
  plot_id: string;
  buyer_id: string;
  raised_at: string | null;
  category: WarrantyCategory;
  description: string;
  status: WarrantyStatus;
  accepted_at: string | null;
  closed_at: string | null;
  linked_service_ticket_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DevelopmentDashboard {
  development_id: string;
  total_plots: number;
  plots_by_status: Record<string, number>;
  buyers_by_status: Record<string, number>;
  contracted_value: number | string;
  open_snags: number;
  open_warranty_claims: number;
  completed_handovers: number;
  scheduled_handovers: number;
  sell_through_percent: number | string;
}

export interface CreateDevelopmentPayload {
  project_id: string;
  code: string;
  name?: string;
  location_address?: string;
  total_plots?: number;
  sales_phase?: DevelopmentSalesPhase;
}

export interface CreatePlotPayload {
  development_id: string;
  plot_number: string;
  house_type_id?: string;
  area_m2?: number;
  price_base?: number;
  currency?: string;
  status?: PlotStatus;
}

export interface CreateHouseTypePayload {
  development_id: string;
  code: string;
  name?: string;
  bedrooms?: number;
  bathrooms?: number;
  total_area_m2?: number;
  base_price?: number;
  currency?: string;
}

export interface CreateBuyerPayload {
  development_id: string;
  plot_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  status?: BuyerStatus;
}

/**
 * Partial update payload for a buyer, mirroring the backend ``BuyerUpdate``
 * Pydantic schema. Every field is optional — only what's present in the
 * request body is mutated, and a ``status`` value is validated against the
 * FSM transition map (``allowedBuyerTransitions``) on the server before
 * the row is touched.
 */
export interface UpdateBuyerPayload {
  plot_id?: string | null;
  portal_user_id?: string | null;
  full_name?: string;
  email?: string;
  phone?: string | null;
  language?: string;
  status?: BuyerStatus;
  contract_value?: number | string;
  currency?: string;
  contract_signed_at?: string | null;
  deposit_paid_at?: string | null;
  freeze_deadline?: string | null;
  jurisdiction?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Buyer status-transition map. Mirrors `_BUYER_TRANSITIONS` in
 * ``backend/app/modules/property_dev/service.py`` so the dropdown in
 * EditBuyerModal can render only the FSM-allowed next states. Server
 * remains the source of truth and rejects illegal transitions with 409.
 */
export const allowedBuyerTransitions: Record<BuyerStatus, BuyerStatus[]> = {
  lead: ['lead', 'reserved', 'cancelled'],
  reserved: ['reserved', 'contracted', 'cancelled', 'lead'],
  contracted: ['contracted', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

const BASE = '/v1/property-dev';

/* ── Developments ─────────────────────────────────────────────────────── */

export function listDevelopments(params?: {
  offset?: number;
  limit?: number;
}): Promise<Development[]> {
  const qs = new URLSearchParams();
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiGet<Development[]>(`${BASE}/developments/${q ? `?${q}` : ''}`);
}

export function createDevelopment(
  data: CreateDevelopmentPayload,
): Promise<Development> {
  return apiPost<Development>(`${BASE}/developments/`, data);
}

export function updateDevelopment(
  id: string,
  data: Partial<CreateDevelopmentPayload>,
): Promise<Development> {
  return apiPatch<Development>(`${BASE}/developments/${id}`, data);
}

export function deleteDevelopment(id: string): Promise<void> {
  return apiDelete(`${BASE}/developments/${id}`);
}

export function getDevelopmentDashboard(id: string): Promise<DevelopmentDashboard> {
  return apiGet<DevelopmentDashboard>(`${BASE}/developments/${id}/dashboard`);
}

/* ── Plots ────────────────────────────────────────────────────────────── */

export function listPlots(params: {
  development_id: string;
  status?: string;
  offset?: number;
  limit?: number;
}): Promise<Plot[]> {
  const qs = new URLSearchParams();
  qs.set('development_id', params.development_id);
  if (params.status) qs.set('status', params.status);
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  return apiGet<Plot[]>(`${BASE}/plots/?${qs.toString()}`);
}

export function createPlot(data: CreatePlotPayload): Promise<Plot> {
  return apiPost<Plot>(`${BASE}/plots/`, data);
}

export function updatePlot(id: string, data: Partial<CreatePlotPayload>): Promise<Plot> {
  return apiPatch<Plot>(`${BASE}/plots/${id}`, data);
}

export function reservePlot(
  id: string,
  data: {
    full_name?: string;
    email?: string;
    phone?: string;
    language?: string;
    reservation_deadline?: string;
  },
): Promise<Plot> {
  return apiPost<Plot>(`${BASE}/plots/${id}/reserve`, data);
}

/* ── House Types & Variants ───────────────────────────────────────────── */

export function listHouseTypes(development_id: string): Promise<HouseType[]> {
  const qs = new URLSearchParams({ development_id });
  return apiGet<HouseType[]>(`${BASE}/house-types/?${qs.toString()}`);
}

export function createHouseType(data: CreateHouseTypePayload): Promise<HouseType> {
  return apiPost<HouseType>(`${BASE}/house-types/`, data);
}

export function listVariants(house_type_id: string): Promise<HouseTypeVariant[]> {
  const qs = new URLSearchParams({ house_type_id });
  return apiGet<HouseTypeVariant[]>(`${BASE}/house-type-variants/?${qs.toString()}`);
}

/* ── Buyers ───────────────────────────────────────────────────────────── */

export function listBuyers(params: {
  development_id: string;
  status?: string;
  offset?: number;
  limit?: number;
}): Promise<Buyer[]> {
  const qs = new URLSearchParams();
  qs.set('development_id', params.development_id);
  if (params.status) qs.set('status', params.status);
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  return apiGet<Buyer[]>(`${BASE}/buyers/?${qs.toString()}`);
}

export function createBuyer(data: CreateBuyerPayload): Promise<Buyer> {
  return apiPost<Buyer>(`${BASE}/buyers/`, data);
}

export function contractBuyer(
  id: string,
  data: {
    contract_value: number;
    currency: string;
    contract_signed_at: string;
    deposit_paid_at?: string;
    freeze_deadline?: string;
  },
): Promise<Buyer> {
  return apiPost<Buyer>(`${BASE}/buyers/${id}/contract`, data);
}

/**
 * Partial-update a buyer (FSM-validated on the server).
 *
 * Calls ``PATCH /api/v1/property-dev/buyers/{id}`` with only the fields
 * the caller wants to change. Returns the updated buyer. The backend
 * raises HTTP 409 for illegal status transitions, 422 for validation
 * failures (bad currency, non-existent plot, …), and 403 if the caller
 * lacks ``property_dev.update`` — keep these as inline errors in the UI.
 */
export function updateBuyer(
  buyerId: string,
  payload: UpdateBuyerPayload,
): Promise<Buyer> {
  return apiPatch<Buyer>(`${BASE}/buyers/${buyerId}`, payload);
}

export function listJurisdictions(): Promise<string[]> {
  return apiGet<string[]>(`${BASE}/jurisdictions`);
}

/* ── Selections ───────────────────────────────────────────────────────── */

export function listSelections(buyer_id: string): Promise<BuyerSelection[]> {
  const qs = new URLSearchParams({ buyer_id });
  return apiGet<BuyerSelection[]>(`${BASE}/selections/?${qs.toString()}`);
}

/* ── Handovers ────────────────────────────────────────────────────────── */

export function listHandovers(plot_id: string): Promise<Handover[]> {
  const qs = new URLSearchParams({ plot_id });
  return apiGet<Handover[]>(`${BASE}/handovers/?${qs.toString()}`);
}

export function completeHandover(
  id: string,
  data: {
    completed_at: string;
    customer_signature_ref: string;
    keys_handed_over_at?: string;
    final_check_passed?: boolean;
    snag_count_at_handover?: number;
    notes?: string;
  },
): Promise<Handover> {
  return apiPost<Handover>(`${BASE}/handovers/${id}/complete`, data);
}

/* ── Snags ────────────────────────────────────────────────────────────── */

export function listSnags(params: {
  handover_id: string;
  status?: string;
}): Promise<Snag[]> {
  const qs = new URLSearchParams({ handover_id: params.handover_id });
  if (params.status) qs.set('status', params.status);
  return apiGet<Snag[]>(`${BASE}/snags/?${qs.toString()}`);
}

/* ── Warranty Claims ──────────────────────────────────────────────────── */

export function listWarrantyClaims(params: {
  buyer_id?: string;
  plot_id?: string;
  status?: string;
}): Promise<WarrantyClaim[]> {
  const qs = new URLSearchParams();
  if (params.buyer_id) qs.set('buyer_id', params.buyer_id);
  if (params.plot_id) qs.set('plot_id', params.plot_id);
  if (params.status) qs.set('status', params.status);
  return apiGet<WarrantyClaim[]>(`${BASE}/warranty-claims/?${qs.toString()}`);
}

export function createWarrantyClaim(data: {
  plot_id: string;
  buyer_id: string;
  description: string;
  category?: WarrantyCategory;
}): Promise<WarrantyClaim> {
  return apiPost<WarrantyClaim>(`${BASE}/warranty-claims/`, data);
}

export function acceptWarrantyClaim(id: string): Promise<WarrantyClaim> {
  return apiPost<WarrantyClaim>(`${BASE}/warranty/${id}/accept`, {});
}

export function rejectWarrantyClaim(id: string): Promise<WarrantyClaim> {
  return apiPost<WarrantyClaim>(`${BASE}/warranty/${id}/reject`, {});
}

export function closeWarrantyClaim(id: string): Promise<WarrantyClaim> {
  return apiPost<WarrantyClaim>(`${BASE}/warranty/${id}/close`, {});
}
