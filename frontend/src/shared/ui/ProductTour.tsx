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

/** Tour completion flag.  Tested against the literal string `'true'`.
 *  Per-tour storage uses `${TOUR_COMPLETED_KEY}.<tourId>` (e.g.
 *  `oe.tour_completed.boq`) so finishing one module's tour never blocks
 *  another from launching.  The bare key is kept for the historical
 *  global tour (tourId === 'global') so legacy installs keep working. */
export const TOUR_COMPLETED_KEY = 'oe.tour_completed';

/** Window event that any external trigger (e.g. WhatsNewCard "Take a
 *  quick tour" button, Help menu item, per-module ModuleHelpButton) can
 *  dispatch to (re-)start.  The event detail may carry a `tourId` to
 *  pick a registered tour playlist; omitting it launches the global
 *  default. */
export const TOUR_START_EVENT = 'oe:start-tour';

/** Known tour identifiers.  Add a new id here when registering a new
 *  per-module tour so callers get autocompletion + type safety. */
export type TourId = 'global' | 'boq' | 'accommodation';

/** Per-tour storage key.  `global` keeps the bare key for backward
 *  compatibility with installs upgraded from before this refactor. */
function storageKeyFor(tourId: TourId): string {
  return tourId === 'global' ? TOUR_COMPLETED_KEY : `${TOUR_COMPLETED_KEY}.${tourId}`;
}

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

/* ── Per-module tour: BOQ Editor (8 steps) ──────────────────────────────
 *
 * Steps walk a brand-new estimator from "what is this page" through every
 * load-bearing surface of the BOQ editor:
 *   1. Toolbar — primary action band, undo/redo + add + import/export.
 *   2. Add Position — the primary CTA every user hits first.
 *   3. AG Grid — the editable table itself, inline editing + keyboard nav.
 *   4. Quality & AI menu — validate, AI rate recovery, anomaly check.
 *   5. Resource summary panel — material / labour / equipment rollup.
 *   6. Markup panel — overhead / profit / VAT / contingency configuration.
 *   7. Quality score ring — live traffic light driven by validation.
 *   8. Export menu (closing tip) — Excel / GAEB X83 / PDF / CSV.
 *
 * Selectors target stable `data-testid` attributes added in BOQEditorPage
 * and BOQToolbar so the tour survives Tailwind churn / button reorders.
 */
export const BOQ_TOUR_STEPS: ProductTourStep[] = [
  {
    selector: '[data-testid="boq-toolbar"]',
    titleKey: 'tour.boq.step.1.title',
    bodyKey: 'tour.boq.step.1.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="boq-add-position-button"]',
    titleKey: 'tour.boq.step.2.title',
    bodyKey: 'tour.boq.step.2.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="boq-grid"]',
    titleKey: 'tour.boq.step.3.title',
    bodyKey: 'tour.boq.step.3.body',
    preferredPosition: 'top',
  },
  {
    selector: '[data-testid="boq-quality-ai-menu"]',
    titleKey: 'tour.boq.step.4.title',
    bodyKey: 'tour.boq.step.4.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="boq-resource-summary"]',
    titleKey: 'tour.boq.step.5.title',
    bodyKey: 'tour.boq.step.5.body',
    preferredPosition: 'top',
  },
  {
    selector: '[data-testid="boq-markup-panel"]',
    titleKey: 'tour.boq.step.6.title',
    bodyKey: 'tour.boq.step.6.body',
    preferredPosition: 'top',
  },
  {
    selector: '[data-testid="boq-quality-ring"]',
    titleKey: 'tour.boq.step.7.title',
    bodyKey: 'tour.boq.step.7.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="boq-export-button"]',
    titleKey: 'tour.boq.step.8.title',
    bodyKey: 'tour.boq.step.8.body',
    preferredPosition: 'bottom',
  },
];

/* ── Per-module tour: Accommodation (5 steps) ─────────────────────────
 *
 * Walks a new operator through the Accommodation detail page:
 *   1. Header — name, kind badge, BIM link, Geo CTA.
 *   2. Tabs strip — Rooms / Bookings / Charges / Settings.
 *   3. Rooms tab — colour-coded grid + bulk add.
 *   4. Bookings tab — state machine actions.
 *   5. Wrap-up — bootstrap from PropDev + HR autobook.
 */
export const ACCOMMODATION_TOUR_STEPS: ProductTourStep[] = [
  {
    selector: '[data-testid="accommodation-detail-header"]',
    titleKey: 'tour.accommodation.step.1.title',
    bodyKey: 'tour.accommodation.step.1.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="accommodation-detail-tabs"]',
    titleKey: 'tour.accommodation.step.2.title',
    bodyKey: 'tour.accommodation.step.2.body',
    preferredPosition: 'bottom',
  },
  {
    selector: '[data-testid="accommodation-tab-panel-rooms"]',
    titleKey: 'tour.accommodation.step.3.title',
    bodyKey: 'tour.accommodation.step.3.body',
    preferredPosition: 'top',
  },
  {
    selector: '[data-testid="accommodation-detail-tab-bookings"]',
    titleKey: 'tour.accommodation.step.4.title',
    bodyKey: 'tour.accommodation.step.4.body',
    preferredPosition: 'bottom',
  },
  {
    selector: null,
    titleKey: 'tour.accommodation.step.5.title',
    bodyKey: 'tour.accommodation.step.5.body',
  },
];

/* ── Tour registry — id → playlist of steps ────────────────────────────── */

export const TOUR_REGISTRY: Record<TourId, ProductTourStep[]> = {
  global: DEFAULT_PRODUCT_TOUR_STEPS,
  boq: BOQ_TOUR_STEPS,
  accommodation: ACCOMMODATION_TOUR_STEPS,
};

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

  // ── BOQ Editor tour ──────────────────────────────────────────────────
  'tour.boq.step.1.title': 'BOQ toolbar',
  'tour.boq.step.1.body':
    'Every action lives here: add sections and positions, import GAEB or Excel, pick from the cost database, validate, run AI checks, and export. Hover any icon for its keyboard shortcut.',
  'tour.boq.step.2.title': 'Add a position',
  'tour.boq.step.2.body':
    'Creates a new line under the section you last clicked. The Description cell opens for inline edit automatically — type, then Tab through unit, quantity and unit rate.',
  'tour.boq.step.3.title': 'The estimating grid',
  'tour.boq.step.3.body':
    'Click any cell to edit; arrow keys / Tab navigate; formulas like =2*A1 are supported; right-click a row for duplicate, indent, link to BIM, or save-as-assembly.',
  'tour.boq.step.4.title': 'Quality & AI tools',
  'tour.boq.step.4.body':
    'Run validation against DIN 276 / GAEB / NRM, recalculate rates from the cost database, price-check against market medians, or open the AI assistant for plain-text BOQ generation.',
  'tour.boq.step.5.title': 'Resource summary',
  'tour.boq.step.5.body':
    'Live rollup of every material, labour and equipment line consumed across this BOQ — quantities, unit costs and total spend per resource. Click a row to see which positions use it.',
  'tour.boq.step.6.title': 'Markups & VAT',
  'tour.boq.step.6.body':
    'Add overhead, profit, tax, contingency, insurance or bonds — pick a regional template (DACH VOB, UK NRM, US RSMeans, FR BATIPRIX, …) or roll your own. Markups stack on the direct cost.',
  'tour.boq.step.7.title': 'Quality score',
  'tour.boq.step.7.body':
    'Traffic light driven by the validation pipeline — green over 80, amber 50-80, red below. Hover for the breakdown: descriptions filled, quantities set, rates set, markups configured.',
  'tour.boq.step.8.title': 'Export anywhere',
  'tour.boq.step.8.body':
    'Export to Excel (.xlsx), CSV, PDF report, or GAEB XML X83 for German tender submission. Currency, FX rates and markups are baked in so the recipient sees the same totals.',

  // ── Accommodation tour ───────────────────────────────────────────────
  'tour.accommodation.step.1.title': 'Accommodation header',
  'tour.accommodation.step.1.body':
    'Name, kind badge, project context and quick links to BIM and the Geo Hub when geo-coordinates are set. Launch the per-module tour from the Tour button here.',
  'tour.accommodation.step.2.title': 'Tabs',
  'tour.accommodation.step.2.body':
    'Rooms, Bookings, Charges and Settings. Each tab scopes its data to this accommodation only.',
  'tour.accommodation.step.3.title': 'Rooms grid',
  'tour.accommodation.step.3.body':
    'Colour-coded by status — green available, amber occupied, grey maintenance, red blocked. Bulk-create rooms with the generator: prefix + start + count.',
  'tour.accommodation.step.4.title': 'Bookings',
  'tour.accommodation.step.4.body':
    'State machine: reserved → checked_in → checked_out. Cancel is allowed from any non-final state. The room flips to occupied on check-in and back to available on check-out / cancel.',
  'tour.accommodation.step.5.title': 'Bridges you can use today',
  'tour.accommodation.step.5.body':
    'Bootstrap rooms from a PropDev block (idempotent — re-run safely) and let HR suggest the lowest-numbered free worker-camp room for a new employee.',

  // ── ModuleHelpButton labels ──────────────────────────────────────────
  'module_help.tour_button': 'Tour',
  'module_help.tour_aria': 'Start guided tour for this module',
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
  /** Fallback playlist (legacy callers).  When omitted the component
   *  resolves the active tour from `defaultTourId` / the dispatched
   *  start event payload via the registry. */
  steps?: ProductTourStep[];
  /** Tour id auto-launched on first-login when no tour-completed flag
   *  is set for that id.  Defaults to `'global'` so the legacy
   *  installer behaviour (dashboard first-run) is preserved. */
  defaultTourId?: TourId;
}

export function ProductTour({ steps, defaultTourId = 'global' }: ProductTourProps) {
  const { t } = useTranslation();
  const location = useLocation();

  // Active tour id drives which playlist + storage key we use. Starts at
  // `defaultTourId` and is replaced whenever the start-tour event fires
  // with a `{detail: {tourId}}` payload.
  const [activeTourId, setActiveTourId] = useState<TourId>(defaultTourId);

  // Resolve playlist: explicit `steps` prop wins (legacy callers), then
  // registry lookup by active id, then the global default.
  const resolvedSteps: ProductTourStep[] =
    steps ?? TOUR_REGISTRY[activeTourId] ?? DEFAULT_PRODUCT_TOUR_STEPS;
  const totalSteps = resolvedSteps.length;

  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<TooltipCoords>(() => centerOfViewport());
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  // Track which missing-target warnings we've already emitted so we don't
  // spam the console on resize/recompute.
  const warnedRef = useRef<Set<string>>(new Set());

  const step = resolvedSteps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  /* ── Persist completion + close ──────────────────────────────────────── */
  const completeTour = useCallback(() => {
    try {
      // Per-tour completion key — finishing the BOQ tour doesn't suppress
      // the global tour and vice-versa.
      localStorage.setItem(storageKeyFor(activeTourId), 'true');
    } catch {
      /* localStorage unavailable — non-fatal */
    }
    setActive(false);
    setCurrentStep(0);
  }, [activeTourId]);

  /* ── Scroll target into view + measure ───────────────────────────────── */
  const positionForStep = useCallback(
    (idx: number) => {
      const s = resolvedSteps[idx];
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
    [resolvedSteps],
  );

  /* ── (Re)compute on currentStep change + resize/scroll/observer ──────── */
  useEffect(() => {
    if (!active) return;
    positionForStep(currentStep);

    const recompute = () => {
      const s = resolvedSteps[currentStep];
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
  }, [active, currentStep, positionForStep, resolvedSteps]);

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

  /* ── External trigger: `oe:start-tour` window event ────────────────────
   *
   * Optional `event.detail.tourId` picks a registered playlist (e.g.
   * `{tourId: 'boq'}` from the BOQ Editor's Tour button).  Unknown ids
   * silently fall back to the existing active id so a typo never wipes
   * the user's tour mid-session. */
  useEffect(() => {
    const start = (evt: Event) => {
      const detail = (evt as CustomEvent<{ tourId?: TourId } | undefined>).detail;
      const requested = detail?.tourId;
      if (requested && requested in TOUR_REGISTRY) {
        setActiveTourId(requested);
      }
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
      // Auto-start only fires for the `defaultTourId` (typically global).
      // Per-module tours are launched explicitly via the Tour button —
      // they never auto-pop.
      completed = localStorage.getItem(storageKeyFor(defaultTourId)) ?? 'false';
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
      setActiveTourId(defaultTourId);
      setCurrentStep(0);
      setActive(true);
    }, 600);
    return () => window.clearTimeout(id);
  }, [active, location.pathname, defaultTourId]);

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
            {resolvedSteps.map((_, idx) => (
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
