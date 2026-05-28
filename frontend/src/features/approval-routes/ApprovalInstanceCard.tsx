// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
//
// ApprovalInstanceCard — drop-in approval-workflow surface.
//
// Any feature (markups, submittals, RFIs, files, …) can mount this and
// pass ``targetKind`` + ``targetId`` to render the running approval state
// for that record. Three rendering modes:
//
//   1. No instance exists for the target →
//      compact "Start approval" card (only shown when a route template
//      exists for this kind, otherwise nothing renders — the consumer
//      keeps the slot clean).
//   2. Running / closed instance(s) exist →
//      step-ladder with status pills + decision actions for the active
//      approver.
//   3. Loading / error → skeleton + recovery card.
//
// The card is self-contained: it owns its data fetch, mutations, and
// toasts, so callers add it with two props and stop.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Ban,
} from 'lucide-react';
import clsx from 'clsx';

import { Badge, Button, Card, Skeleton } from '@/shared/ui';
import { apiGet } from '@/shared/lib/api';
import { useToastStore } from '@/stores/useToastStore';
import {
  approvalRoutesKeys,
  cancelInstance,
  decideInstance,
  listInstances,
  listRoutes,
  startInstance,
} from './api';
import type {
  ApprovalInstance,
  InstanceStep,
  InstanceStepStatus,
  StepDecision,
} from './types';

interface MeResponse {
  id?: string;
  user_id?: string;
  email?: string;
  role?: string;
}

const STATUS_BADGE: Record<
  InstanceStepStatus,
  { variant: 'neutral' | 'blue' | 'success' | 'warning' | 'error'; icon: typeof Circle }
> = {
  pending: { variant: 'neutral', icon: Circle },
  active: { variant: 'blue', icon: Clock },
  approved: { variant: 'success', icon: CheckCircle2 },
  rejected: { variant: 'error', icon: XCircle },
  skipped: { variant: 'neutral', icon: Ban },
};

export interface ApprovalInstanceCardProps {
  /** Target kind discriminator — e.g. "markup", "submittal", "rfi". */
  targetKind: string;
  /** UUID of the specific target row. */
  targetId: string;
  /** Project the target belongs to — required when starting a new
   *  instance so the route picker can scope by project_id. */
  projectId?: string | null;
  /** Show even when no instance exists and no route template is
   *  configured (renders a muted "no workflow" hint instead of nothing).
   *  Default: false — empty slots collapse cleanly. */
  showEmpty?: boolean;
  /** Extra class applied to the outer Card wrapper. */
  className?: string;
}

export function ApprovalInstanceCard({
  targetKind,
  targetId,
  projectId,
  showEmpty = false,
  className,
}: ApprovalInstanceCardProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [expanded, setExpanded] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [showStartPicker, setShowStartPicker] = useState(false);

  // Live current-user lookup so we can decide whether to show the
  // approve/reject buttons. ``staleTime`` is generous because role/id
  // do not change mid-session.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<MeResponse>('/v1/users/me/'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const currentUserId = me?.id ?? me?.user_id ?? null;

  const instancesQuery = useQuery({
    queryKey: approvalRoutesKeys.instances(targetKind, targetId),
    queryFn: () => listInstances({ targetKind, targetId }),
    enabled: Boolean(targetKind && targetId),
    staleTime: 10_000,
  });

  // Only fetch route templates when we need to show the start picker —
  // saves a request on the hot read path where an instance already
  // exists.
  const hasInstance = (instancesQuery.data ?? []).length > 0;
  const wantsRoutes = !hasInstance && (showStartPicker || showEmpty);
  const routesQuery = useQuery({
    queryKey: approvalRoutesKeys.routes(projectId, targetKind),
    queryFn: () => listRoutes({ projectId, targetKind }),
    enabled: Boolean(targetKind && wantsRoutes),
    staleTime: 60_000,
  });

  const startMut = useMutation({
    mutationFn: (routeId: string) =>
      startInstance({ route_id: routeId, target_kind: targetKind, target_id: targetId }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: approvalRoutesKeys.instances(targetKind, targetId),
      });
      setShowStartPicker(false);
      addToast({
        type: 'success',
        title: t('approvalRoutes.toast_started', { defaultValue: 'Approval started' }),
      });
    },
    onError: (e: Error) => {
      addToast({
        type: 'error',
        title: t('common.error', { defaultValue: 'Error' }),
        message: e.message,
      });
    },
  });

  const decideMut = useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      decision,
      comment,
    }: {
      instanceId: string;
      stepId: string;
      decision: StepDecision;
      comment: string;
    }) =>
      decideInstance(instanceId, {
        step_id: stepId,
        decision,
        comment: comment.trim() || null,
      }),
    onSuccess: (updated, vars) => {
      void qc.invalidateQueries({
        queryKey: approvalRoutesKeys.instances(targetKind, targetId),
      });
      setComments((prev) => {
        const next = { ...prev };
        delete next[vars.stepId];
        return next;
      });
      addToast({
        type: 'success',
        title:
          updated.status === 'approved'
            ? t('approvalRoutes.toast_approved', { defaultValue: 'Approved' })
            : updated.status === 'rejected'
              ? t('approvalRoutes.toast_rejected', { defaultValue: 'Rejected' })
              : t('approvalRoutes.toast_recorded', {
                  defaultValue: 'Decision recorded',
                }),
      });
    },
    onError: (e: Error) =>
      addToast({
        type: 'error',
        title: t('common.error', { defaultValue: 'Error' }),
        message: e.message,
      }),
  });

  const cancelMut = useMutation({
    mutationFn: (instanceId: string) => cancelInstance(instanceId, {}),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: approvalRoutesKeys.instances(targetKind, targetId),
      });
      addToast({
        type: 'success',
        title: t('approvalRoutes.toast_cancelled', {
          defaultValue: 'Approval cancelled',
        }),
      });
    },
    onError: (e: Error) =>
      addToast({
        type: 'error',
        title: t('common.error', { defaultValue: 'Error' }),
        message: e.message,
      }),
  });

  /* ── Render branches ────────────────────────────────────────────── */

  if (instancesQuery.isLoading) {
    return (
      <Card padding="sm" className={className} data-testid="approval-instance-card-loading">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-full" />
      </Card>
    );
  }

  if (instancesQuery.isError) {
    return (
      <Card padding="sm" className={className}>
        <p className="text-sm text-semantic-error">
          {t('approvalRoutes.load_error', {
            defaultValue: 'Failed to load approval workflow.',
          })}
        </p>
      </Card>
    );
  }

  const instances = instancesQuery.data ?? [];
  const activeInstance = instances.find(
    (i) => i.status === 'in_progress' || i.status === 'pending',
  );
  const historicalInstances = instances.filter((i) => i !== activeInstance);

  // No running instance — render the "start" affordance.
  if (!activeInstance) {
    const availableRoutes = routesQuery.data ?? [];
    const canStart = availableRoutes.length > 0;
    if (!showEmpty && !showStartPicker && !canStart && instances.length === 0) {
      // Lazy mode: nothing to show until user clicks the button below.
      return (
        <Card
          padding="sm"
          className={className}
          data-testid="approval-instance-card-empty-lazy"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-content-tertiary">
              {t('approvalRoutes.noActiveInstance', {
                defaultValue: 'No approval workflow running.',
              })}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowStartPicker(true)}
              icon={<PlayCircle size={14} />}
            >
              {t('approvalRoutes.startApproval', { defaultValue: 'Start approval' })}
            </Button>
          </div>
          {historicalInstances.length > 0 && (
            <HistoryList instances={historicalInstances} />
          )}
        </Card>
      );
    }

    return (
      <Card padding="sm" className={className} data-testid="approval-instance-card-empty">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content-primary">
              {t('approvalRoutes.startApproval', {
                defaultValue: 'Start approval',
              })}
            </p>
            {!canStart && (
              <p className="mt-0.5 text-xs text-content-tertiary">
                {t('approvalRoutes.noRoutesConfigured', {
                  defaultValue:
                    'No approval route configured for this kind yet. Create one under Settings → Approval Routes.',
                })}
              </p>
            )}
          </div>
        </div>

        {canStart && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {availableRoutes.map((route) => (
              <Button
                key={route.id}
                size="sm"
                variant="primary"
                onClick={() => startMut.mutate(route.id)}
                loading={startMut.isPending && startMut.variables === route.id}
                disabled={startMut.isPending}
                icon={<PlayCircle size={14} />}
              >
                {route.name}
              </Button>
            ))}
          </div>
        )}

        {historicalInstances.length > 0 && (
          <HistoryList instances={historicalInstances} />
        )}
      </Card>
    );
  }

  // Running instance.
  const activeStepIndex =
    activeInstance.current_step_index >= 0
      ? activeInstance.current_step_index
      : activeInstance.steps.findIndex((s) => s.status === 'active');

  return (
    <Card padding="sm" className={className} data-testid="approval-instance-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-content-primary truncate">
            {activeInstance.route_name ||
              t('approvalRoutes.title', { defaultValue: 'Approval' })}
          </p>
          <InstanceStatusBadge status={activeInstance.status} />
        </div>
        <button
          onClick={() => setExpanded((p) => !p)}
          className="p-1 rounded-md hover:bg-surface-secondary text-content-tertiary"
          aria-label={
            expanded
              ? t('common.collapse', { defaultValue: 'Collapse' })
              : t('common.expand', { defaultValue: 'Expand' })
          }
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {activeInstance.steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              index={idx}
              total={activeInstance.steps.length}
              isCurrent={idx === activeStepIndex}
              currentUserId={currentUserId}
              comment={comments[step.id] ?? ''}
              onCommentChange={(value) =>
                setComments((p) => ({ ...p, [step.id]: value }))
              }
              onDecide={(decision) =>
                decideMut.mutate({
                  instanceId: activeInstance.id,
                  stepId: step.id,
                  decision,
                  comment: comments[step.id] ?? '',
                })
              }
              deciding={
                decideMut.isPending &&
                decideMut.variables?.stepId === step.id
              }
            />
          ))}

          <div className="flex items-center justify-end pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancelMut.mutate(activeInstance.id)}
              loading={cancelMut.isPending}
              icon={<Ban size={13} />}
            >
              {t('approvalRoutes.cancel', { defaultValue: 'Cancel workflow' })}
            </Button>
          </div>
        </div>
      )}

      {historicalInstances.length > 0 && (
        <HistoryList instances={historicalInstances} />
      )}
    </Card>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function InstanceStatusBadge({ status }: { status: ApprovalInstance['status'] }) {
  const { t } = useTranslation();
  const variant: 'neutral' | 'blue' | 'success' | 'warning' | 'error' =
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'error'
        : status === 'cancelled'
          ? 'neutral'
          : 'blue';
  const label = t(`approvalRoutes.status_${status}`, {
    defaultValue:
      status === 'in_progress'
        ? 'In progress'
        : status.charAt(0).toUpperCase() + status.slice(1),
  });
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

interface StepRowProps {
  step: InstanceStep;
  index: number;
  total: number;
  isCurrent: boolean;
  currentUserId: string | null;
  comment: string;
  onCommentChange: (value: string) => void;
  onDecide: (decision: StepDecision) => void;
  deciding: boolean;
}

function StepRow({
  step,
  index,
  total,
  isCurrent,
  currentUserId,
  comment,
  onCommentChange,
  onDecide,
  deciding,
}: StepRowProps) {
  const { t } = useTranslation();
  const cfg = STATUS_BADGE[step.status] ?? STATUS_BADGE.pending;
  const StatusIcon = cfg.icon;

  // The current user can act when (a) the step is active, and (b) they
  // appear in the assignees list with no decision yet. ``approver_user_id``
  // covers the user-pinned case; ``approver_role`` is expanded to a
  // populated assignees list by the backend at start-time.
  const myAssignment = useMemo(() => {
    if (!currentUserId) return null;
    return step.assignees.find((a) => a.user_id === currentUserId) ?? null;
  }, [step.assignees, currentUserId]);
  const canAct = isCurrent && myAssignment && myAssignment.decision === null;

  const approverLabel =
    step.approver_role ||
    (step.assignees.length > 0
      ? step.assignees
          .map((a) => a.user_name || a.user_email || a.user_id)
          .join(', ')
      : t('approvalRoutes.approver_unassigned', { defaultValue: 'Unassigned' }));

  return (
    <div
      className={clsx(
        'rounded-lg border px-3 py-2 transition-colors',
        isCurrent
          ? 'border-oe-blue/60 bg-oe-blue-subtle/40'
          : 'border-border-light bg-surface-primary',
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIcon
          size={14}
          className={clsx(
            'shrink-0',
            step.status === 'approved' && 'text-semantic-success',
            step.status === 'rejected' && 'text-semantic-error',
            step.status === 'active' && 'text-oe-blue',
            step.status === 'pending' && 'text-content-tertiary',
            step.status === 'skipped' && 'text-content-tertiary',
          )}
        />
        <span className="text-xs font-medium text-content-secondary tabular-nums">
          {t('approvalRoutes.step_n_of_m', {
            defaultValue: 'Step {{n}}/{{m}}',
            n: index + 1,
            m: total,
          })}
        </span>
        <span className="text-sm text-content-primary truncate">
          {approverLabel}
        </span>
        <Badge variant={cfg.variant} size="sm" className="ml-auto">
          {t(`approvalRoutes.step_status_${step.status}`, {
            defaultValue: step.status,
          })}
        </Badge>
      </div>

      <p className="mt-1 text-2xs text-content-tertiary">
        {t(`approvalRoutes.mode_${step.mode}`, {
          defaultValue:
            step.mode === 'all'
              ? 'All approvers'
              : step.mode === 'any'
                ? 'Any approver'
                : 'Majority',
        })}
        {step.sla_hours != null && (
          <>
            {' · '}
            {t('approvalRoutes.sla_hours_value', {
              defaultValue: 'SLA: {{h}}h',
              h: step.sla_hours,
            })}
          </>
        )}
      </p>

      {canAct && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder={t('approvalRoutes.commentPlaceholder', {
              defaultValue: 'Optional comment…',
            })}
            rows={2}
            className="w-full rounded-md border border-border bg-surface-primary px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid={`approval-comment-${step.id}`}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDecide('reject')}
              loading={deciding}
              icon={<XCircle size={13} />}
              data-testid={`approval-reject-${step.id}`}
            >
              {t('approvalRoutes.rejectButton', { defaultValue: 'Reject' })}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onDecide('approve')}
              loading={deciding}
              icon={<CheckCircle2 size={13} />}
              data-testid={`approval-approve-${step.id}`}
            >
              {t('approvalRoutes.approveButton', { defaultValue: 'Approve' })}
            </Button>
          </div>
        </div>
      )}

      {/* Per-assignee decision audit row (visible once decided). */}
      {step.assignees.some((a) => a.decision != null) && (
        <ul className="mt-2 space-y-0.5">
          {step.assignees
            .filter((a) => a.decision != null)
            .map((a) => (
              <li
                key={a.user_id}
                className="flex items-center gap-1.5 text-2xs text-content-tertiary"
              >
                {a.decision === 'approve' ? (
                  <CheckCircle2 size={11} className="text-semantic-success" />
                ) : (
                  <XCircle size={11} className="text-semantic-error" />
                )}
                <span className="truncate">
                  {a.user_name || a.user_email || a.user_id}
                </span>
                {a.comment && (
                  <span className="text-content-tertiary truncate">
                    — {a.comment}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function HistoryList({ instances }: { instances: ApprovalInstance[] }) {
  const { t } = useTranslation();
  if (instances.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-2xs font-medium text-content-tertiary uppercase tracking-wide">
        {t('approvalRoutes.history', { defaultValue: 'History' })} ({instances.length})
      </summary>
      <ul className="mt-1 space-y-1">
        {instances.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-2 text-xs text-content-secondary"
          >
            <InstanceStatusBadge status={i.status} />
            <span className="truncate">{i.route_name || i.id.slice(0, 8)}</span>
            {i.closed_at && (
              <span className="text-content-tertiary text-2xs ml-auto">
                {new Date(i.closed_at).toLocaleDateString()}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
