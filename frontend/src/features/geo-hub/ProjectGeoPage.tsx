// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
/**
 * Project-scoped Geo Hub page — /projects/:projectId/geo.
 *
 * Renders the lazy-loaded Cesium viewer scoped to one project's anchor,
 * imagery, tilesets, overlays and viewpoints. Issues a single map-config
 * fetch on mount via React Query (30s staleTime) and hands the bundle
 * to the viewer.
 */

import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getMapConfig } from './api';

const CesiumViewer = lazy(() =>
  import('./CesiumViewer').then((m) => ({ default: m.CesiumViewer })),
);

export function ProjectGeoPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();

  const { data, error, isLoading } = useQuery({
    queryKey: ['geo-hub', 'map-config', projectId],
    queryFn: () => getMapConfig(projectId!),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  if (!projectId) {
    return (
      <div className="p-6 text-sm text-red-600">
        {t('geo_hub.missing_project', {
          defaultValue: 'Project id missing from URL.',
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('geo_hub.project_title', { defaultValue: 'Project map' })}
        </h1>
        {data?.anchor && (
          <p className="mt-1 text-xs text-slate-500">
            {t('geo_hub.anchor_label', { defaultValue: 'Anchor:' })}{' '}
            {Number(data.anchor.lat).toFixed(4)},{' '}
            {Number(data.anchor.lon).toFixed(4)} (EPSG:{data.anchor.epsg_code}
            )
          </p>
        )}
      </header>
      <main className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {t('geo_hub.loading_config', {
              defaultValue: 'Loading geo configuration...',
            })}
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center text-sm text-red-600">
            {t('geo_hub.load_failed', {
              defaultValue: 'Could not load geo data for this project.',
            })}
          </div>
        )}
        {data && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {t('geo_hub.loading_viewer', {
                  defaultValue: 'Loading Cesium viewer (~3 MB)...',
                })}
              </div>
            }
          >
            <CesiumViewer mode="project" mapConfig={data} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default ProjectGeoPage;
