// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
// Copyright (c) 2026 Artem Boiko / DataDrivenConstruction
/**
 * MatchProgressCard — beautiful, informative progress card for the
 * /match-elements wizard. Shown the moment the user clicks "Let's match"
 * on Step 4 and the kickoff mutation flips to pending; replaces the
 * generic spinner that previously made the app look frozen for the
 * 5–30s the backend takes to grind through a vector match.
 *
 * Backend has no real-time progress feed for matching — it's a single
 * synchronous POST — so we mirror the wall-clock heuristic pioneered
 * by ``GlobalCatalogueInstallIndicator``: rotate stage labels on a
 * fixed timetable and ramp an indeterminate bar from 5% → 95%, then
 * flip to 100% the instant the parent reports ``status='done'``.
 *
 * Pure prop-driven; no polling, no global store. The card knows only
 * what the parent tells it via ``status`` / ``errorMessage`` / the
 * three lifecycle callbacks.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  Building2,
  Check,
  Database,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import clsx from 'clsx';

export type MatchProgressStatus = 'running' | 'done' | 'error';

interface Props {
  /** Driven by the parent mutation. ``running`` is the default while the
   *  POST is in flight; flip to ``done`` to finalise the timeline + bar
   *  and trigger ``onDone`` after a brief satisfaction frame, or to
   *  ``error`` to expose the retry button. */
  status: MatchProgressStatus;
  /** Surfaced on the active stage row when ``status === 'error'``. */
  errorMessage?: string | null;
  /** Called ~800ms after the parent flips to ``status='done'`` — gives
   *  the user a moment to see "all green, bar 100%" before the results
   *  pane swaps in. */
  onDone: () => void;
  /** Called when the user clicks "Try again" in the error footer. The
   *  parent is expected to return to Step 4 of the wizard. */
  onRetry?: () => void;
}

interface StageDef {
  id:
    | 'load'
    | 'embed'
    | 'vector'
    | 'lexical'
    | 'rerank'
    | 'currency';
  /** Wall-clock seconds at which this stage becomes the "active" one.
   *  The last stage's range extends to infinity. */
  startSec: number;
  label: string;
  Icon: typeof Layers;
}

function formatElapsed(ms: number): string {
  if (ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

/** Indeterminate ramp 5% → 95% over ~30s. Smooth ease-out so the bar
 *  rushes early and slows down — matches user expectation that the
 *  long tail is "almost done, just finishing up". Flips to 100% the
 *  instant the parent flips to status='done'. */
function rampPct(elapsedSec: number): number {
  if (elapsedSec <= 0) return 5;
  // Logistic-ish curve: saturates near 95% as time → 60s.
  const k = elapsedSec / 30; // half-life ~15s
  const eased = 1 - 1 / (1 + k * 1.6);
  return Math.min(95, Math.round(5 + eased * 90));
}

export function MatchProgressCard({
  status,
  errorMessage,
  onDone,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const startedAtRef = useRef<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const firedDoneRef = useRef(false);

  // Reset the wall-clock the moment the card mounts. Using a ref keeps
  // the start time stable across re-renders without a useState ceremony.
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  // 1Hz ticker — drives the elapsed counter and stage rotation. Stops
  // as soon as status flips terminal so we don't churn timers in the
  // success / error tail.
  useEffect(() => {
    if (status !== 'running') return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [status]);

  // Fire onDone exactly once, ~800ms after the parent flips to done.
  // Gives the user a satisfying "all green, bar full" frame before the
  // results pane swaps in.
  useEffect(() => {
    if (status !== 'done' || firedDoneRef.current) return;
    firedDoneRef.current = true;
    const handle = window.setTimeout(onDone, 800);
    return () => window.clearTimeout(handle);
  }, [status, onDone]);

  const stages: StageDef[] = useMemo(
    () => [
      {
        id: 'load',
        startSec: 0,
        label: t('match_progress.stage_load', {
          defaultValue: 'Loading BIM elements',
        }),
        Icon: Layers,
      },
      {
        id: 'embed',
        startSec: 2,
        label: t('match_progress.stage_embed', {
          defaultValue: 'Building embeddings',
        }),
        Icon: Sparkles,
      },
      {
        id: 'vector',
        startSec: 5,
        label: t('match_progress.stage_vector', {
          defaultValue: 'Vector search (top candidates)',
        }),
        Icon: Search,
      },
      {
        id: 'lexical',
        startSec: 12,
        label: t('match_progress.stage_lexical', {
          defaultValue: 'Lexical + region boost',
        }),
        Icon: Database,
      },
      {
        id: 'rerank',
        startSec: 20,
        label: t('match_progress.stage_rerank', {
          defaultValue: 'Rerank by relevance',
        }),
        Icon: Building2,
      },
      {
        id: 'currency',
        startSec: 28,
        label: t('match_progress.stage_currency', {
          defaultValue: 'Currency normalization',
        }),
        Icon: Banknote,
      },
    ],
    [t],
  );

  const elapsedMs = Math.max(0, now - startedAtRef.current);
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // Active stage index — wall-clock heuristic. On done, all stages
  // are past so we point past the array. On error, the active stage
  // is the one the wall-clock was on when error hit.
  const activeIdx = useMemo(() => {
    if (status === 'done') return stages.length;
    let idx = 0;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (s && elapsedSec >= s.startSec) idx = i;
    }
    return idx;
  }, [elapsedSec, status, stages]);

  const overallPct = status === 'done' ? 100 : rampPct(elapsedSec);

  const isRunning = status === 'running';
  const isDone = status === 'done';
  const isError = status === 'error';

  const headline = useMemo(() => {
    if (isError) {
      return t('match_progress.headline_error', {
        defaultValue: 'Something went wrong',
      });
    }
    if (isDone) {
      return t('match_progress.headline_done', {
        defaultValue: 'All done — opening your results',
      });
    }
    if (elapsedSec >= 60) {
      return t('match_progress.headline_long', {
        defaultValue:
          'Almost done — large projects can take a minute',
      });
    }
    return stages[activeIdx]?.label ?? stages[0]?.label ?? '';
  }, [isError, isDone, elapsedSec, stages, activeIdx, t]);

  return (
    <div
      className={clsx(
        'rounded-2xl border bg-surface-primary shadow-sm p-5 sm:p-7 max-w-3xl mx-auto mt-4 transition-opacity duration-500',
        isError ? 'border-rose-200 dark:border-rose-800/60' : 'border-border',
      )}
      data-testid="match-progress-card"
      data-status={status}
      data-stage={stages[activeIdx]?.id ?? 'done'}
    >
      {/* Header — title + elapsed */}
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-content-primary inline-flex items-center gap-2">
            {isError ? (
              <>
                <TriangleAlert className="w-5 h-5 text-rose-600" />
                {t('match_progress.title_error', {
                  defaultValue: 'Match failed',
                })}
              </>
            ) : isDone ? (
              <>
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shadow-sm shadow-emerald-500/40">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
                {t('match_progress.title_done', {
                  defaultValue: 'Match complete',
                })}
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                {t('match_progress.title_running', {
                  defaultValue: 'Matching in progress',
                })}
              </>
            )}
          </h3>
          <p className="text-xs text-content-tertiary mt-1.5 max-w-xl">
            {isError
              ? errorMessage ??
                t('match_progress.subtitle_error', {
                  defaultValue:
                    'The matcher couldn’t finish — try again or pick a different catalogue.',
                })
              : isDone
              ? t('match_progress.subtitle_done', {
                  defaultValue:
                    'All stages green — handing over to the review panel.',
                })
              : t('match_progress.subtitle_running', {
                  defaultValue:
                    'We’re searching the catalogue with vector + lexical + region signals. Safe to leave open in a tab.',
                })}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className="text-[11px] uppercase tracking-[0.14em] text-content-tertiary font-semibold">
            {t('match_progress.elapsed', { defaultValue: 'Elapsed' })}
          </div>
          <div className="text-sm font-semibold text-content-primary">
            {formatElapsed(elapsedMs)}
          </div>
        </div>
      </header>

      {/* Overall progress bar — smooth indeterminate ramp; pinned at
          100% on done, paused at current value on error. */}
      <div
        className={clsx(
          'h-1.5 rounded-full mb-5 overflow-hidden',
          isError ? 'bg-rose-100 dark:bg-rose-950/40' : 'bg-surface-secondary',
        )}
      >
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-700 ease-out',
            isError
              ? 'bg-rose-500'
              : isDone
              ? 'bg-emerald-500'
              : 'bg-gradient-to-r from-indigo-500 to-indigo-700',
          )}
          style={{ width: `${overallPct}%` }}
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('match_progress.overall_aria', {
            defaultValue: 'Overall match progress',
          })}
        />
      </div>

      {/* Rotating headline — the current stage label, or the long-tail
          reassurance message after 60s. Bumped to text-sm and bold so
          it reads as the focal element when the user scans the card. */}
      <p
        className={clsx(
          'text-sm font-semibold mb-5 transition-colors',
          isError
            ? 'text-rose-700 dark:text-rose-300'
            : isDone
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-content-primary',
        )}
        aria-live="polite"
      >
        {headline}
      </p>

      {/* Vertical timeline — 6 stages. Past stages are emerald + check;
          active stage is indigo + spinner; pending stages dim down. On
          error the active row flips to a rose X. */}
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const isPast = !isError && i < activeIdx;
          const isCurrent = !isError && !isDone && i === activeIdx;
          const isFinalGreen = isDone;
          const isErrorRow = isError && i === activeIdx;

          const badge = (() => {
            if (isErrorRow) {
              return (
                <span className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 inline-flex items-center justify-center ring-2 ring-rose-200 dark:ring-rose-800/40">
                  <X className="w-4 h-4" strokeWidth={3} />
                </span>
              );
            }
            if (isPast || isFinalGreen) {
              return (
                <span className="w-7 h-7 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shadow-sm shadow-emerald-500/40">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
              );
            }
            if (isCurrent) {
              return (
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white inline-flex items-center justify-center shadow-md shadow-indigo-500/40 ring-2 ring-indigo-200 dark:ring-indigo-900/40">
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                </span>
              );
            }
            return (
              <span className="w-7 h-7 rounded-full bg-surface-secondary text-content-tertiary inline-flex items-center justify-center border-2 border-border">
                <s.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </span>
            );
          })();

          return (
            <li
              key={s.id}
              className={clsx(
                'flex items-center gap-3 transition-opacity duration-300',
                !isCurrent && !isPast && !isFinalGreen && !isErrorRow && 'opacity-45',
              )}
              data-stage-row={s.id}
              data-active={isCurrent}
              data-done={isPast || isFinalGreen}
              data-error={isErrorRow || undefined}
            >
              {badge}
              <span
                className={clsx(
                  'text-sm transition-colors',
                  isErrorRow
                    ? 'font-semibold text-rose-700 dark:text-rose-300'
                    : isCurrent
                    ? 'font-semibold text-content-primary'
                    : isPast || isFinalGreen
                    ? 'font-medium text-content-secondary'
                    : 'text-content-tertiary',
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Error footer — message + Try again button. Only mounts on
          error so it doesn't add weight to the running / done states. */}
      {isError && (
        <div className="mt-6 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-rose-900 dark:text-rose-100 mb-0.5">
              {t('match_progress.error_label', {
                defaultValue: 'Error details',
              })}
            </div>
            <div className="text-xs text-rose-700 dark:text-rose-300 break-words">
              {errorMessage ||
                t('match_progress.error_fallback', {
                  defaultValue: 'Unknown error',
                })}
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm shadow-rose-500/30 hover:shadow-md hover:shadow-rose-500/40 hover:-translate-y-px transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {t('match_progress.retry', { defaultValue: 'Try again' })}
            </button>
          )}
        </div>
      )}

      {/* Hint — running state only. Tells the user what to do if it
          really does take a long time. */}
      {isRunning && elapsedSec >= 45 && (
        <p className="text-[11px] text-content-tertiary mt-5 leading-snug">
          {t('match_progress.long_hint', {
            defaultValue:
              'Still working — first runs on large BIM models take longer because vectors are warming up. Subsequent runs on the same project are much faster.',
          })}
        </p>
      )}
    </div>
  );
}
