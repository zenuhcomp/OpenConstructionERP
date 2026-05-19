/**
 * API helpers for Clash Detection.
 *
 * Endpoints (mounted at /api/v1/clash):
 *   GET    /v1/clash/projects/{pid}/models
 *   GET    /v1/clash/projects/{pid}/runs/
 *   POST   /v1/clash/projects/{pid}/runs/
 *   GET    /v1/clash/projects/{pid}/runs/{rid}
 *   DELETE /v1/clash/projects/{pid}/runs/{rid}
 *   GET    /v1/clash/projects/{pid}/runs/{rid}/results
 *   PATCH  /v1/clash/projects/{pid}/runs/{rid}/results/{cid}
 *   POST   /v1/clash/projects/{pid}/runs/{rid}/export-bcf‌⁠‍
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/shared/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

export interface ClashModelOption {
  id: string;
  name: string;
  element_count: number;
  status: string | null;
}

export interface ClashMatrixCell {
  a: string;
  b: string;
  count: number;
  open_count: number;
}

export interface ClashLevelMatrixCell {
  a: number;
  b: number;
  count: number;
  open_count: number;
}

export interface ClashRunSummary {
  disciplines: string[];
  matrix: ClashMatrixCell[];
  /** Storey×storey grid — present on newer backends; optional so older
   *  payloads still type-check. */
  storeys?: number[];
  level_matrix?: ClashLevelMatrixCell[];
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  /** Severity histogram — present on newer backends; optional so older
   *  payloads still type-check (the KPI strip degrades gracefully). */
  by_severity?: Record<string, number>;
}

/** Coordination priority of a clash. Drives the table badge colour and the
 *  optional severity filter / sort. */
export type ClashSeverity = 'critical' | 'high' | 'medium' | 'low';

/** One collaboration note on a clash. The server stamps `author` + `ts`
 *  (and resolves `author_id`); the client only ever sends the text. */
export interface ClashComment {
  author: string;
  author_id: string | null;
  /** ISO-8601 timestamp. */
  ts: string;
  text: string;
}

/** Which interference an engine pass reports — the Navisworks-style
 *  "Type" rule selector. `both` is the back-compatible default. */
export type ClashType = 'hard' | 'clearance' | 'both';

export interface ClashRun {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  model_ids: string[];
  clash_type?: ClashType;
  ignore_same_model?: boolean;
  tolerance_m: number;
  clearance_m: number;
  mode: string;
  discipline_filter: string[][] | null;
  status: string;
  error: string | null;
  element_count: number;
  total_clashes: number;
  summary: ClashRunSummary;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

export interface ClashRunListItem {
  id: string;
  name: string;
  description?: string | null;
  clash_type?: ClashType;
  status: string;
  model_ids: string[];
  element_count: number;
  total_clashes: number;
  created_at: string;
  completed_at: string | null;
}

export interface ClashResult {
  id: string;
  run_id: string;
  a_element_id: string;
  b_element_id: string;
  a_stable_id: string;
  b_stable_id: string;
  a_name: string;
  b_name: string;
  a_discipline: string;
  b_discipline: string;
  a_element_type?: string;
  b_element_type?: string;
  a_model_id: string;
  b_model_id: string;
  clash_type: string;
  penetration_m: number;
  distance_m: number;
  cx: number;
  cy: number;
  cz: number;
  status: string;
  /** Coordination priority. Newer backends always send it; older payloads
   *  may omit it, so callers default to `medium`. */
  severity?: ClashSeverity;
  assigned_to: string | null;
  /** ISO "YYYY-MM-DD" target resolution date, or null when unset. */
  due_date?: string | null;
  /** Collaboration thread (oldest → newest). Absent on older payloads. */
  comments?: ClashComment[];
  /** Stable engine signature — used by run-to-run comparison to match the
   *  same physical clash across runs. */
  signature?: string;
  bcf_topic_guid: string | null;
  /** Client-only: original ordinal within the loaded result set, assigned
   *  during the review-table filter pass for the # column / idx sort. */
  __idx?: number;
}

export interface ClashResultPage {
  items: ClashResult[];
  total: number;
  offset: number;
  limit: number;
}

/** Grouping parameter the Set A / Set B facet lists are built from. The
 *  four built-ins plus the dynamic `property:<key>` form — any distinct
 *  element-property key the backend surfaced in `available_properties`. */
export type ClashGroupBy =
  | 'discipline'
  | 'type'
  | 'category'
  | 'ifc_entity'
  | `property:${string}`;

/** One side of a Navisworks-style selection-set clash. A "set" is the
 *  union of the chosen disciplines / element types / categories / IFC
 *  entities + arbitrary element-property values — every chip (from
 *  whichever grouping parameter) widens it. */
export interface ClashSelectionSet {
  disciplines: string[];
  element_types: string[];
  categories: string[];
  ifc_entities: string[];
  /** Chips faceted by `property:<key>`, keyed by the bare property key.
   *  Additive/back-compatible — older backends ignore it; default `{}`. */
  properties: Record<string, string[]>;
}

export interface ClashCategoryItem {
  value: string;
  count: number;
}

/** One distinct element-property key surfaced across the selected models
 *  (already noise-filtered / capped / sorted server-side). */
export interface ClashPropertyKey {
  key: string;
  count: number;
}

export interface ClashCategories {
  /** The grouping parameter these `groups` were faceted by. */
  group_by: ClashGroupBy;
  /** Facet list for the requested grouping parameter. */
  groups: ClashCategoryItem[];
  /** Only the grouping params that actually have data across the
   *  selected models (IFC entity is absent on a pure-Revit project). */
  available_group_by: ClashGroupBy[];
  /** Distinct element-property keys (any of which can be picked as a
   *  `property:<key>` grouping parameter). Absent on older backends. */
  available_properties?: ClashPropertyKey[];
  /** Kept for backward compatibility. */
  element_types: ClashCategoryItem[];
  disciplines: ClashCategoryItem[];
}

/** Compact projection of a clash used by the run-to-run comparison view —
 *  enough to render a row + open it in 3D, without paging full results. */
export interface ClashResultSummary {
  id: string;
  a_name: string;
  b_name: string;
  clash_type: string;
  severity: ClashSeverity;
  penetration_m: number;
  distance_m: number;
  status: string;
  assigned_to: string | null;
}

/** GET …/runs/{rid}/compare?base_run_id=<uuid> response. `persistent`
 *  carries both sides so the UI can show status drift. */
export interface ClashCompare {
  new: ClashResultSummary[];
  resolved: ClashResultSummary[];
  persistent: { current: ClashResultSummary; base: ClashResultSummary }[];
  stats: {
    new: number;
    resolved: number;
    persistent: number;
    base_total: number;
    current_total: number;
  };
}

export interface ClashRunCreateBody {
  name?: string;
  description?: string | null;
  model_ids: string[];
  /** Navisworks-style "Type": hard interpenetration only, clearance
   *  (proximity) only, or both. Defaults to `both` server-side. */
  clash_type?: ClashType;
  /** Federated noise filter — only report cross-model pairs. No effect
   *  on a single-model run. */
  ignore_same_model?: boolean;
  tolerance_m: number;
  clearance_m: number;
  mode: string;
  discipline_filter?: string[][] | null;
  set_a?: ClashSelectionSet | null;
  set_b?: ClashSelectionSet | null;
}

export const clashApi = {
  models: (projectId: string) =>
    apiGet<ClashModelOption[]>(`/v1/clash/projects/${projectId}/models`),

  categories: (
    projectId: string,
    modelIds: string[],
    groupBy: ClashGroupBy = 'type',
  ) => {
    const q = new URLSearchParams();
    modelIds.forEach((m) => q.append('model_ids', m));
    q.set('group_by', groupBy);
    return apiGet<ClashCategories>(
      `/v1/clash/projects/${projectId}/categories?${q.toString()}`,
    );
  },

  listRuns: (projectId: string) =>
    apiGet<ClashRunListItem[]>(`/v1/clash/projects/${projectId}/runs/`),

  createRun: (projectId: string, body: ClashRunCreateBody) =>
    apiPost<ClashRun, ClashRunCreateBody>(
      `/v1/clash/projects/${projectId}/runs/`,
      body,
    ),

  getRun: (projectId: string, runId: string) =>
    apiGet<ClashRun>(`/v1/clash/projects/${projectId}/runs/${runId}`),

  deleteRun: (projectId: string, runId: string) =>
    apiDelete(`/v1/clash/projects/${projectId}/runs/${runId}`),

  listResults: (
    projectId: string,
    runId: string,
    params: {
      status?: string;
      clash_type?: string;
      discipline?: string;
      severity?: string;
      order_by?: string;
      offset?: number;
      limit?: number;
    } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.clash_type) q.set('clash_type', params.clash_type);
    if (params.discipline) q.set('discipline', params.discipline);
    if (params.severity) q.set('severity', params.severity);
    if (params.order_by) q.set('order_by', params.order_by);
    q.set('offset', String(params.offset ?? 0));
    q.set('limit', String(params.limit ?? 100));
    return apiGet<ClashResultPage>(
      `/v1/clash/projects/${projectId}/runs/${runId}/results?${q.toString()}`,
    );
  },

  /**
   * Page the results endpoint at the backend maximum (500 rows/request)
   * until `min(total, cap)` rows are loaded, the server returns a short
   * page, or the abort signal fires. Returns the accumulated rows plus the
   * server-reported full `total` so callers can show "first N of M".
   *
   * The backend enforces `limit ∈ [1, 500]` — never request more than
   * `SERVER_PAGE` per call.
   */
  loadAllResults: async (
    projectId: string,
    runId: string,
    opts: { cap?: number; signal?: AbortSignal } = {},
  ): Promise<{ items: ClashResult[]; total: number; capped: boolean }> => {
    const SERVER_PAGE = 500;
    const cap = opts.cap ?? 2000;
    const items: ClashResult[] = [];
    let total = 0;
    let offset = 0;
    // First page also gives us the authoritative `total`.
    // Loop: stop when we hit the cap, exhaust `total`, or get a short page.
    for (;;) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const remaining = cap - items.length;
      if (remaining <= 0) break;
      const pageLimit = Math.min(SERVER_PAGE, remaining);
      const q = new URLSearchParams();
      q.set('offset', String(offset));
      q.set('limit', String(pageLimit));
      const page = await apiGet<ClashResultPage>(
        `/v1/clash/projects/${projectId}/runs/${runId}/results?${q.toString()}`,
        { signal: opts.signal },
      );
      total = page.total;
      items.push(...page.items);
      offset += page.items.length;
      // Short page (server has no more rows) or we've reached the total.
      if (page.items.length < pageLimit) break;
      if (offset >= total) break;
    }
    return { items, total, capped: items.length < total };
  },

  updateResult: (
    projectId: string,
    runId: string,
    resultId: string,
    body: {
      status?: string;
      assigned_to?: string | null;
      due_date?: string | null;
      /** Append a comment — the server stamps author + ts and returns the
       *  updated result (incl. the new `comments` array). */
      add_comment?: { text: string };
    },
  ) =>
    apiPatch<ClashResult>(
      `/v1/clash/projects/${projectId}/runs/${runId}/results/${resultId}`,
      body,
    ),

  /** Diff the active run against an earlier one (same models/config).
   *  Returns new / resolved / persistent buckets + summary stats. */
  compare: (projectId: string, runId: string, baseRunId: string) =>
    apiGet<ClashCompare>(
      `/v1/clash/projects/${projectId}/runs/${runId}/compare?base_run_id=${encodeURIComponent(
        baseRunId,
      )}`,
    ),

  exportBcf: (
    projectId: string,
    runId: string,
    body: { result_ids?: string[] | null },
  ) =>
    apiPost<{ exported: number; skipped: number }>(
      `/v1/clash/projects/${projectId}/runs/${runId}/export-bcf`,
      body,
    ),

  /**
   * Stream the run's results as a server-rendered CSV and trigger a browser
   * download, honouring the same status/type/severity filters the review
   * table uses. Done with an authenticated `fetch` → blob → hidden anchor
   * (mirrors the takeoff CAD export in features/ai/api.ts) because the
   * endpoint returns `text/csv`, not JSON, so `apiGet` can't be used.
   */
  exportCsv: async (
    projectId: string,
    runId: string,
    filters: {
      status?: string;
      clash_type?: string;
      severity?: string;
    } = {},
  ): Promise<void> => {
    const q = new URLSearchParams();
    if (filters.status) q.set('status', filters.status);
    if (filters.clash_type) q.set('clash_type', filters.clash_type);
    if (filters.severity) q.set('severity', filters.severity);
    const qs = q.toString();
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(
      `/api/v1/clash/projects/${projectId}/runs/${runId}/export-csv${
        qs ? `?${qs}` : ''
      }`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/csv',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || 'CSV export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    a.download = match?.[1] || `clash-results-${runId}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 203);
  },
};
