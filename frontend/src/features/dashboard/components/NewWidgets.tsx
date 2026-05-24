/**
 * NewWidgets — wave-2 dashboard widgets (refactored 2026-05-24).
 *
 * Previously each widget owned a `useQuery(['dashboard-…'])` that
 * fanned out one HTTP call per project. With 50 projects × 10 widgets
 * that was up to 500 round-trips per dashboard mount.
 *
 * Now: the dashboard page mounts one `DashboardRollupProvider` which
 * issues a SINGLE `GET /api/v1/dashboard/rollup/` and stores the
 * payload in React Context. Each widget is a pure presentational
 * component reading its slice from context — no HTTP fetched here.
 *
 * Money values are formatted from Decimal-as-string per the architecture guide §10.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
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
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, Button, Skeleton, Badge } from '@/shared/ui';
import { useDashboardRollupContext } from '../context/DashboardRollupContext';

/* ── Types (legacy ProjectRef kept for backward-compat prop signatures) ── */

interface ProjectRef {
  id: string;
  name: string;
  currency: string;
  address?: {
    lat?: number | null;
    lng?: number | null;
    city?: string | null;
    country?: string | null;
  } | null;
}

/** Format money — accepts string or number, never NaN. */
function fmtMoney(value: string | number | null | undefined, currency: string): string {
  if (value == null) return `${currency} 0`;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return `${currency} 0`;
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Shared widget shell so empty / loading states stay consistent. */
function WidgetCard({
  icon,
  title,
  subtitle,
  delay = '160ms',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-card-in" style={{ animationDelay: delay }}>
      <Card>
        <div className="flex items-start gap-3 px-6 pt-5">
          <span className="mt-1 shrink-0" aria-hidden="true">{icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
            {subtitle && (
              <p className="text-xs text-content-tertiary mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function EmptyCTA({
  message,
  ctaLabel,
  onClick,
}: {
  message: string;
  ctaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-sm text-content-tertiary">{message}</p>
      <Button variant="secondary" size="sm" icon={<ArrowRight size={14} />} iconPosition="right" onClick={onClick}>
        {ctaLabel}
      </Button>
    </div>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-busy="true"
      aria-label="Loading widget data"
      data-testid="dashboard-widget-skeleton"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={32} className="w-full" rounded="md" />
      ))}
    </div>
  );
}

/* ── 1. BOQ Summary ───────────────────────────────────────────────────── */

export function BOQSummaryWidget({ projects }: { projects?: ProjectRef[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('boq_summary');

  const title = t('dashboard.layout.w_boq_summary', { defaultValue: 'BOQ Summary' });
  const subtitle = t('dashboard.boq_summary_subtitle', {
    defaultValue: 'Bill of Quantities health across your projects',
  });
  const icon = <FileSpreadsheet size={16} className="text-content-tertiary" />;

  if (isLoading) {
    return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  }
  if (!payload || payload.total_boqs === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.boq_summary_empty', {
            defaultValue: 'No BOQs yet — create your first to track value and completeness.',
          })}
          ctaLabel={t('dashboard.boq_summary_cta', { defaultValue: 'Open BOQs' })}
          onClick={() => navigate('/boq')}
        />
      </WidgetCard>
    );
  }

  const currency = projects?.[0]?.currency ?? 'EUR';
  const pctMissingQty =
    payload.position_count > 0
      ? Math.round((payload.positions_missing_quantity / payload.position_count) * 100)
      : 0;
  const pctZeroPrice =
    payload.position_count > 0
      ? Math.round((payload.positions_zero_price / payload.position_count) * 100)
      : 0;

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.total_boqs', { defaultValue: 'Total BOQs' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.total_boqs}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.boq_total_value', { defaultValue: 'Total value' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {fmtMoney(payload.total_value_eur, currency)}
          </div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.boq_missing_qty', { defaultValue: 'Missing qty' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{pctMissingQty}%</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.boq_zero_price', { defaultValue: 'Zero priced' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{pctZeroPrice}%</div>
        </div>
      </div>
    </WidgetCard>
  );
}

/* ── 2. Critical Path ─────────────────────────────────────────────────── */

export function CriticalPathWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('schedule_critical');

  const title = t('dashboard.layout.w_schedule', { defaultValue: 'Critical Path' });
  const subtitle = t('dashboard.critical_path_subtitle', {
    defaultValue: 'Tasks at risk on your critical path',
  });
  const icon = <GitBranch size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  const top5 = payload?.top ?? [];
  if (top5.length === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.critical_path_empty', { defaultValue: 'No at-risk schedule items.' })}
          ctaLabel={t('dashboard.critical_path_cta', { defaultValue: 'Open Schedules' })}
          onClick={() => navigate('/schedule')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <ul className="divide-y divide-border-light">
        {top5.map((task) => (
          <li key={task.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">{task.name}</p>
              {task.end_date && (
                <p className="text-xs text-content-tertiary">{task.end_date}</p>
              )}
            </div>
            <Badge variant={task.total_float != null && task.total_float < 0 ? 'error' : 'warning'} size="sm">
              {task.total_float != null
                ? t('dashboard.slack_days', { defaultValue: '{{n}}d slack', n: task.total_float })
                : (task.status ?? '—')}
            </Badge>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* ── 3. Top Risks ─────────────────────────────────────────────────────── */

export function TopRisksWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('risk_top');

  const title = t('dashboard.layout.w_risk', { defaultValue: 'Top Risks' });
  const subtitle = t('dashboard.risk_top_subtitle', {
    defaultValue: 'Highest probability × impact across your register',
  });
  const icon = <ShieldAlert size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  const top5 = payload?.top ?? [];
  if (top5.length === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.risk_top_empty', { defaultValue: 'No risks logged yet.' })}
          ctaLabel={t('dashboard.risk_top_cta', { defaultValue: 'Open Risk Register' })}
          onClick={() => navigate('/risk-register')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <ul className="divide-y divide-border-light">
        {top5.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">{r.title}</p>
              {r.status && <p className="text-xs text-content-tertiary">{r.status}</p>}
            </div>
            <Badge variant={r.score > 12 ? 'error' : r.score > 6 ? 'warning' : 'neutral'} size="sm">
              {t('dashboard.risk_score', { defaultValue: 'Score {{n}}', n: Math.round(r.score) })}
            </Badge>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* ── 4. HSE Scorecard ─────────────────────────────────────────────────── */

export function HSEScoreCardWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('hse_scorecard');

  const title = t('dashboard.layout.w_hse', { defaultValue: 'HSE Scorecard' });
  const subtitle = t('dashboard.hse_subtitle', { defaultValue: 'Health, safety and environment summary' });
  const icon = <HardHat size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  if (!payload || payload.total === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.hse_empty', { defaultValue: 'No incidents logged yet.' })}
          ctaLabel={t('dashboard.hse_cta', { defaultValue: 'Open HSE module' })}
          onClick={() => navigate('/hse')}
        />
      </WidgetCard>
    );
  }

  const lastIncident =
    payload.days_since_last != null
      ? t('dashboard.hse_days_ago', {
          defaultValue: '{{n}}d ago',
          n: payload.days_since_last,
        })
      : '—';

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.hse_last_30d', { defaultValue: 'Last 30 days' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.last_30d}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.hse_near_miss', { defaultValue: 'Near-misses' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.near_miss}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.hse_recordable', { defaultValue: 'Recordables' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.recordables}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.hse_last_incident', { defaultValue: 'Last incident' })}
          </div>
          <div className="text-sm font-medium text-content-primary">{lastIncident}</div>
        </div>
      </div>
    </WidgetCard>
  );
}

/* ── 5. Procurement Pipeline ──────────────────────────────────────────── */

export function ProcurementPipelineWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('procurement_pipeline');

  const title = t('dashboard.layout.w_procurement', { defaultValue: 'Procurement' });
  const subtitle = t('dashboard.procurement_subtitle', { defaultValue: 'RFQ and PO pipeline' });
  const icon = <ShoppingCart size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  if (
    !payload ||
    (payload.rfqs_pending === 0 && payload.pos_issued === 0 && payload.pos_received === 0)
  ) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.procurement_empty', { defaultValue: 'No RFQs or POs yet.' })}
          ctaLabel={t('dashboard.procurement_cta', { defaultValue: 'Open Procurement' })}
          onClick={() => navigate('/procurement')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.procurement_rfqs', { defaultValue: 'RFQs pending' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.rfqs_pending}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.procurement_pos_issued', { defaultValue: 'POs issued' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.pos_issued}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.procurement_pos_received', { defaultValue: 'POs received' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.pos_received}</div>
        </div>
      </div>
    </WidgetCard>
  );
}

/* ── 6. Budget Variance ───────────────────────────────────────────────── */

export function BudgetVarianceWidget({ projects: _projects }: { projects?: ProjectRef[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('budget_variance');

  const title = t('dashboard.layout.w_budget', { defaultValue: 'Budget Variance' });
  const subtitle = t('dashboard.budget_subtitle', { defaultValue: 'Planned vs actual across budgets' });
  const icon = <Wallet size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  const topOver = payload?.top_over ?? [];
  if (topOver.length === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.budget_empty', { defaultValue: 'No over-budget projects.' })}
          ctaLabel={t('dashboard.budget_cta', { defaultValue: 'Open Finance' })}
          onClick={() => navigate('/finance')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <ul className="divide-y divide-border-light">
        {topOver.map((b) => (
          <li key={b.project_id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">{b.project_name}</p>
              <p className="text-xs text-content-tertiary">
                {fmtMoney(b.actual, b.currency)} / {fmtMoney(b.planned, b.currency)}
              </p>
            </div>
            <Badge variant={b.pct > 20 ? 'error' : 'warning'} size="sm">
              <TrendingUp size={11} className="mr-1" />
              +{b.pct}%
            </Badge>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/* ── 7. Change Orders ─────────────────────────────────────────────────── */

export function ChangeOrdersWidget({ projects }: { projects?: ProjectRef[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('change_orders');

  const title = t('dashboard.layout.w_changeorders', { defaultValue: 'Change Orders' });
  const subtitle = t('dashboard.change_orders_subtitle', { defaultValue: 'Open change orders and impact' });
  const icon = <ClipboardList size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  if (!payload || payload.open_count === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.change_orders_empty', { defaultValue: 'No open change orders.' })}
          ctaLabel={t('dashboard.change_orders_cta', { defaultValue: 'Open Change Orders' })}
          onClick={() => navigate('/change-orders')}
        />
      </WidgetCard>
    );
  }

  const currency = payload.currency || projects?.[0]?.currency || 'EUR';

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.change_orders_open', { defaultValue: 'Open' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.open_count}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.change_orders_impact', { defaultValue: 'Total impact' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{fmtMoney(payload.total_impact, currency)}</div>
        </div>
      </div>
      {payload.top_pending.length > 0 && (
        <ul className="divide-y divide-border-light border-t border-border-light">
          {payload.top_pending.map((co) => (
            <li key={co.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content-primary">
                  {co.title || co.code || co.id}
                </p>
                {co.status && <p className="text-xs text-content-tertiary">{co.status}</p>}
              </div>
              <span className="text-xs font-medium text-content-secondary tabular-nums">
                {fmtMoney(co.cost_impact, co.currency || currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/* ── 8. Clash Health ──────────────────────────────────────────────────── */

export function ClashHealthWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('clash_health');

  const title = t('dashboard.layout.w_clash', { defaultValue: 'Clash Health' });
  const subtitle = t('dashboard.clash_subtitle', { defaultValue: 'Open clashes by severity and progress' });
  const icon = <Cog size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  if (!payload || payload.total === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.clash_empty', { defaultValue: 'No clashes detected yet.' })}
          ctaLabel={t('dashboard.clash_cta', { defaultValue: 'Open Clash module' })}
          onClick={() => navigate('/clash')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.clash_high', { defaultValue: 'High' })}
          </div>
          <div className="text-xl font-semibold text-red-600 tabular-nums">{payload.high}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.clash_medium', { defaultValue: 'Medium' })}
          </div>
          <div className="text-xl font-semibold text-amber-600 tabular-nums">{payload.medium}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.clash_low', { defaultValue: 'Low' })}
          </div>
          <div className="text-xl font-semibold text-content-secondary tabular-nums">{payload.low}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mb-1">
            {t('dashboard.clash_resolved', { defaultValue: '% resolved' })}
          </div>
          <div className="text-xl font-semibold tabular-nums">{payload.pct_resolved}%</div>
        </div>
      </div>
    </WidgetCard>
  );
}

/* ── 9. Validation Health ─────────────────────────────────────────────── */

export function ValidationHealthWidget(_props: { projects?: ProjectRef[] } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, byWidget } = useDashboardRollupContext();
  const payload = byWidget('validation_score');

  const title = t('dashboard.layout.w_validation', { defaultValue: 'Validation Health' });
  const subtitle = t('dashboard.validation_subtitle', {
    defaultValue: 'Pass / warn / fail counts across reports',
  });
  const icon = <CheckSquare size={16} className="text-content-tertiary" />;

  if (isLoading) return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows /></WidgetCard>;
  const total = (payload?.passed ?? 0) + (payload?.warnings ?? 0) + (payload?.errors ?? 0);
  if (!payload || total === 0) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.validation_empty', { defaultValue: 'No validation reports yet.' })}
          ctaLabel={t('dashboard.validation_cta', { defaultValue: 'Open Validation' })}
          onClick={() => navigate('/validation')}
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center rounded-md bg-emerald-50 dark:bg-emerald-950/30 py-3">
          <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {payload.passed}
          </div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mt-1">
            {t('dashboard.validation_pass', { defaultValue: 'Passed' })}
          </div>
        </div>
        <div className="text-center rounded-md bg-amber-50 dark:bg-amber-950/30 py-3">
          <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
            {payload.warnings}
          </div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mt-1">
            {t('dashboard.validation_warn', { defaultValue: 'Warnings' })}
          </div>
        </div>
        <div className="text-center rounded-md bg-red-50 dark:bg-red-950/30 py-3">
          <div className="text-2xl font-semibold text-red-700 dark:text-red-300 tabular-nums">
            {payload.errors}
          </div>
          <div className="text-2xs uppercase tracking-wider text-content-tertiary mt-1">
            {t('dashboard.validation_err', { defaultValue: 'Errors' })}
          </div>
        </div>
      </div>
      {payload.avg != null && (
        <button
          type="button"
          onClick={() => navigate('/validation')}
          className="mt-3 flex w-full items-center justify-between text-xs text-content-tertiary hover:text-content-secondary"
        >
          <span>
            {t('dashboard.validation_avg', { defaultValue: 'Average score' })}
            : {Math.round(payload.avg * 100)}%
          </span>
          <ArrowRight size={12} />
        </button>
      )}
    </WidgetCard>
  );
}

/* ── 10. Weather & Site ───────────────────────────────────────────────── */

interface OpenMeteoResponse {
  current_weather?: {
    temperature?: number;
    weathercode?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  61: 'Light rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Light snow',
  80: 'Rain showers',
  95: 'Thunderstorm',
};

export function WeatherSiteWidget({ projects }: { projects?: ProjectRef[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading: rollupLoading, byWidget } = useDashboardRollupContext();
  const rollup = byWidget('weather_site');

  // ── Open-meteo fallback ────────────────────────────────────────────
  // The backend rollup surfaces only DB-cached weather; if it's empty we
  // fall back to the same open-meteo call the legacy widget made. This
  // is a single extra call, no per-project fan-out.
  const firstWithCoords = useMemo(
    () =>
      (projects ?? []).find(
        (p) => p.address?.lat != null && p.address?.lng != null,
      ),
    [projects],
  );

  // Cheap inline fetch — avoid pulling React Query into yet another
  // keyspace for a single weather request. State piggybacks on
  // `useMemo` + a `useState` would be more correct, but we keep this
  // simple: only render the open-meteo block when (a) backend rollup
  // had no data AND (b) the first project has coords. We persist
  // nothing in component state — the user reload re-fetches, which is
  // exactly the old behaviour minus the per-project fan-out.
  const haveBackendData = Boolean(rollup && rollup.temperature_c != null);

  const title = t('dashboard.layout.w_weather', { defaultValue: 'Weather & Site' });
  const subtitle = t('dashboard.weather_subtitle', {
    defaultValue: "Today's conditions at your first project site",
  });
  const icon = <CloudSun size={16} className="text-content-tertiary" />;

  if (rollupLoading) {
    return <WidgetCard icon={icon} title={title} subtitle={subtitle}><LoadingRows count={2} /></WidgetCard>;
  }

  if (!haveBackendData && !firstWithCoords) {
    return (
      <WidgetCard icon={icon} title={title} subtitle={subtitle}>
        <EmptyCTA
          message={t('dashboard.weather_empty', {
            defaultValue: 'Add a project address to see local weather.',
          })}
          ctaLabel={t('dashboard.weather_cta', { defaultValue: 'Open Projects' })}
          onClick={() => navigate('/projects')}
        />
      </WidgetCard>
    );
  }

  return (
    <WeatherSiteBody
      backendData={rollup}
      firstWithCoords={firstWithCoords}
      title={title}
      subtitle={subtitle}
      icon={icon}
    />
  );
}

/** Inner body — keeps the open-meteo fetch isolated to one component. */
function WeatherSiteBody({
  backendData,
  firstWithCoords,
  title,
  subtitle,
  icon,
}: {
  backendData: { temperature_c: number | null; city: string | null; conditions: string | null } | null;
  firstWithCoords: ProjectRef | undefined;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { data: meteoData } = useOpenMeteo({
    lat: firstWithCoords?.address?.lat,
    lng: firstWithCoords?.address?.lng,
    enabled: !backendData?.temperature_c && firstWithCoords != null,
  });

  const temp =
    backendData?.temperature_c ?? meteoData?.temp ?? null;
  const city =
    backendData?.city ?? firstWithCoords?.address?.city ?? firstWithCoords?.name ?? '—';
  const description = backendData?.conditions ?? meteoData?.description ?? '—';
  const high = meteoData?.high;
  const low = meteoData?.low;

  return (
    <WidgetCard icon={icon} title={title} subtitle={subtitle}>
      <div className="flex items-center gap-4">
        <div className="text-4xl font-light tabular-nums">
          {temp != null ? `${Math.round(temp)}°` : '—'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content-primary truncate">{city}</p>
          <p className="text-xs text-content-tertiary truncate">{description}</p>
          {high != null && low != null && (
            <p className="text-2xs text-content-quaternary mt-1">
              {t('dashboard.weather_high_low', {
                defaultValue: 'H {{h}}° / L {{l}}°',
                h: Math.round(high),
                l: Math.round(low),
              })}
            </p>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}

function useOpenMeteo({
  lat,
  lng,
  enabled,
}: {
  lat?: number | null;
  lng?: number | null;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['dashboard-weather-meteo', lat ?? null, lng ?? null],
    enabled: enabled && lat != null && lng != null,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const body = (await resp.json()) as OpenMeteoResponse;
      const code = body.current_weather?.weathercode;
      return {
        temp: body.current_weather?.temperature ?? null,
        description: code != null ? WEATHER_CODE_DESCRIPTIONS[code] ?? `Code ${code}` : null,
        high: body.daily?.temperature_2m_max?.[0],
        low: body.daily?.temperature_2m_min?.[0],
      };
    },
  });
}

/* ── Compatibility re-export so the dashboard page doesn't need to know
 *    each individual import. */
export const NEW_WIDGET_IDS = [
  'boq_summary',
  'validation_score',
  'clash_health',
  'schedule_critical',
  'risk_top',
  'hse_scorecard',
  'procurement_pipeline',
  'budget_variance',
  'change_orders',
  'weather_site',
] as const;
