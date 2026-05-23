/**
 * ProductTour — first-run guided tour of OpenConstructionERP.
 *
 * A multi-step spotlight coachmark walkthrough that introduces a new user
 * to the key surfaces of the app: sidebar navigation, project picker,
 * BOQ editor, BIM Hub, Property Development, Geo Hub, Help menu and a
 * wrap-up step.
 *
 * Lifecycle:
 *   - Auto-starts on first login when the user is on the dashboard route
 *     ("/" or "/dashboard") and `localStorage.getItem('oe.tour_completed')`
 *     is not `'true'`.
 *   - Listens for the `oe:start-tour` window event so any "Take a quick
 *     tour" CTA can (re-)launch the tour without prop-drilling.
 *   - On Finish / Skip / Esc → writes `oe.tour_completed = 'true'`.
 *   - Esc prompts a soft confirm to avoid accidental dismissal.
 *
 * Resilience:
 *   - If a step's target selector resolves to nothing, the tour logs a
 *     single console warning and auto-advances to the next step.  The
 *     wrap-up step has no target and renders as a centred modal.
 *   - On `resize` / `scroll` the spotlight + tooltip are recomputed via
 *     `getBoundingClientRect()` so the highlight stays pinned to the
 *     element even on long pages or zoom changes.
 *   - Esc handler is registered on mount (and only when active) and
 *     unregistered on close — no global leak.
 *
 * NOTE: This component coexists with the older `OnboardingTour` (which
 * keys off `oe_tour_completed` / `data-tour="..."`).  ProductTour uses a
 * *different* storage key (`oe.tour_completed` — note the dot) and
 * `data-testid` selectors so the two systems do not interfere.  The new
 * tour is the canonical "Take a quick tour" experience surfaced from the
 * WhatsNewCard CTA and the Help menu.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ArrowLeft, ArrowRight, MapPin, Check } from 'lucide-react';
import clsx from 'clsx';

import { ConfirmDialog } from './ConfirmDialog';

/* ── Constants ──────────────────────────────────────────────────────────── */

/** Tour completion flag.  Tested against the literal string `'true'`. */
export const TOUR_COMPLETED_KEY = 'oe.tour_completed';

/** Window event that any external trigger (e.g. WhatsNewCard "Take a
 *  quick tour" button, Help menu item) can dispatch to (re-)start. */
export const TOUR_START_EVENT = 'oe:start-tour';

/** Routes where the *auto-start* must NOT mount on top of the page (the
 *  spotlight overlay would block form inputs / primary CTAs).  Manual
 *  launches via the `oe:start-tour` event bypass this guard. */
const AUTO_START_BLOCKED_PREFIXES = ['/login', '/register', '/forgot-password', '/onboarding', '/setup'];

/** Routes that count as the dashboard for auto-start eligibility. */
const DASHBOARD_ROUTES = new Set(['/', '/dashboard']);

const TOOLTIP_W = 340; // px — fixed tooltip width
const TOOLTIP_H = 200; // px — estimated tooltip height (used for pre-positioning)
const TOOLTIP_OFFSET = 16; // px gap between spotlight and tooltip
const PADDING = 8; // px halo around the highlighted element
const VIEWPORT_MARGIN = 12; // px keep-away from viewport edges

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface ProductTourStep {
  /** CSS selector for the element to highlight.  `null` → centred modal. */
  selector: string | null;
  /** i18n key for the step title (resolved at render time). */
  titleKey: string;
  /** i18n key for the supporting body copy (~30 words). */
  bodyKey: string;
  /** Preferred position relative to target.  Falls back if it would clip. */
  preferredPosition?: 'top' | 'right' | 'bottom' | 'left';
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipCoords {
  top: number;
  left: number;
}

/* ── Default 8-step tour ────────────────────────────────────────────────── */

export const DEFAULT_PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    selector: '[data-testid="app-sidebar"]',
    titleKey: 'tour.step.1.title',
    bodyKey: 'tour.step.1.body',
    preferredPosition: 'right',
  },
  {
    selector: '[data-testid="header-project-picker"]',
    titleKey: 'tour.step.2.title',
    bodyKey: 'tour.step.2.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="sidebar-nav-boq"]',
    titleKey: 'tour.step.3.title',
    bodyKey: 'tour.step.3.body',
    preferredPosition: 'right',
  },
  {
    selector: '[data-testid="sidebar-nav-bim"]',
    titleKey: 'tour.step.4.title',
    bodyKey: 'tour.step.4.body',
    preferredPosition: 'right',
  },
  {
    selector: '[data-testid="sidebar-nav-property-dev"]',
    titleKey: 'tour.step.5.title',
    bodyKey: 'tour.step.5.body',
    preferredPosition: 'right',
  },
  {
    selector: '[data-testid="sidebar-nav-geo-hub"]',
    titleKey: 'tour.step.6.title',
    bodyKey: 'tour.step.6.body',
    preferredPosition: 'right',
  },
  {
    selector: '[data-testid="header-help-menu"]',
    titleKey: 'tour.step.7.title',
    bodyKey: 'tour.step.7.body',
    preferredPosition: 'bottom',
  },
  {
    selector: null,
    titleKey: 'tour.step.8.title',
    bodyKey: 'tour.step.8.body',
  },
];

/* ── Hard-coded fallbacks for the locale keys, used when i18n misses ────── */

const STEP_FALLBACKS: Record<string, string> = {
  'tour.step.1.title': 'Sidebar navigation',
  'tour.step.1.body':
    'Your project workflow lives in the sidebar. Modules are grouped by lifecycle — Estimation, Tendering, Construction, Operations.',
  'tour.step.2.title': 'Active project',
  'tour.step.2.body':
    'Pick the active project at the top. The whole app scopes data to this project — BOQs, BIM models, RFIs, snags.',
  'tour.step.3.title': 'Bill of Quantities',
  'tour.step.3.body':
    'Bills of Quantity live here. Create positions, apply unit rates, link to CAD elements, export GAEB or Excel.',
  'tour.step.4.title': 'BIM Hub',
  'tour.step.4.body':
    'Upload IFC, RVT or DWG. Federate multiple models. Run clash detection. Take quantity off the 3D model.',
  'tour.step.5.title': 'Property Development',
  'tour.step.5.body':
    'Real-estate developer module — Leads, Buyers, Reservations, SPA, Handover, Warranty. End-to-end click-flow.',
  'tour.step.6.title': 'Geo Hub',
  'tour.step.6.body':
    '3D globe with project anchors, CAD tilesets and pins from HSE, Punchlist and Daily Diary.',
  'tour.step.7.title': 'Help and bug reports',
  'tour.step.7.body':
    'Found something? Report a bug from here — it lands on GitHub. You can also re-launch this quick tour from this menu.',
  'tour.step.8.title': "You're set!",
  'tour.step.8.body':
    'Pick a module from the sidebar to dive in. Full docs are linked from the About page.',
  'tour.skip': 'Skip tour',
  'tour.back': 'Back',
  'tour.next': 'Next',
  'tour.finish': 'Finish',
  'tour.step_counter': 'Step {{current}} of {{total}}',
};

/* ── Geometry helpers ───────────────────────────────────────────────────── */

function measureSpotlight(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = (el as Element).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

function placeTooltip(
  spotlight: SpotlightRect,
  preferred: ProductTourStep['preferredPosition'] = 'bottom',
): TooltipCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Candidate positions ordered by preference; first that fully fits wins.
  const order: Array<ProductTourStep['preferredPosition']> = [
    preferred,
    'bottom',
    'right',
    'top',
    'left',
  ];

  const tryPlace = (pos: ProductTourStep['preferredPosition']): TooltipCoords => {
    switch (pos) {
      case 'right':
        return {
          top: spotlight.top + spotlight.height / 2 - TOOLTIP_H / 2,
          left: spotlight.left + spotlight.width + TOOLTIP_OFFSET,
        };
      case 'left':
        return {
          top: spotlight.top + spotlight.height / 2 - TOOLTIP_H / 2,
          left: spotlight.left - TOOLTIP_W - TOOLTIP_OFFSET,
        };
      case 'top':
        return {
          top: spotlight.top - TOOLTIP_H - TOOLTIP_OFFSET,
          left: spotlight.left + spotlight.width / 2 - TOOLTIP_W / 2,
        };
      case 'bottom':
      default:
        return {
          top: spotlight.top + spotlight.height + TOOLTIP_OFFSET,
          left: spotlight.left + spotlight.width / 2 - TOOLTIP_W / 2,
        };
    }
  };

  const fits = ({ top, left }: TooltipCoords) =>
    top >= VIEWPORT_MARGIN &&
    left >= VIEWPORT_MARGIN &&
    top + TOOLTIP_H <= vh - VIEWPORT_MARGIN &&
    left + TOOLTIP_W <= vw - VIEWPORT_MARGIN;

  for (const pos of order) {
    const candidate = tryPlace(pos);
    if (fits(candidate)) return candidate;
  }
  // Nothing fit cleanly — fall back to preferred and clamp.
  const fallback = tryPlace(preferred);
  return {
    top: Math.max(VIEWPORT_MARGIN, Math.min(fallback.top, vh - TOOLTIP_H - VIEWPORT_MARGIN)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(fallback.left, vw - TOOLTIP_W - VIEWPORT_MARGIN)),
  };
}

function centerOfViewport(): TooltipCoords {
  return {
    top: Math.max(VIEWPORT_MARGIN, (window.innerHeight - TOOLTIP_H) / 2),
    left: Math.max(VIEWPORT_MARGIN, (window.innerWidth - TOOLTIP_W) / 2),
  };
}

/* ── Component ──────────────────────────────────────────────────────────── */

export interface ProductTourProps {
  steps?: ProductTourStep[];
}

export function ProductTour({ steps = DEFAULT_PRODUCT_TOUR_STEPS }: ProductTourProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const totalSteps = steps.length;

  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<TooltipCoords>(() => centerOfViewport());
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  // Track which missing-target warnings we've already emitted so we don't
  // spam the console on resize/recompute.
  const warnedRef = useRef<Set<string>>(new Set());

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  /* ── Persist completion + close ──────────────────────────────────────── */
  const completeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    } catch {
      /* localStorage unavailable — non-fatal */
    }
    setActive(false);
    setCurrentStep(0);
  }, []);

  /* ── Scroll target into view + measure ───────────────────────────────── */
  const positionForStep = useCallback(
    (idx: number) => {
      const s = steps[idx];
      if (!s) return;

      // Wrap-up step (no selector) → centred modal, no spotlight.
      if (s.selector == null) {
        setSpotlight(null);
        setTooltipCoords(centerOfViewport());
        return;
      }

      const el = document.querySelector(s.selector);
      if (el) {
        try {
          (el as Element).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch {
          /* older browsers — ignore */
        }
      } else if (!warnedRef.current.has(s.selector)) {
        warnedRef.current.add(s.selector);
        // eslint-disable-next-line no-console
        console.warn(`[ProductTour] target not found, skipping step: ${s.selector}`);
      }

      // Defer measurement so the smooth scroll has a chance to settle.
      window.setTimeout(() => {
        const rect = measureSpotlight(s.selector!);
        if (rect) {
          setSpotlight(rect);
          setTooltipCoords(placeTooltip(rect, s.preferredPosition));
        } else {
          // Target missing — degrade gracefully to a centred modal so the
          // tour never stalls on a broken selector.
          setSpotlight(null);
          setTooltipCoords(centerOfViewport());
        }
      }, 180);
    },
    [steps],
  );

  /* ── (Re)compute on currentStep change + resize/scroll/observer ──────── */
  useEffect(() => {
    if (!active) return;
    positionForStep(currentStep);

    const recompute = () => {
      const s = steps[currentStep];
      if (!s) return;
      if (s.selector == null) {
        setTooltipCoords(centerOfViewport());
        return;
      }
      const rect = measureSpotlight(s.selector);
      if (rect) {
        setSpotlight(rect);
        setTooltipCoords(placeTooltip(rect, s.preferredPosition));
      }
    };

    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);

    // Observe layout shifts (collapsible sidebar, lazy-mounted nav items).
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recompute);
      ro.observe(document.body);
    }

    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      if (ro) ro.disconnect();
    };
  }, [active, currentStep, positionForStep, steps]);

  /* ── Esc key — soft-confirm dismiss ──────────────────────────────────── */
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmExitOpen) return;
      const otherDialog = document.querySelector(
        '[role=dialog]:not([data-product-tour]), [role=alertdialog]:not([data-product-tour])',
      );
      if (otherDialog) return;
      e.preventDefault();
      setConfirmExitOpen(true);
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => document.removeEventListener('keydown', handler, { capture: true });
  }, [active, confirmExitOpen]);

  /* ── External trigger: `oe:start-tour` window event ──────────────────── */
  useEffect(() => {
    const start = () => {
      warnedRef.current.clear();
      setCurrentStep(0);
      setActive(true);
    };
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, []);

  /* ── First-login auto-start ──────────────────────────────────────────── */
  useEffect(() => {
    if (active) return;
    if (typeof window === 'undefined') return;

    let completed = 'false';
    try {
      completed = localStorage.getItem(TOUR_COMPLETED_KEY) ?? 'false';
    } catch {
      /* ignore */
    }
    if (completed === 'true') return;

    const blocked = AUTO_START_BLOCKED_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (blocked) return;

    if (!DASHBOARD_ROUTES.has(location.pathname)) return;

    // Small delay so the dashboard has time to mount its targets.
    const id = window.setTimeout(() => {
      warnedRef.current.clear();
      setCurrentStep(0);
      setActive(true);
    }, 600);
    return () => window.clearTimeout(id);
  }, [active, location.pathname]);

  /* ── Navigation handlers ─────────────────────────────────────────────── */
  const handleNext = useCallback(() => {
    if (isLast) {
      completeTour();
      return;
    }
    setCurrentStep((s) => s + 1);
  }, [isLast, completeTour]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    setCurrentStep((s) => s - 1);
  }, [isFirst]);

  const handleSkip = useCallback(() => {
    completeTour();
  }, [completeTour]);

  /* ── Memoised resolved strings ───────────────────────────────────────── */
  const resolved = useMemo(() => {
    if (!step) return null;
    return {
      title: t(step.titleKey, { defaultValue: STEP_FALLBACKS[step.titleKey] ?? step.titleKey }),
      body: t(step.bodyKey, { defaultValue: STEP_FALLBACKS[step.bodyKey] ?? step.bodyKey }),
      counter: t('tour.step_counter', {
        defaultValue: STEP_FALLBACKS['tour.step_counter'],
        current: currentStep + 1,
        total: totalSteps,
      }),
      skip: t('tour.skip', { defaultValue: STEP_FALLBACKS['tour.skip'] }),
      back: t('tour.back', { defaultValue: STEP_FALLBACKS['tour.back'] }),
      next: t('tour.next', { defaultValue: STEP_FALLBACKS['tour.next'] }),
      finish: t('tour.finish', { defaultValue: STEP_FALLBACKS['tour.finish'] }),
    };
  }, [step, t, currentStep, totalSteps]);

  if (!active || !step || !resolved) return null;

  const SHADOW_SPREAD = 9999; // px — large enough to dim the entire viewport.

  return (
    <>
      {/* Dim backdrop with rectangular cutout via box-shadow.  When there's
          no spotlight (wrap-up step) we render a full-screen scrim that
          accepts pointer events so the user has to engage with the modal. */}
      <div
        data-testid="product-tour-overlay"
        data-product-tour="overlay"
        className={clsx(
          'fixed inset-0 z-[9000]',
          spotlight ? 'pointer-events-none' : 'pointer-events-auto bg-black/35',
        )}
        aria-hidden="true"
      >
        {spotlight && (
          <div
            data-testid="product-tour-spotlight"
            style={{
              position: 'fixed',
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: `0 0 0 ${SHADOW_SPREAD}px rgba(15, 23, 42, 0.42)`,
              borderRadius: 10,
              zIndex: 9001,
              pointerEvents: 'none',
              transition: 'top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease',
            }}
          />
        )}
      </div>

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="product-tour-title"
        data-testid="product-tour-tooltip"
        data-product-tour="tooltip"
        style={{
          position: 'fixed',
          top: tooltipCoords.top,
          left: tooltipCoords.left,
          width: TOOLTIP_W,
          zIndex: 9100,
        }}
        className={clsx(
          'rounded-2xl border border-border-light',
          'bg-surface-elevated shadow-xl',
          'p-5 pointer-events-auto animate-scale-in',
        )}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                isLast ? 'bg-emerald-500/10 text-emerald-600' : 'bg-oe-blue/10 text-oe-blue',
              )}
            >
              {isLast ? <Check size={15} /> : <MapPin size={15} />}
            </div>
            <h3
              id="product-tour-title"
              className="text-sm font-semibold text-content-primary leading-snug"
            >
              {resolved.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            data-testid="product-tour-skip"
            className={clsx(
              'shrink-0 flex h-6 w-6 items-center justify-center rounded-md',
              'text-content-tertiary hover:text-content-primary hover:bg-surface-secondary',
              'transition-colors',
            )}
            aria-label={resolved.skip}
            title={resolved.skip}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body copy */}
        <p className="text-xs text-content-secondary leading-relaxed mb-4">{resolved.body}</p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="product-tour-step-counter"
            className="text-2xs font-medium text-content-tertiary tabular-nums"
          >
            {resolved.counter}
          </span>

          {/* Dot indicators */}
          <div className="flex items-center gap-1 mx-auto" aria-hidden>
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={clsx(
                  'rounded-full transition-all duration-150',
                  idx === currentStep ? 'h-2 w-4 bg-oe-blue' : 'h-1.5 w-1.5 bg-border',
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <button
                type="button"
                onClick={handleBack}
                data-testid="product-tour-back"
                className={clsx(
                  'flex h-7 items-center gap-1 rounded-lg px-2.5',
                  'border border-border text-content-secondary text-xs',
                  'hover:bg-surface-secondary hover:text-content-primary',
                  'transition-colors',
                )}
                aria-label={resolved.back}
              >
                <ArrowLeft size={12} />
                {resolved.back}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              data-testid="product-tour-next"
              className={clsx(
                'flex h-7 items-center gap-1.5 rounded-lg px-3',
                isLast
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-oe-blue text-white hover:opacity-90',
                'text-xs font-medium transition-colors',
              )}
              aria-label={isLast ? resolved.finish : resolved.next}
            >
              {isLast ? resolved.finish : resolved.next}
              {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExitOpen}
        onCancel={() => setConfirmExitOpen(false)}
        onConfirm={() => {
          setConfirmExitOpen(false);
          completeTour();
        }}
        variant="warning"
        title={t('tour.confirm_skip_title', { defaultValue: 'Exit tour?' })}
        message={t('tour.confirm_skip', {
          defaultValue: 'Skip the product tour? You can re-launch it from the Help menu.',
        })}
        confirmLabel={t('tour.confirm_skip_confirm', { defaultValue: 'Exit tour' })}
        cancelLabel={t('tour.confirm_skip_cancel', { defaultValue: 'Keep going' })}
      />
    </>
  );
}
