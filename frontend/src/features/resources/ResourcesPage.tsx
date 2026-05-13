import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users,
  ClipboardList,
  CalendarRange,
  Search,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HardHat,
  Wrench,
  Award,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  EmptyState,
  Breadcrumb,
  SkeletonTable,
  WideModal,
  WideModalSection,
  WideModalField,
} from '@/shared/ui';
import { DateDisplay } from '@/shared/ui/DateDisplay';
import { MoneyDisplay } from '@/shared/ui/MoneyDisplay';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage } from '@/shared/lib/api';
import {
  listResources,
  getResourceDashboard,
  listAssignmentsForResource,
  listBoardConflicts,
  confirmAssignment,
  cancelAssignment,
  proposeAssignment,
  listSkills,
  listWindows,
  listRequests,
  createResource,
  type Resource,
  type ResourceType,
  type ResourceRequest,
  type RequestStatus,
  type Assignment,
  type AssignmentStatus,
  type BoardConflict,
} from './api';
import { projectsApi } from '@/features/projects/api';

type Tab = 'resources' | 'requests' | 'assignments';

const TYPE_VARIANT: Record<ResourceType, 'neutral' | 'blue' | 'success' | 'warning'> = {
  person: 'blue',
  crew: 'success',
  equipment: 'warning',
  subcontractor: 'neutral',
};

const ASSIGN_VARIANT: Record<AssignmentStatus, 'neutral' | 'blue' | 'success' | 'warning' | 'error'> = {
  proposed: 'warning',
  confirmed: 'blue',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'error',
};

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

function isoNow(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfWeek(): string {
  const d = new Date(startOfWeek());
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

/* ─── Page ─── */

export function ResourcesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('resources');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const resourcesQ = useQuery({
    queryKey: ['resources', 'list'],
    queryFn: () => listResources({ limit: 200 }),
  });

  const conflictsQ = useQuery({
    queryKey: ['resources', 'conflicts'],
    queryFn: () =>
      listBoardConflicts({ start: startOfWeek(), end: endOfWeek() }).catch(
        () => [] as BoardConflict[],
      ),
    enabled: tab === 'assignments',
  });

  const allResources: Resource[] = resourcesQ.data ?? [];

  const filteredResources = useMemo(() => {
    const s = search.toLowerCase();
    return allResources.filter((r) => {
      if (typeFilter && r.resource_type !== typeFilter) return false;
      if (!s) return true;
      return (
        r.name.toLowerCase().includes(s) ||
        r.code.toLowerCase().includes(s) ||
        r.notes.toLowerCase().includes(s)
      );
    });
  }, [allResources, search, typeFilter]);

  const isLoading = tab === 'resources' && resourcesQ.isLoading;

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[{ label: t('resources.title', { defaultValue: 'Resources & Crews' }) }]}
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-content-primary">
            {t('resources.title', { defaultValue: 'Resources & Crews' })}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {t('resources.subtitle', {
              defaultValue:
                'People, equipment and crew assignments — propose, confirm, resolve conflicts.',
            })}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'assignments' && (
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setProposeOpen(true)}
            >
              {t('resources.propose', { defaultValue: 'Propose Assignment' })}
            </Button>
          )}
          {tab === 'resources' && (
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setCreateOpen(true)}
            >
              {t('resources.new_resource', { defaultValue: 'New Resource' })}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-light">
        <nav className="flex gap-1 -mb-px">
          {(
            [
              {
                id: 'resources',
                label: t('resources.tab_resources', { defaultValue: 'Resources' }),
                icon: Users,
              },
              {
                id: 'requests',
                label: t('resources.tab_requests', { defaultValue: 'Requests' }),
                icon: ClipboardList,
              },
              {
                id: 'assignments',
                label: t('resources.tab_assignments', { defaultValue: 'Assignments' }),
                icon: CalendarRange,
              },
            ] as { id: Tab; label: string; icon: React.ElementType }[]
          ).map((tabItem) => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => {
                  setTab(tabItem.id);
                  setSearch('');
                  setTypeFilter('');
                }}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  tab === tabItem.id
                    ? 'border-oe-blue text-oe-blue'
                    : 'border-transparent text-content-secondary hover:text-content-primary',
                )}
              >
                <Icon size={14} />
                {tabItem.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === 'resources' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
              />
              <input
                type="text"
                placeholder={t('common.search', { defaultValue: 'Search…' })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={clsx(inputCls, 'pl-8')}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ResourceType | '')}
              className={clsx(inputCls, 'max-w-[200px]')}
            >
              <option value="">
                {t('resources.all_types', { defaultValue: 'All types' })}
              </option>
              <option value="person">
                {t('resources.type_person', { defaultValue: 'Person' })}
              </option>
              <option value="crew">
                {t('resources.type_crew', { defaultValue: 'Crew' })}
              </option>
              <option value="equipment">
                {t('resources.type_equipment', { defaultValue: 'Equipment' })}
              </option>
              <option value="subcontractor">
                {t('resources.type_subcontractor', { defaultValue: 'Subcontractor' })}
              </option>
            </select>
          </div>

          <Card padding="none">
            {isLoading ? (
              <div className="p-4">
                <SkeletonTable rows={8} columns={5} />
              </div>
            ) : (
              <ResourceTable
                rows={filteredResources}
                onSelect={(id) => setSelectedId(id)}
                emptyAction={() => setCreateOpen(true)}
              />
            )}
          </Card>
        </>
      )}

      {tab === 'requests' && <RequestsTab onSelectResource={(id) => setSelectedId(id)} />}

      {tab === 'assignments' && (
        <AssignmentsTab
          resources={allResources}
          conflicts={conflictsQ.data ?? []}
          onSelectResource={(id) => setSelectedId(id)}
        />
      )}

      {selectedId && (
        <ResourceDrawer resourceId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {createOpen && <CreateResourceModal onClose={() => setCreateOpen(false)} />}

      {proposeOpen && (
        <ProposeAssignmentModal
          resources={allResources}
          onClose={() => setProposeOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Resource table ─── */

function ResourceTable({
  rows,
  onSelect,
  emptyAction,
}: {
  rows: Resource[];
  onSelect: (id: string) => void;
  emptyAction: () => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users size={22} />}
        title={t('resources.empty_title', { defaultValue: 'No resources yet' })}
        description={t('resources.empty_desc', {
          defaultValue:
            'Add people, crews and equipment to start planning their assignments.',
        })}
        action={{
          label: t('resources.new_resource', { defaultValue: 'New Resource' }),
          onClick: emptyAction,
        }}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 text-left">
              {t('resources.col_code', { defaultValue: 'Code' })}
            </th>
            <th className="px-4 py-2.5 text-left">
              {t('resources.col_name', { defaultValue: 'Name' })}
            </th>
            <th className="px-4 py-2.5 text-left">
              {t('resources.col_type', { defaultValue: 'Type' })}
            </th>
            <th className="px-4 py-2.5 text-left">
              {t('resources.col_status', { defaultValue: 'Status' })}
            </th>
            <th className="px-4 py-2.5 text-right">
              {t('resources.col_rate', { defaultValue: 'Rate' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="border-t border-border-light hover:bg-surface-secondary cursor-pointer"
            >
              <td className="px-4 py-2 font-mono text-xs text-content-secondary">
                {r.code}
              </td>
              <td className="px-4 py-2 font-medium text-content-primary">{r.name}</td>
              <td className="px-4 py-2">
                <Badge variant={TYPE_VARIANT[r.resource_type]} size="sm">
                  {r.resource_type}
                </Badge>
              </td>
              <td className="px-4 py-2">
                <Badge
                  variant={
                    r.status === 'active'
                      ? 'success'
                      : r.status === 'on_leave'
                        ? 'warning'
                        : 'neutral'
                  }
                  dot
                  size="sm"
                >
                  {r.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right">
                <MoneyDisplay
                  amount={Number(r.default_cost_rate) || 0}
                  currency={r.currency || 'EUR'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Requests tab ─── */
//
// "Resource requests" are demand-side records — a foreman or project
// manager raises a request like "I need 2 carpenters with formwork
// experience next Tuesday-Friday". Dispatchers fulfil them by matching
// an available resource (supply side) → assignment. They are scoped per
// project, so this tab needs a project picker to render real data.
//
// Earlier the tab just showed a "select a project elsewhere" message,
// which made the column feel broken. We now load the user's projects
// directly and let the dispatcher pick one without leaving this page.

function RequestsTab({
  onSelectResource: _,
}: {
  onSelectResource: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('open');

  const projectsQ = useQuery({
    queryKey: ['resources', 'requests-projects'],
    queryFn: () => projectsApi.list(),
    staleTime: 60_000,
  });

  const requestsQ = useQuery({
    queryKey: ['resources', 'requests', projectId, statusFilter],
    queryFn: () =>
      listRequests({
        project_id: projectId,
        status: statusFilter || undefined,
        limit: 200,
      }),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-content-secondary mb-1">
              {t('resources.requests_project_label', {
                defaultValue: 'Project',
              })}
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputCls}
              disabled={projectsQ.isLoading}
            >
              <option value="">
                — {t('resources.requests_project_picker_placeholder', {
                  defaultValue: 'Select a project to see its requests…',
                })} —
              </option>
              {(projectsQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-content-secondary mb-1">
              {t('resources.requests_status_label', {
                defaultValue: 'Status',
              })}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')}
              className={inputCls}
            >
              <option value="">{t('resources.status_all', { defaultValue: 'All' })}</option>
              <option value="open">{t('resources.req_status_open', { defaultValue: 'Open' })}</option>
              <option value="fulfilled">{t('resources.req_status_fulfilled', { defaultValue: 'Fulfilled' })}</option>
              <option value="cancelled">{t('resources.req_status_cancelled', { defaultValue: 'Cancelled' })}</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-content-secondary leading-relaxed">
          {t('resources.requests_explainer', {
            defaultValue:
              'Resource requests are "demand-side" records — foremen and PMs raise them when they need people or equipment on a specific date range. Dispatchers fulfil each request by matching one of your resources to it; that creates an assignment row in the Assignments tab.',
          })}
        </p>
      </Card>

      {!projectId ? (
        <Card padding="md">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={t('resources.requests_pick_project_title', {
              defaultValue: 'Pick a project above to load its requests',
            })}
            description={t('resources.requests_pick_project_desc', {
              defaultValue:
                'Requests are project-scoped — choose a project to see the open queue and start fulfilling.',
            })}
          />
        </Card>
      ) : requestsQ.isLoading ? (
        <Card padding="md">
          <SkeletonTable rows={6} columns={5} />
        </Card>
      ) : (requestsQ.data ?? []).length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={t('resources.requests_none_title', {
              defaultValue: 'No requests match the current filter',
            })}
            description={t('resources.requests_none_desc', {
              defaultValue:
                'Try switching the status filter to "All" to see fulfilled or cancelled requests.',
            })}
          />
        </Card>
      ) : (
        <Card padding="none">
          <RequestsTable rows={requestsQ.data ?? []} />
        </Card>
      )}
    </div>
  );
}

function RequestsTable({ rows }: { rows: ResourceRequest[] }) {
  const { t } = useTranslation();
  const REQUEST_STATUS_VARIANT: Record<
    RequestStatus,
    'neutral' | 'blue' | 'success' | 'warning' | 'error'
  > = {
    open: 'warning',
    fulfilled: 'success',
    cancelled: 'neutral',
  };
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-secondary/50 border-b border-border-light">
          <tr className="text-xs uppercase text-content-secondary">
            <th className="text-left px-4 py-2 font-medium">
              {t('resources.req_col_title', { defaultValue: 'Title' })}
            </th>
            <th className="text-left px-4 py-2 font-medium">
              {t('resources.req_col_window', { defaultValue: 'Window' })}
            </th>
            <th className="text-left px-4 py-2 font-medium">
              {t('resources.req_col_qty', { defaultValue: 'Qty' })}
            </th>
            <th className="text-left px-4 py-2 font-medium">
              {t('resources.req_col_skills', { defaultValue: 'Skills' })}
            </th>
            <th className="text-left px-4 py-2 font-medium">
              {t('common.status', { defaultValue: 'Status' })}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-surface-secondary/30">
              <td className="px-4 py-2.5">
                <div className="font-medium text-content-primary truncate max-w-xs">
                  {r.title}
                </div>
                {r.description && (
                  <div className="text-xs text-content-tertiary truncate max-w-xs">
                    {r.description}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-content-secondary tabular-nums whitespace-nowrap">
                <DateDisplay value={r.start_at} />
                {' → '}
                <DateDisplay value={r.end_at} />
              </td>
              <td className="px-4 py-2.5 tabular-nums">{r.quantity}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {r.required_skills.slice(0, 4).map((s) => (
                    <Badge key={s} variant="neutral">{s}</Badge>
                  ))}
                  {r.required_skills.length > 4 && (
                    <span className="text-xs text-content-tertiary">
                      +{r.required_skills.length - 4}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={REQUEST_STATUS_VARIANT[r.status]}>{r.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Assignments tab ─── */

function AssignmentsTab({
  resources,
  conflicts,
  onSelectResource,
}: {
  resources: Resource[];
  conflicts: BoardConflict[];
  onSelectResource: (id: string) => void;
}) {
  const { t } = useTranslation();
  const idToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of resources) m[r.id] = r.name;
    return m;
  }, [resources]);

  // Fetch assignments per resource (limited to first 50 resources to keep
  // request count bounded). This is a dispatcher-style overview.
  const samples = resources.slice(0, 50);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <Card>
          <div className="p-4 border-b border-border-light">
            <h3 className="text-sm font-semibold">
              {t('resources.this_week', { defaultValue: 'This week & upcoming' })}
            </h3>
          </div>
          <div className="divide-y divide-border-light">
            {samples.length === 0 ? (
              <div className="p-8 text-center text-sm text-content-tertiary">
                {t('resources.no_data', { defaultValue: 'No resources to schedule.' })}
              </div>
            ) : (
              samples.map((r) => (
                <ResourceAssignmentRow
                  key={r.id}
                  resource={r}
                  onSelect={() => onSelectResource(r.id)}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      <div>
        <Card>
          <div className="p-4 border-b border-border-light flex items-center gap-2">
            <AlertTriangle size={14} className="text-semantic-warning" />
            <h3 className="text-sm font-semibold">
              {t('resources.conflicts', { defaultValue: 'Conflicts' })}
            </h3>
            <span className="ms-auto text-xs text-content-tertiary tabular-nums">
              {conflicts.length}
            </span>
          </div>
          {conflicts.length === 0 ? (
            <div className="p-6 text-center text-sm text-content-tertiary">
              {t('resources.conflicts_none', { defaultValue: 'No conflicts this week.' })}
            </div>
          ) : (
            <ul className="divide-y divide-border-light">
              {conflicts.map((c) => (
                <li
                  key={c.resource_id}
                  className="p-4 hover:bg-surface-secondary cursor-pointer"
                  onClick={() => onSelectResource(c.resource_id)}
                >
                  <p className="text-sm font-medium text-content-primary">
                    {idToName[c.resource_id] || c.resource_name}
                  </p>
                  <p className="mt-0.5 text-xs text-content-secondary">
                    {c.conflicts.length}{' '}
                    {t('resources.overlap_count', { defaultValue: 'overlap(s)' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ResourceAssignmentRow({
  resource,
  onSelect,
}: {
  resource: Resource;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['resources', 'assignments', resource.id],
    queryFn: () => listAssignmentsForResource(resource.id, { limit: 5 }),
    staleTime: 30_000,
  });
  const items = q.data ?? [];
  const active = items.filter((a) => a.status === 'in_progress' || a.status === 'confirmed');
  const upcoming = items.filter((a) => a.status === 'proposed');

  return (
    <div className="p-3 hover:bg-surface-secondary cursor-pointer" onClick={onSelect}>
      <div className="flex items-center gap-2">
        <Badge variant={TYPE_VARIANT[resource.resource_type]} size="sm">
          {resource.resource_type}
        </Badge>
        <span className="font-medium text-sm">{resource.name}</span>
        <span className="ms-auto text-xs text-content-tertiary tabular-nums">
          {items.length} {t('resources.assignments', { defaultValue: 'assignments' })}
        </span>
      </div>
      {(active.length > 0 || upcoming.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {active.map((a) => (
            <Badge key={a.id} variant={ASSIGN_VARIANT[a.status]} size="sm">
              {a.status} · <DateDisplay value={a.start_at} />
            </Badge>
          ))}
          {upcoming.map((a) => (
            <Badge key={a.id} variant={ASSIGN_VARIANT[a.status]} size="sm">
              {a.status} · <DateDisplay value={a.start_at} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Resource drawer ─── */

function ResourceDrawer({
  resourceId,
  onClose,
}: {
  resourceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const dashQ = useQuery({
    queryKey: ['resources', 'dashboard', resourceId],
    queryFn: () => getResourceDashboard(resourceId),
  });

  const timeOffQ = useQuery({
    queryKey: ['resources', 'time-off', resourceId],
    queryFn: () => listWindows(resourceId),
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources', 'dashboard', resourceId] });
      addToast({
        type: 'success',
        title: t('resources.confirmed_ok', { defaultValue: 'Assignment confirmed' }),
      });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelAssignment(id, 'declined'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources', 'dashboard', resourceId] });
      addToast({
        type: 'success',
        title: t('resources.declined_ok', { defaultValue: 'Assignment declined' }),
      });
    },
    onError: (err) => addToast({ type: 'error', title: getErrorMessage(err) }),
  });

  const data = dashQ.data;
  const timeOff = (timeOffQ.data ?? []).filter(
    (w) => w.window_type !== 'available',
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative h-full w-full max-w-xl overflow-y-auto bg-surface-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-elevated px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">
              {data?.resource.name ?? t('common.loading', { defaultValue: 'Loading…' })}
            </h2>
            {data && (
              <p className="text-xs text-content-tertiary font-mono">
                {data.resource.code}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-surface-secondary"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {dashQ.isLoading && <SkeletonTable rows={5} columns={2} />}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field
                  label={t('resources.col_type')}
                  value={
                    <Badge variant={TYPE_VARIANT[data.resource.resource_type]} size="sm">
                      {data.resource.resource_type}
                    </Badge>
                  }
                />
                <Field
                  label={t('resources.col_status')}
                  value={
                    <Badge
                      variant={data.resource.status === 'active' ? 'success' : 'neutral'}
                      dot
                      size="sm"
                    >
                      {data.resource.status}
                    </Badge>
                  }
                />
                <Field
                  label={t('resources.col_rate')}
                  value={
                    <MoneyDisplay
                      amount={Number(data.resource.default_cost_rate) || 0}
                      currency={data.resource.currency || 'EUR'}
                    />
                  }
                />
                <Field
                  label={t('resources.utilization', { defaultValue: 'Utilization (30d)' })}
                  value={
                    data.utilization_30d
                      ? `${data.utilization_30d.utilization_percent.toFixed(0)}%`
                      : '—'
                  }
                />
              </div>

              <Section
                title={t('resources.current_assignments', {
                  defaultValue: 'Current assignments',
                })}
                icon={<HardHat size={14} />}
              >
                {data.active_assignments.length === 0 ? (
                  <EmptyHint
                    text={t('resources.no_active', { defaultValue: 'None active.' })}
                  />
                ) : (
                  <AssignmentTable
                    rows={data.active_assignments}
                    onConfirm={(id) => confirmMut.mutate(id)}
                    onDecline={(id) => cancelMut.mutate(id)}
                    busy={confirmMut.isPending || cancelMut.isPending}
                  />
                )}
              </Section>

              <Section
                title={t('resources.future_commitments', {
                  defaultValue: 'Future commitments',
                })}
                icon={<CalendarRange size={14} />}
              >
                {data.upcoming_assignments.length === 0 ? (
                  <EmptyHint
                    text={t('resources.no_upcoming', { defaultValue: 'No upcoming work.' })}
                  />
                ) : (
                  <AssignmentTable
                    rows={data.upcoming_assignments}
                    onConfirm={(id) => confirmMut.mutate(id)}
                    onDecline={(id) => cancelMut.mutate(id)}
                    busy={confirmMut.isPending || cancelMut.isPending}
                  />
                )}
              </Section>

              <Section
                title={t('resources.time_off', { defaultValue: 'Time off' })}
                icon={<CalendarRange size={14} />}
              >
                {timeOff.length === 0 ? (
                  <EmptyHint
                    text={t('resources.no_time_off', { defaultValue: 'No time off logged.' })}
                  />
                ) : (
                  <ul className="divide-y divide-border-light text-sm">
                    {timeOff.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="text-content-secondary">
                          {w.window_type}
                          {w.note ? ` · ${w.note}` : ''}
                        </span>
                        <span className="text-content-tertiary text-xs">
                          <DateDisplay value={w.start_at} /> →{' '}
                          <DateDisplay value={w.end_at} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                title={t('resources.certifications', { defaultValue: 'Certifications' })}
                icon={<Award size={14} />}
              >
                {data.certifications.length === 0 ? (
                  <EmptyHint
                    text={t('resources.no_certs', { defaultValue: 'No certifications.' })}
                  />
                ) : (
                  <ul className="divide-y divide-border-light text-sm">
                    {data.certifications.map((c) => (
                      <li key={c.id} className="py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.cert_type}</span>
                          <Badge
                            variant={c.status === 'valid' ? 'success' : 'warning'}
                            size="sm"
                          >
                            {c.status}
                          </Badge>
                        </div>
                        {c.valid_until && (
                          <p className="text-xs text-content-tertiary mt-0.5">
                            {t('resources.valid_until', { defaultValue: 'Valid until' })}:{' '}
                            {c.valid_until}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="rounded-md bg-surface-secondary/60 p-3 text-xs text-content-tertiary">{text}</p>;
}

function AssignmentTable({
  rows,
  onConfirm,
  onDecline,
  busy,
}: {
  rows: Assignment[];
  onConfirm: (id: string) => void;
  onDecline: (id: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded border border-border-light">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary text-content-tertiary text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">
              {t('resources.start', { defaultValue: 'Start' })}
            </th>
            <th className="px-3 py-2 text-left">
              {t('resources.end', { defaultValue: 'End' })}
            </th>
            <th className="px-3 py-2 text-left">
              {t('resources.alloc', { defaultValue: 'Alloc' })}
            </th>
            <th className="px-3 py-2 text-left">
              {t('resources.col_status', { defaultValue: 'Status' })}
            </th>
            <th className="px-3 py-2 text-right">
              {t('resources.actions', { defaultValue: 'Actions' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-border-light">
              <td className="px-3 py-1.5 text-xs">
                <DateDisplay value={a.start_at} />
              </td>
              <td className="px-3 py-1.5 text-xs">
                <DateDisplay value={a.end_at} />
              </td>
              <td className="px-3 py-1.5 text-xs tabular-nums">
                {a.allocation_percent}%
              </td>
              <td className="px-3 py-1.5">
                <Badge variant={ASSIGN_VARIANT[a.status]} dot size="sm">
                  {a.status}
                </Badge>
              </td>
              <td className="px-3 py-1.5 text-right">
                {a.status === 'proposed' && (
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<CheckCircle2 size={12} />}
                      onClick={() => onConfirm(a.id)}
                      disabled={busy}
                    >
                      {t('resources.confirm', { defaultValue: 'Confirm' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<XCircle size={12} />}
                      onClick={() => onDecline(a.id)}
                      disabled={busy}
                    >
                      {t('resources.decline', { defaultValue: 'Decline' })}
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-content-primary">{value}</p>
    </div>
  );
}

/* ─── Modals ─── */

function CreateResourceModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    resource_type: 'person' as ResourceType,
    default_cost_rate: '0',
    currency: 'EUR',
  });

  async function submit() {
    if (!form.code || !form.name) {
      addToast({
        type: 'error',
        title: t('resources.required_missing', {
          defaultValue: 'Code and name are required.',
        }),
      });
      return;
    }
    setBusy(true);
    try {
      await createResource({
        code: form.code,
        name: form.name,
        resource_type: form.resource_type,
        default_cost_rate: Number(form.default_cost_rate) || 0,
        currency: form.currency,
      });
      addToast({
        type: 'success',
        title: t('resources.created_ok', { defaultValue: 'Resource created' }),
      });
      qc.invalidateQueries({ queryKey: ['resources', 'list'] });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <WideModal
      open
      onClose={onClose}
      busy={busy}
      size="lg"
      title={t('resources.new_resource', { defaultValue: 'New Resource' })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            icon={busy ? <Loader2 size={14} /> : <Plus size={14} />}
          >
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </>
      }
    >
      <WideModalSection columns={2}>
        <WideModalField label={t('resources.code', { defaultValue: 'Code' })} required>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className={inputCls}
            placeholder="e.g. CR-001"
          />
        </WideModalField>
        <WideModalField label={t('resources.name', { defaultValue: 'Name' })} required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField label={t('resources.col_type', { defaultValue: 'Type' })} span={2}>
          <select
            value={form.resource_type}
            onChange={(e) =>
              setForm({ ...form, resource_type: e.target.value as ResourceType })
            }
            className={inputCls}
          >
            <option value="person">{t('resources.type_person', { defaultValue: 'Person' })}</option>
            <option value="crew">{t('resources.type_crew', { defaultValue: 'Crew' })}</option>
            <option value="equipment">
              {t('resources.type_equipment', { defaultValue: 'Equipment' })}
            </option>
            <option value="subcontractor">
              {t('resources.type_subcontractor', { defaultValue: 'Subcontractor' })}
            </option>
          </select>
        </WideModalField>
        <WideModalField label={t('resources.rate', { defaultValue: 'Rate' })}>
          <input
            type="number"
            value={form.default_cost_rate}
            onChange={(e) =>
              setForm({ ...form, default_cost_rate: e.target.value })
            }
            className={inputCls}
          />
        </WideModalField>
        <WideModalField label={t('common.currency', { defaultValue: 'Currency' })}>
          <input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            maxLength={3}
            className={inputCls}
          />
        </WideModalField>
      </WideModalSection>
    </WideModal>
  );
}

function ProposeAssignmentModal({
  resources,
  onClose,
}: {
  resources: Resource[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);

  const skillsQ = useQuery({
    queryKey: ['resources', 'skills'],
    queryFn: () => listSkills({ limit: 200 }).catch(() => []),
  });

  const [form, setForm] = useState({
    resource_id: resources[0]?.id || '',
    start_at: isoNow(0).slice(0, 16),
    end_at: isoNow(1).slice(0, 16),
    allocation_percent: 100,
    notes: '',
    required_skills: [] as string[],
  });

  async function submit() {
    if (!form.resource_id) {
      addToast({
        type: 'error',
        title: t('resources.pick_resource', { defaultValue: 'Pick a resource.' }),
      });
      return;
    }
    setBusy(true);
    try {
      await proposeAssignment({
        resource_id: form.resource_id,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        allocation_percent: form.allocation_percent,
        required_skills: form.required_skills,
        notes: form.notes,
      });
      addToast({
        type: 'success',
        title: t('resources.proposed_ok', { defaultValue: 'Assignment proposed' }),
      });
      qc.invalidateQueries({ queryKey: ['resources'] });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <WideModal
      open
      onClose={onClose}
      busy={busy}
      size="lg"
      title={t('resources.propose', { defaultValue: 'Propose Assignment' })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            icon={busy ? <Loader2 size={14} /> : <CheckCircle2 size={14} />}
          >
            {t('resources.propose', { defaultValue: 'Propose' })}
          </Button>
        </>
      }
    >
      <WideModalSection columns={2}>
        <WideModalField
          label={t('resources.resource', { defaultValue: 'Resource' })}
          required
          span={2}
        >
          <select
            value={form.resource_id}
            onChange={(e) => setForm({ ...form, resource_id: e.target.value })}
            className={inputCls}
          >
            <option value="">
              — {t('common.select', { defaultValue: 'Select' })} —
            </option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField label={t('resources.start', { defaultValue: 'Start' })}>
          <input
            type="datetime-local"
            value={form.start_at}
            onChange={(e) => setForm({ ...form, start_at: e.target.value })}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField label={t('resources.end', { defaultValue: 'End' })}>
          <input
            type="datetime-local"
            value={form.end_at}
            onChange={(e) => setForm({ ...form, end_at: e.target.value })}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('resources.allocation', { defaultValue: 'Allocation %' })}
          span={2}
        >
          <input
            type="number"
            min={0}
            max={100}
            value={form.allocation_percent}
            onChange={(e) =>
              setForm({ ...form, allocation_percent: Number(e.target.value) || 0 })
            }
            className={inputCls}
          />
        </WideModalField>
      </WideModalSection>

      {(skillsQ.data?.length ?? 0) > 0 && (
        <WideModalSection
          title={t('resources.required_skills', { defaultValue: 'Required skills' })}
          columns={1}
        >
          <WideModalField label={t('resources.required_skills_pick', { defaultValue: 'Pick relevant skills' })}>
            <div className="flex flex-wrap gap-1.5">
              {(skillsQ.data ?? []).slice(0, 20).map((s) => {
                const checked = form.required_skills.includes(s.id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() =>
                      setForm({
                        ...form,
                        required_skills: checked
                          ? form.required_skills.filter((x) => x !== s.id)
                          : [...form.required_skills, s.id],
                      })
                    }
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs border transition-colors',
                      checked
                        ? 'border-oe-blue bg-oe-blue/10 text-oe-blue'
                        : 'border-border-light text-content-secondary hover:bg-surface-secondary',
                    )}
                  >
                    <Wrench size={10} className="inline mr-1" />
                    {s.name}
                  </button>
                );
              })}
            </div>
          </WideModalField>
        </WideModalSection>
      )}
    </WideModal>
  );
}

