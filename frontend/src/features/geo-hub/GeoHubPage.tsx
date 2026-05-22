// DDC-CWICR-OE: DataDrivenConstruction · OpenConstructionERP
/**
 * Geo Hub — all-projects global map.
 *
 * Lazy-loaded; this is the first module page so Suspense is the only
 * boundary needed.
 */

import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';

const CesiumViewer = lazy(() =>
  import('./CesiumViewer').then((m) => ({ default: m.CesiumViewer })),
);

export function GeoHubPage() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('geo_hub.title', { defaultValue: 'Geo Hub' })}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('geo_hub.global_subtitle', {
            defaultValue:
              'Earth-scale map of every project anchor — drop into a project to see 3D Tiles, imagery, terrain, viewpoints and overlays.',
          })}
        </p>
      </header>
      <main className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {t('geo_hub.loading_viewer', {
                defaultValue: 'Loading Cesium viewer (~3 MB)...',
              })}
            </div>
          }
        >
          <CesiumViewer mode="global" />
        </Suspense>
      </main>
    </div>
  );
}

export default GeoHubPage;
