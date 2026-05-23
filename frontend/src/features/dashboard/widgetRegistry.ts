/**
 * Canonical dashboard widget registry — single source of truth shared by
 * `DashboardPage` (which maps each id to a live React node) and
 * `DashboardLayoutManager` (the reorder / show-hide UI).
 *
 * Order here = the default top-to-bottom layout. The hero header
 * (greeting + primary CTAs + meta strip) is intentionally NOT a widget:
 * it's page chrome and always stays pinned at the top.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Building2,
  Layers,
  Globe,
  Cpu,
  Upload,
  Lightbulb,
  CheckCircle2,
  BarChart3,
  Activity,
  // Wave 2 (added 2026-05-23) — 10 new widgets, grouped by domain below.
  FileSpreadsheet,
  GitBranch,
  ShieldAlert,
  HardHat,
  ShoppingCart,
  Wallet,
  ClipboardList,
  Cog,
  CheckSquare,
  CloudSun,
} from 'lucide-react';

export interface DashboardWidgetMeta {
  id: string;
  /** i18n key for the widget name. */
  labelKey: string;
  labelDefault: string;
  /** i18n key for the one-line description shown in the manager. */
  descKey: string;
  descDefault: string;
  icon: LucideIcon;
}

export const DASHBOARD_WIDGETS: readonly DashboardWidgetMeta[] = [
  // ── Core (existing 12) ────────────────────────────────────────────────
  {
    id: 'continue_work',
    labelKey: 'dashboard.layout.w_continue',
    labelDefault: 'Continue your work',
    descKey: 'dashboard.layout.w_continue_desc',
    descDefault: 'Quick-resume strip for your most recent estimate',
    icon: Sparkles,
  },
  {
    id: 'today',
    labelKey: 'dashboard.layout.w_today',
    labelDefault: 'Today snapshot',
    descKey: 'dashboard.layout.w_today_desc',
    descDefault: 'Aggregated alerts and due items across projects',
    icon: AlertTriangle,
  },
  {
    id: 'kpi',
    labelKey: 'dashboard.layout.w_kpi',
    labelDefault: 'KPI ribbon',
    descKey: 'dashboard.layout.w_kpi_desc',
    descDefault: 'Portfolio totals — value, projects, schedules',
    icon: TrendingUp,
  },
  {
    id: 'projects',
    labelKey: 'dashboard.layout.w_projects',
    labelDefault: 'Project cards',
    descKey: 'dashboard.layout.w_projects_desc',
    descDefault: 'Per-project metric cards (primary content)',
    icon: Building2,
  },
  {
    id: 'portfolio',
    labelKey: 'dashboard.layout.w_portfolio',
    labelDefault: 'Portfolio overview',
    descKey: 'dashboard.layout.w_portfolio_desc',
    descDefault: 'Cross-project rollup for multi-project workspaces',
    icon: Layers,
  },
  {
    id: 'map',
    labelKey: 'dashboard.layout.w_map',
    labelDefault: 'Project map',
    descKey: 'dashboard.layout.w_map_desc',
    descDefault: 'Geographic map of project locations',
    icon: Globe,
  },
  {
    id: 'bim_coverage',
    labelKey: 'dashboard.layout.w_bim',
    labelDefault: 'BIM coverage',
    descKey: 'dashboard.layout.w_bim_desc',
    descDefault: 'Model coverage and linked-quantity health',
    icon: Cpu,
  },
  {
    id: 'quick_upload',
    labelKey: 'dashboard.layout.w_upload',
    labelDefault: 'Quick upload',
    descKey: 'dashboard.layout.w_upload_desc',
    descDefault: 'Drag-and-drop a drawing or document to start',
    icon: Upload,
  },
  {
    id: 'onboarding',
    labelKey: 'dashboard.layout.w_onboarding',
    labelDefault: 'Getting started',
    descKey: 'dashboard.layout.w_onboarding_desc',
    descDefault: 'Setup checklist — hides itself once complete',
    icon: Lightbulb,
  },
  {
    id: 'next_steps',
    labelKey: 'dashboard.layout.w_next',
    labelDefault: 'Suggested next steps',
    descKey: 'dashboard.layout.w_next_desc',
    descDefault: 'Context-aware recommendations for this workspace',
    icon: CheckCircle2,
  },
  {
    id: 'analytics',
    labelKey: 'dashboard.layout.w_analytics',
    labelDefault: 'Analytics',
    descKey: 'dashboard.layout.w_analytics_desc',
    descDefault: 'Charts and trend analysis across the portfolio',
    icon: BarChart3,
  },
  {
    id: 'activity',
    labelKey: 'dashboard.layout.w_activity',
    labelDefault: 'Activity & system status',
    descKey: 'dashboard.layout.w_activity_desc',
    descDefault: 'Recent cross-module activity feed and system health',
    icon: Activity,
  },

  // ── Estimation & quality (wave 2 — 2026-05-23) ────────────────────────
  {
    id: 'boq_summary',
    labelKey: 'dashboard.layout.w_boq_summary',
    labelDefault: 'BOQ Summary',
    descKey: 'dashboard.layout.w_boq_summary_desc',
    descDefault: 'BOQ count, total value, completeness across projects',
    icon: FileSpreadsheet,
  },
  {
    id: 'validation_score',
    labelKey: 'dashboard.layout.w_validation',
    labelDefault: 'Validation Health',
    descKey: 'dashboard.layout.w_validation_desc',
    descDefault: 'Pass / warn / fail counts across validation reports',
    icon: CheckSquare,
  },
  {
    id: 'clash_health',
    labelKey: 'dashboard.layout.w_clash',
    labelDefault: 'Clash Health',
    descKey: 'dashboard.layout.w_clash_desc',
    descDefault: 'Open clashes by severity and resolution progress',
    icon: Cog,
  },

  // ── Planning & risk ────────────────────────────────────────────────────
  {
    id: 'schedule_critical',
    labelKey: 'dashboard.layout.w_schedule',
    labelDefault: 'Critical Path',
    descKey: 'dashboard.layout.w_schedule_desc',
    descDefault: 'Top at-risk tasks on the critical path',
    icon: GitBranch,
  },
  {
    id: 'risk_top',
    labelKey: 'dashboard.layout.w_risk',
    labelDefault: 'Top Risks',
    descKey: 'dashboard.layout.w_risk_desc',
    descDefault: 'Highest probability × impact risks with trend',
    icon: ShieldAlert,
  },
  {
    id: 'hse_scorecard',
    labelKey: 'dashboard.layout.w_hse',
    labelDefault: 'HSE Scorecard',
    descKey: 'dashboard.layout.w_hse_desc',
    descDefault: 'Incidents, near-misses and last-incident date',
    icon: HardHat,
  },

  // ── Commercial ─────────────────────────────────────────────────────────
  {
    id: 'procurement_pipeline',
    labelKey: 'dashboard.layout.w_procurement',
    labelDefault: 'Procurement',
    descKey: 'dashboard.layout.w_procurement_desc',
    descDefault: 'RFQs pending, POs issued and received counts',
    icon: ShoppingCart,
  },
  {
    id: 'budget_variance',
    labelKey: 'dashboard.layout.w_budget',
    labelDefault: 'Budget Variance',
    descKey: 'dashboard.layout.w_budget_desc',
    descDefault: 'Planned vs actual and top over-budget projects',
    icon: Wallet,
  },
  {
    id: 'change_orders',
    labelKey: 'dashboard.layout.w_changeorders',
    labelDefault: 'Change Orders',
    descKey: 'dashboard.layout.w_changeorders_desc',
    descDefault: 'Open count, dollar impact, top pending approvals',
    icon: ClipboardList,
  },

  // ── Field ──────────────────────────────────────────────────────────────
  {
    id: 'weather_site',
    labelKey: 'dashboard.layout.w_weather',
    labelDefault: 'Weather & Site',
    descKey: 'dashboard.layout.w_weather_desc',
    descDefault: "Today's weather at your first project site",
    icon: CloudSun,
  },
] as const;

export const DASHBOARD_WIDGET_IDS: readonly string[] =
  DASHBOARD_WIDGETS.map((w) => w.id);

export const DASHBOARD_WIDGET_BY_ID: Readonly<
  Record<string, DashboardWidgetMeta>
> = Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.id, w]));
