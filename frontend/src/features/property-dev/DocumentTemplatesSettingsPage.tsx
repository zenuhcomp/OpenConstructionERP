/**
 * Document template catalogue — settings page.
 *
 * Lists every PDF template shipped with the platform
 * (Reservation Receipt, SPA, Payment Receipt, Handover Certificate,
 * Warranty Certificate, NOC). Each row shows what triggers it, the
 * supported locales and a "Preview sample" button that calls
 * ``POST /property-dev/document-templates/{doc_type}/sample-preview``
 * to render a real PDF against synthetic stub data so the operator
 * can see the layout before any real contract is signed.
 *
 * Why no upload?
 *   Templates are source-of-truth code in
 *   ``backend/app/modules/property_dev/document_templates.py`` because
 *   they have to inject regulator-specific clauses pulled from JSON
 *   datafiles + run through reportlab. A "BYO template" feature would
 *   need a sandboxed Jinja / WeasyPrint pipeline — out of scope for
 *   this settings entry. The locale JSON files are user-overridable
 *   today via ``backend/app/modules/property_dev/data/document_locales/``.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon,
  Eye,
  FileSignature,
  FileText,
  Globe2,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  SkeletonTable,
} from '@/shared/ui';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage } from '@/shared/lib/api';
import {
  listDocumentTemplates,
  sampleDocumentPreview,
  type DocumentTemplateEntry,
  type PropDevDocType,
} from './api';

const ICON_FOR_DOC: Record<PropDevDocType, React.ReactNode> = {
  reservation_receipt: <FileText size={16} />,
  sales_contract: <FileSignature size={16} />,
  payment_receipt: <FileText size={16} />,
  handover_certificate: <FileSignature size={16} />,
  warranty_certificate: <ShieldAlert size={16} />,
  noc: <FileSignature size={16} />,
};

export function DocumentTemplatesSettingsPage() {
  const { t } = useTranslation();

  const dataQ = useQuery({
    queryKey: ['propdev', 'document-templates'],
    queryFn: listDocumentTemplates,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: t('nav.settings', { defaultValue: 'Settings' }) },
          {
            label: t('nav.property_dev', { defaultValue: 'Property Development' }),
            to: '/property-dev',
          },
          {
            label: t('property_dev.doc_templates.title', {
              defaultValue: 'Document templates',
            }),
          },
        ]}
      />
      <Card className="p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
          <FileSignature size={18} className="text-oe-blue" />
          {t('property_dev.doc_templates.title', {
            defaultValue: 'Document template catalogue',
          })}
        </h1>
        <p className="mt-1 text-xs text-content-tertiary">
          {t('property_dev.doc_templates.subtitle', {
            defaultValue:
              'Six PDF generators ship with the platform — reservation receipt, SPA, payment receipt, handover certificate, warranty certificate and NOC. Preview them against synthetic data here. Locale JSON files in `backend/app/modules/property_dev/data/document_locales/` are user-overridable; clause overrides live under `data/jurisdiction_clauses/`.',
          })}
        </p>
        {dataQ.data && (
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="text-xs text-content-secondary">
              {t('property_dev.doc_templates.locales_supported', {
                defaultValue: 'Locales:',
              })}
            </div>
            {dataQ.data.locales.map((l) => (
              <Badge key={l} variant="blue">{l.toUpperCase()}</Badge>
            ))}
            <div className="text-xs text-content-secondary ml-3">
              {t('property_dev.doc_templates.regulators_supported', {
                defaultValue: 'Regulators:',
              })}
            </div>
            {dataQ.data.regulators.map((r) => (
              <Badge key={r} variant="neutral">{r}</Badge>
            ))}
          </div>
        )}
      </Card>
      {dataQ.isLoading ? (
        <Card padding="md">
          <SkeletonTable rows={4} columns={3} />
        </Card>
      ) : dataQ.isError ? (
        <Card padding="md">
          <EmptyState
            icon={<AlertOctagon size={22} />}
            title={t('property_dev.doc_templates.load_error', {
              defaultValue: 'Could not load templates',
            })}
            description={getErrorMessage(dataQ.error)}
            action={{
              label: t('common.retry', { defaultValue: 'Retry' }),
              onClick: () => dataQ.refetch(),
            }}
          />
        </Card>
      ) : !dataQ.data || dataQ.data.templates.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<FileSignature size={22} />}
            title={t('property_dev.doc_templates.empty', {
              defaultValue: 'No templates available',
            })}
            description={t('property_dev.doc_templates.empty_desc', {
              defaultValue: 'The property-dev module did not register any document templates.',
            })}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {dataQ.data.templates.map((tpl) => (
            <TemplateCard
              key={tpl.doc_type}
              template={tpl}
              locales={dataQ.data!.locales}
              regulators={dataQ.data!.regulators}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  locales,
  regulators,
}: {
  template: DocumentTemplateEntry;
  locales: string[];
  regulators: string[];
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [locale, setLocale] = useState(locales[0] ?? 'en');
  const [regulator, setRegulator] = useState(regulators.includes('NONE') ? 'NONE' : (regulators[0] ?? 'NONE'));
  const [busy, setBusy] = useState(false);

  // SPA is the only template that injects jurisdiction clauses, so the
  // regulator dropdown only meaningfully affects sales_contract. We
  // still keep it enabled everywhere so the operator can verify the
  // selector is wired.
  const regulatorMatters = template.doc_type === 'sales_contract';

  const previewSample = async () => {
    setBusy(true);
    try {
      const res = await sampleDocumentPreview(template.doc_type, locale, regulator);
      const bin = atob(res.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // Open in a new tab. The user can keep iterating on locale +
      // regulator and reopen to compare layouts.
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        addToast({
          type: 'warning',
          title: t('property_dev.doc_templates.popup_blocked', {
            defaultValue:
              'Browser blocked the preview window. Allow pop-ups for this site and retry.',
          }),
        });
        // Fall back to triggering a download.
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        a.click();
      }
      // Revoke a short while later so the new tab has time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const filteredRegulators = useMemo(
    () => (regulatorMatters ? regulators : ['NONE']),
    [regulatorMatters, regulators],
  );

  return (
    <Card className="overflow-hidden">
      <header className="flex items-start gap-3 border-b border-border-light px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oe-blue/10 text-oe-blue">
          {ICON_FOR_DOC[template.doc_type]}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-content-primary truncate">
            {t(`property_dev.doc_templates.types.${template.doc_type}.title`, {
              defaultValue: template.title,
            })}
          </h2>
          <p className="mt-0.5 text-xs text-content-tertiary line-clamp-3">
            {template.description}
          </p>
        </div>
      </header>
      <div className="px-4 py-3 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="uppercase tracking-wide text-content-tertiary">
              {t('property_dev.doc_templates.triggered_by', { defaultValue: 'Triggered by' })}
            </p>
            <p className="mt-0.5 font-mono text-content-secondary break-all">
              {template.trigger}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-content-tertiary">
              {t('property_dev.doc_templates.pages', { defaultValue: 'Pages' })}
            </p>
            <p className="mt-0.5 text-content-primary">{template.pages}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
              <Globe2 size={10} className="mr-1 inline" />
              {t('property_dev.doc_templates.locale', { defaultValue: 'Locale' })}
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
              <ShieldAlert size={10} className="mr-1 inline" />
              {t('property_dev.doc_templates.regulator', { defaultValue: 'Regulator' })}
            </label>
            <select
              value={regulator}
              onChange={(e) => setRegulator(e.target.value)}
              disabled={!regulatorMatters}
              title={
                regulatorMatters
                  ? undefined
                  : t('property_dev.doc_templates.regulator_na', {
                      defaultValue:
                        'Regulator clauses only affect the Sale-Purchase Agreement.',
                    })
              }
              className="h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue disabled:opacity-50"
            >
              {filteredRegulators.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="neutral">
            {t('property_dev.doc_templates.entity', { defaultValue: 'Entity' })}: {template.entity}
          </Badge>
          <Button
            size="sm"
            variant="primary"
            icon={busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
            onClick={previewSample}
            loading={busy}
            data-testid={`preview-sample-${template.doc_type}`}
          >
            {t('property_dev.doc_templates.preview_sample', {
              defaultValue: 'Preview sample',
            })}
          </Button>
        </div>
      </div>
    </Card>
  );
}
