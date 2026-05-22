// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
/**
 * Glass-panel empty states for the Geo Hub.
 *
 * Three distinct modes:
 *
 * 1. ``no_anchor`` — project exists but has not been anchored on the map.
 *    CTA: settings page for the project geo block.
 * 2. ``no_tilesets`` — anchor is set but no 3D Tiles have been generated.
 *    CTA: jump to BIM Hub to convert + send a model to the map.
 * 3. ``all_failed`` — at least one tileset exists, all are in failed state.
 *    CTA: jobs/status page so the user can investigate.
 *
 * Visually elevated — the empty state sits *over* the dark Cesium globe
 * background so we use a translucent surface card rather than the flat
 * surface used by the shared ``EmptyState`` component.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Layers,
  AlertTriangle,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';

export type GeoEmptyKind = 'no_anchor' | 'no_tilesets' | 'all_failed';

interface GeoEmptyStateProps {
  kind: GeoEmptyKind;
  projectId?: string | null;
}

interface Variant {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string | null;
  tone: 'info' | 'warning' | 'danger';
}

const TONE_RING: Record<Variant['tone'], string> = {
  info: 'from-blue-500/30 to-cyan-500/20 ring-blue-400/20',
  warning: 'from-amber-500/30 to-orange-500/20 ring-amber-400/20',
  danger: 'from-red-500/30 to-rose-500/20 ring-red-400/20',
};

const TONE_ICON_BG: Record<Variant['tone'], string> = {
  info: 'bg-blue-500/15 text-blue-300 ring-blue-400/30',
  warning: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  danger: 'bg-red-500/15 text-red-300 ring-red-400/30',
};

export function GeoEmptyState({ kind, projectId }: GeoEmptyStateProps) {
  const { t } = useTranslation();

  const variants: Record<GeoEmptyKind, Variant> = {
    no_anchor: {
      icon: MapPin,
      tone: 'info',
      title: t('geo_hub.empty.no_anchor_title', {
        defaultValue: 'Anchor this project on the map',
      }),
      description: t('geo_hub.empty.no_anchor_description', {
        defaultValue:
          'Pin the project to a real-world coordinate so 3D Tiles, photos and field reports land where they belong. You can update the anchor any time.',
      }),
      ctaLabel: t('geo_hub.empty.no_anchor_cta', {
        defaultValue: 'Set project anchor',
      }),
      ctaHref: projectId ? `/projects/${projectId}/settings` : null,
    },
    no_tilesets: {
      icon: Layers,
      tone: 'warning',
      title: t('geo_hub.empty.no_tilesets_title', {
        defaultValue: 'No 3D Tiles yet',
      }),
      description: t('geo_hub.empty.no_tilesets_description', {
        defaultValue:
          'The project is anchored but no model has been published as 3D Tiles. Convert a BIM model and send it to the map from BIM Hub.',
      }),
      ctaLabel: t('geo_hub.empty.no_tilesets_cta', {
        defaultValue: 'Convert a BIM model + send to map',
      }),
      ctaHref: projectId ? `/projects/${projectId}/bim` : '/bim',
    },
    all_failed: {
      icon: AlertTriangle,
      tone: 'danger',
      title: t('geo_hub.empty.all_failed_title', {
        defaultValue: 'Every tileset failed to generate',
      }),
      description: t('geo_hub.empty.all_failed_description', {
        defaultValue:
          'No tileset is currently servable. Inspect the job log to diagnose the converter error and rerun the failed tiles.',
      }),
      ctaLabel: t('geo_hub.empty.all_failed_cta', {
        defaultValue: 'Open conversion jobs',
      }),
      ctaHref: projectId
        ? `/projects/${projectId}/bim?tab=conversions`
        : '/bim',
    },
  };

  const v = variants[kind];
  const Icon = v.icon;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div
        className={[
          'pointer-events-auto relative w-full max-w-md overflow-hidden',
          'rounded-xl border border-white/10 bg-slate-900/70 p-6 text-slate-100',
          'shadow-xl backdrop-blur-md ring-1 ring-white/5',
        ].join(' ')}
        role="status"
      >
        {/* Soft tinted glow ring matching tone */}
        <div
          aria-hidden
          className={[
            'pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br opacity-60 blur-2xl ring-1',
            TONE_RING[v.tone],
          ].join(' ')}
        />
        <div className="relative">
          <div
            className={[
              'mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md ring-1',
              TONE_ICON_BG[v.tone],
            ].join(' ')}
          >
            <Icon size={18} strokeWidth={2} />
          </div>
          <h3 className="text-base font-semibold text-white">{v.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
            {v.description}
          </p>
          {v.ctaHref && (
            <Link
              to={v.ctaHref}
              className={[
                'mt-5 inline-flex items-center gap-1.5 rounded-md',
                'bg-white px-3 py-1.5 text-xs font-semibold text-slate-900',
                'shadow-sm transition hover:bg-slate-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              ].join(' ')}
            >
              {v.ctaLabel}
              <ArrowUpRight size={13} strokeWidth={2.25} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeoEmptyState;
