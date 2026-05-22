// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
/**
 * Per-development Geo Hub page — /property-dev/developments/:devId/geo.
 *
 * Same shape as ``ProjectGeoPage`` but scoped to a single property_dev
 * development. The backing event ``property_dev.development.created``
 * subscriber already places the development on the project map, so this
 * page is mostly a convenience entry point inside the property_dev UX.
 */

import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/lib/api';

import { getMapConfig } from './api';

interface DevelopmentSummary {
  id: string;
  project_id: string;
  name: string;
}

const CesiumViewer = lazy(() =>
  import('./CesiumViewer').then((m) => ({ default: m.CesiumViewer })),
);

export function DevelopmentGeoPage() {
  const { t } = useTranslation();
  const { devId } = useParams<{ devId: string }>();

  const development = useQuery({
    queryKey: ['property-dev', 'development', devId],
    queryFn: () =>
      apiGet<DevelopmentSummary>(`/v1/property-dev/developments/${devId}`),
    enabled: Boolean(devId),
    staleTime: 60_000,
  });

  const mapConfig = useQuery({
    queryKey: ['geo-hub', 'map-config', development.data?.project_id],
    queryFn: () => getMapConfig(development.data!.project_id),
    enabled: Boolean(development.data?.project_id),
    staleTime: 30_000,
  });

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('geo_hub.development_title', {
            defaultValue: 'Development map',
          })}
        </h1>
        {development.data && (
          <p className="mt-1 text-sm text-slate-500">
            {development.data.name}
          </p>
        )}
      </header>
      <main className="flex-1 overflow-hidden">
        {(development.isLoading || mapConfig.isLoading) && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {t('geo_hub.loading_config', {
              defaultValue: 'Loading geo configuration...',
            })}
          </div>
        )}
        {mapConfig.data && (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {t('geo_hub.loading_viewer', {
                  defaultValue: 'Loading Cesium viewer (~3 MB)...',
                })}
              </div>
            }
          >
            <CesiumViewer mode="development" mapConfig={mapConfig.data} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default DevelopmentGeoPage;
