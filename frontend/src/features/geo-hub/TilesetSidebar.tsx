// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
/**
 * Left rail listing every tileset in the project map config.
 *
 * Behaviour:
 *
 * * Each card surfaces name, status (colour-coded), tile count + size,
 *   last-updated relative time and the underlying source kind.
 * * Visibility toggle (eye icon) flips a per-id ``hidden`` flag the
 *   parent owns so it can be wired to a future Cesium "hide tileset"
 *   action without reaching across components.
 * * Click anywhere else on the card → ``onFocus(tileset)`` so the
 *   parent can fly the camera to the bounding volume.
 * * Skeleton state is rendered while the map config is loading; an
 *   empty list renders a small inline note (the *page-level* empty
 *   state handles the bigger "convert a model" CTA).
 */

import { useTranslation } from 'react-i18next';
import {
  Layers,
  Eye,
  EyeOff,
  ChevronRight,
  type LucideIcon,
  Cuboid,
  Building,
  CloudCog,
  Camera,
  UploadCloud,
  Map as MapIcon,
} from 'lucide-react';

import { GeoStatusBadge } from './GeoStatusBadge';
import type { GeoSourceKind, Tileset } from './types';
import { formatBytes, formatRelativeTime } from './utils';

interface TilesetSidebarProps {
  tilesets: Tileset[] | undefined;
  isLoading: boolean;
  hiddenIds: Set<string>;
  focusedId: string | null;
  onToggleVisibility: (tilesetId: string) => void;
  onFocus: (tileset: Tileset) => void;
}

const SOURCE_ICON: Record<GeoSourceKind, LucideIcon> = {
  bim_model: Cuboid,
  federation: Building,
  development: Building,
  upload: UploadCloud,
  point_cloud: CloudCog,
  photogrammetry: Camera,
};

function TilesetCard({
  tileset,
  hidden,
  focused,
  onToggleVisibility,
  onFocus,
}: {
  tileset: Tileset;
  hidden: boolean;
  focused: boolean;
  onToggleVisibility: (id: string) => void;
  onFocus: (t: Tileset) => void;
}) {
  const { t } = useTranslation();
  const Icon = SOURCE_ICON[tileset.source_kind] ?? Layers;
  const lastUpdated = tileset.generated_at ?? tileset.updated_at;

  return (
    <div
      className={[
        'group relative w-full rounded-md border bg-surface-primary p-2.5',
        'transition-colors duration-fast ease-oe',
        focused
          ? 'border-oe-blue/60 ring-1 ring-oe-blue/30'
          : 'border-border hover:border-content-tertiary',
        hidden ? 'opacity-60' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onFocus(tileset)}
        className="flex w-full items-start gap-2 text-left"
        aria-label={t('geo_hub.sidebar.fly_to', {
          defaultValue: 'Fly to {{name}}',
          name: tileset.name,
        })}
      >
        <span
          className={[
            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center',
            'rounded-sm bg-surface-secondary text-content-secondary',
          ].join(' ')}
        >
          <Icon size={14} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-content-primary">
              {tileset.name || tileset.id.slice(0, 8)}
            </span>
            <ChevronRight
              size={12}
              className="ml-auto shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <GeoStatusBadge status={tileset.status} />
            <span className="text-2xs text-content-tertiary uppercase tracking-wider">
              {tileset.tile_format}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-content-tertiary">
            {tileset.tile_count > 0 && (
              <span>
                {t('geo_hub.sidebar.tile_count', {
                  defaultValue: '{{count}} tiles',
                  count: tileset.tile_count,
                })}
              </span>
            )}
            {tileset.total_bytes > 0 && <span>{formatBytes(tileset.total_bytes)}</span>}
            {lastUpdated && (
              <span title={lastUpdated}>
                {t('geo_hub.sidebar.updated_ago', {
                  defaultValue: 'updated {{rel}} ago',
                  rel: formatRelativeTime(lastUpdated),
                })}
              </span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility(tileset.id);
        }}
        className={[
          'absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center',
          'rounded-sm text-content-tertiary opacity-0 transition',
          'hover:bg-surface-secondary hover:text-content-primary group-hover:opacity-100',
          hidden ? 'opacity-100' : '',
        ].join(' ')}
        aria-pressed={!hidden}
        aria-label={
          hidden
            ? t('geo_hub.sidebar.show', { defaultValue: 'Show on map' })
            : t('geo_hub.sidebar.hide', { defaultValue: 'Hide from map' })
        }
      >
        {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-md border border-border bg-surface-primary p-2.5">
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 shrink-0 rounded-sm bg-surface-secondary animate-pulse" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-surface-secondary animate-pulse" />
          <div className="h-2.5 w-1/2 rounded bg-surface-secondary animate-pulse" />
          <div className="h-2.5 w-2/3 rounded bg-surface-secondary animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function TilesetSidebar({
  tilesets,
  isLoading,
  hiddenIds,
  focusedId,
  onToggleVisibility,
  onFocus,
}: TilesetSidebarProps) {
  const { t } = useTranslation();

  const readyCount = (tilesets ?? []).filter((ts) => ts.status === 'ready').length;
  const failedCount = (tilesets ?? []).filter((ts) => ts.status === 'failed').length;
  const procCount = (tilesets ?? []).filter((ts) => ts.status === 'generating').length;

  return (
    <aside
      className={[
        'flex w-72 shrink-0 flex-col border-r border-border bg-surface-secondary',
      ].join(' ')}
      aria-label={t('geo_hub.sidebar.aria', { defaultValue: 'Tileset rail' })}
    >
      <header className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Layers size={13} className="text-content-tertiary" />
          <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-content-secondary">
            {t('geo_hub.sidebar.title', { defaultValue: 'Tilesets' })}
          </h2>
          {tilesets && (
            <span className="ml-auto text-2xs font-medium text-content-tertiary">
              {tilesets.length}
            </span>
          )}
        </div>
        {tilesets && tilesets.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2 text-2xs text-content-tertiary">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {readyCount}
            </span>
            {procCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                {procCount}
              </span>
            )}
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {failedCount}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
        {!isLoading && (!tilesets || tilesets.length === 0) && (
          <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
            <MapIcon size={18} className="text-content-quaternary" />
            <p className="text-xs text-content-tertiary">
              {t('geo_hub.sidebar.empty', {
                defaultValue: 'No tilesets in this project yet.',
              })}
            </p>
          </div>
        )}
        {!isLoading &&
          tilesets?.map((ts) => (
            <TilesetCard
              key={ts.id}
              tileset={ts}
              hidden={hiddenIds.has(ts.id)}
              focused={focusedId === ts.id}
              onToggleVisibility={onToggleVisibility}
              onFocus={onFocus}
            />
          ))}
      </div>
    </aside>
  );
}

export default TilesetSidebar;
