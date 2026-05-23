/**
 * Document Templates — Property Development settings page.
 *
 * Renders a 3-column card grid (1 col on mobile) covering:
 *   - the six built-in PDF generators shipped with the platform
 *     (Reservation Receipt, SPA, Payment Receipt, Handover Cert,
 *     Warranty Cert, NOC); each has working "Preview" + "Download
 *     sample" buttons that POST sample-preview and open the resulting
 *     PDF in a new tab via a blob URL.
 *   - tenant-uploaded custom templates (.docx / .html / .pdf / .odt /
 *     .md / .txt up to 10 MB), via the form at the top of the page
 *     (``POST /property-dev/document-templates/upload``). Custom rows
 *     get a "Download" button (streams the original bytes) and a
 *     "Delete" trash icon.
 *
 * Per-development override:
 *   The active development is stored in localStorage under
 *   ``propdev:doc-templates:active-dev``. Each card carries a "Set as
 *   default for current development" toggle that flips a per-doc_type
 *   key in localStorage — this is a client-side preference only (the
 *   real preferred-template-per-development feature ships with the
 *   document-generation events themselves, not the settings page).
 *
 * Variables documentation:
 *   The "{i}" button opens a WideModal listing the variables custom
 *   templates may interpolate (``{buyer.full_name}``, ``{plot.area_m2}``,
 *   …). The list comes from the catalogue endpoint, so the backend
 *   stays source-of-truth.
 *
 * Empty state:
 *   Even though built-in templates always exist, we render an empty
 *   state when the catalogue endpoint returns zero rows (e.g. an
 *   alternate tenant deployment that has disabled the built-ins).
 */

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  FileText,
  Globe2,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  SkeletonText,
  WideModal,
  WideModalSection,
  ConfirmDialog,
} from '@/shared/ui';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage } from '@/shared/lib/api';
import {
  customDocumentTemplateDownloadUrl,
  deleteCustomDocumentTemplate,
  listDocumentTemplates,
  sampleDocumentPreview,
  uploadCustomDocumentTemplate,
  type DocumentTemplateEntry,
  type DocumentTemplateVariableGroup,
  type PropDevDocType,
} from './api';

// Static icon map for built-ins. Custom uploads always render a
// generic FileText so the grid stays visually balanced.
const ICON_FOR_DOC: Record<string, React.ReactNode> = {
  reservation_receipt: <FileText size={16} />,
  sales_contract: <FileSignature size={16} />,
  payment_receipt: <FileText size={16} />,
  handover_certificate: <FileSignature size={16} />,
  warranty_certificate: <ShieldAlert size={16} />,
  noc: <FileSignature size={16} />,
};

// Built-in PropDev doc_types — the only ones the backend can render a
// PDF preview for today. Used to gate the Preview button on custom
// rows (uploaded .docx files don't go through the reportlab pipeline).
const BUILTIN_DOC_TYPES = new Set<string>([
  'reservation_receipt',
  'sales_contract',
  'payment_receipt',
  'handover_certificate',
  'warranty_certificate',
  'noc',
]);

const ACTIVE_DEV_LS_KEY = 'propdev:doc-templates:active-dev';
const DEFAULT_TPL_LS_PREFIX = 'propdev:doc-templates:default-for-dev:';

function readActiveDevelopmentId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DEV_LS_KEY);
  } catch {
    return null;
  }
}

function writeActiveDevelopmentId(value: string | null): void {
  try {
    if (value) localStorage.setItem(ACTIVE_DEV_LS_KEY, value);
    else localStorage.removeItem(ACTIVE_DEV_LS_KEY);
  } catch {
    /* localStorage may be unavailable (private mode, embedded iframe). */
  }
}

function getDefaultTemplateForDev(
  devId: string | null,
  docType: string,
): string | null {
  if (!devId) return null;
  try {
    return localStorage.getItem(`${DEFAULT_TPL_LS_PREFIX}${devId}:${docType}`);
  } catch {
    return null;
  }
}

function setDefaultTemplateForDev(
  devId: string | null,
  docType: string,
  templateId: string | null,
): void {
  if (!devId) return;
  try {
    const key = `${DEFAULT_TPL_LS_PREFIX}${devId}:${docType}`;
    if (templateId) localStorage.setItem(key, templateId);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function DocumentTemplatesSettingsPage() {
  const { t } = useTranslation();
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [activeDevId, setActiveDevId] = useState<string | null>(
    () => readActiveDevelopmentId(),
  );

  const dataQ = useQuery({
    queryKey: ['propdev', 'document-templates', activeDevId ?? ''],
    queryFn: () => listDocumentTemplates(activeDevId ?? undefined),
    staleTime: 5 * 60_000,
  });

  // Persist the active-dev pick on change.
  useEffect(() => {
    writeActiveDevelopmentId(activeDevId);
  }, [activeDevId]);

  const templates = dataQ.data?.templates ?? [];
  const builtins = templates.filter((t) => !t.is_custom);
  const customs = templates.filter((t) => t.is_custom);

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

      {/* Intro card with friendly explainer + variables modal trigger */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-content-primary">
              <FileSignature size={18} className="text-oe-blue" />
              {t('property_dev.doc_templates.title', {
                defaultValue: 'Document templates',
              })}
            </h1>
            <p className="mt-1 text-sm text-content-secondary max-w-3xl">
              {t('property_dev.doc_templates.intro', {
                defaultValue:
                  'Document templates power the PDF documents OpenConstructionERP generates for buyer journeys — reservation receipts, SPA contracts, handover protocols, warranty certificates. Pick a built-in template, preview it for your country / regulator, or upload your own .docx / .html / .pdf template.',
              })}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<Info size={14} />}
            onClick={() => setVariablesOpen(true)}
            data-testid="open-variables-doc"
          >
            {t('property_dev.doc_templates.variables_btn', {
              defaultValue: 'Template variables',
            })}
          </Button>
        </div>
        {dataQ.data && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-content-tertiary">
              {t('property_dev.doc_templates.locales_supported', {
                defaultValue: 'Locales:',
              })}
            </div>
            {dataQ.data.locales.map((l) => (
              <Badge key={l} variant="blue">
                {l.toUpperCase()}
              </Badge>
            ))}
            <div className="ml-3 text-xs text-content-tertiary">
              {t('property_dev.doc_templates.regulators_supported', {
                defaultValue: 'Regulators:',
              })}
            </div>
            {dataQ.data.regulators.map((r) => (
              <Badge key={r} variant="neutral">
                {r}
              </Badge>
            ))}
          </div>
        )}
        {/* Active development context — used by the per-dev "set as default" toggles */}
        <div className="mt-3 flex items-center gap-2 text-xs text-content-secondary">
          <label htmlFor="propdev-active-dev" className="font-medium">
            {t('property_dev.doc_templates.active_dev_label', {
              defaultValue: 'Active development (for "set as default" toggles):',
            })}
          </label>
          <input
            id="propdev-active-dev"
            type="text"
            placeholder={t('property_dev.doc_templates.active_dev_placeholder', {
              defaultValue: 'Development UUID (optional)',
            })}
            value={activeDevId ?? ''}
            onChange={(e) => setActiveDevId(e.target.value.trim() || null)}
            className="h-7 w-72 max-w-full rounded border border-border bg-surface-primary px-2 text-xs"
            data-testid="active-dev-input"
          />
          {activeDevId && (
            <button
              type="button"
              className="text-xs text-content-tertiary underline"
              onClick={() => setActiveDevId(null)}
            >
              {t('common.clear', { defaultValue: 'Clear' })}
            </button>
          )}
        </div>
      </Card>

      {/* Upload custom template */}
      <UploadCustomTemplateForm
        onUploaded={() => dataQ.refetch()}
        allowedExtensions={
          dataQ.data?.upload?.allowed_extensions ?? [
            '.docx', '.html', '.htm', '.pdf', '.odt', '.md', '.txt',
          ]
        }
        maxSizeMb={dataQ.data?.upload?.max_size_mb ?? 10}
        activeDevId={activeDevId}
      />

      {/* Catalogue grid */}
      {dataQ.isLoading ? (
        <Card padding="md">
          <SkeletonText lines={6} />
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
      ) : templates.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<FileSignature size={22} />}
            title={t('property_dev.doc_templates.empty', {
              defaultValue: 'No templates yet',
            })}
            description={t('property_dev.doc_templates.empty_desc', {
              defaultValue:
                'Built-in templates ship with the platform; upload your first custom template using the form above.',
            })}
          />
        </Card>
      ) : (
        <>
          <SectionHeader
            label={t('property_dev.doc_templates.builtins_header', {
              defaultValue: 'Built-in templates',
            })}
            count={builtins.length}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {builtins.map((tpl) => (
              <TemplateCard
                key={tpl.doc_type}
                template={tpl}
                locales={dataQ.data!.locales}
                regulators={dataQ.data!.regulators}
                activeDevId={activeDevId}
                onAfterDelete={() => dataQ.refetch()}
              />
            ))}
          </div>
          {customs.length > 0 && (
            <>
              <SectionHeader
                label={t('property_dev.doc_templates.customs_header', {
                  defaultValue: 'Your uploaded templates',
                })}
                count={customs.length}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {customs.map((tpl) => (
                  <TemplateCard
                    key={tpl.id ?? tpl.doc_type}
                    template={tpl}
                    locales={dataQ.data!.locales}
                    regulators={dataQ.data!.regulators}
                    activeDevId={activeDevId}
                    onAfterDelete={() => dataQ.refetch()}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <VariablesModal
        open={variablesOpen}
        onClose={() => setVariablesOpen(false)}
        groups={dataQ.data?.variables ?? []}
      />
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mt-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-content-tertiary">
      <span>{label}</span>
      <Badge variant="neutral">{count}</Badge>
    </div>
  );
}

function UploadCustomTemplateForm({
  onUploaded,
  allowedExtensions,
  maxSizeMb,
  activeDevId,
}: {
  onUploaded: () => void;
  allowedExtensions: string[];
  maxSizeMb: number;
  activeDevId: string | null;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState('custom');
  const [entity, setEntity] = useState('custom');
  const [trigger, setTrigger] = useState('manual');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const accept = useMemo(() => allowedExtensions.join(','), [allowedExtensions]);

  const reset = () => {
    setFile(null);
    setName('');
    setDocType('custom');
    setEntity('custom');
    setTrigger('manual');
    setDescription('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      addToast({
        type: 'warning',
        title: t('property_dev.doc_templates.upload_no_file', {
          defaultValue: 'Pick a file before uploading',
        }),
      });
      return;
    }
    if (!name.trim()) {
      addToast({
        type: 'warning',
        title: t('property_dev.doc_templates.upload_no_name', {
          defaultValue: 'Give the template a name',
        }),
      });
      return;
    }
    setBusy(true);
    try {
      await uploadCustomDocumentTemplate({
        file,
        name: name.trim(),
        doc_type: docType,
        entity,
        trigger,
        description,
        development_id: activeDevId ?? undefined,
      });
      addToast({
        type: 'success',
        title: t('property_dev.doc_templates.upload_ok', {
          defaultValue: 'Template uploaded',
        }),
      });
      reset();
      onUploaded();
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-content-primary">
        <UploadIcon size={14} className="text-oe-blue" />
        {t('property_dev.doc_templates.upload_title', {
          defaultValue: 'Upload custom template',
        })}
      </h2>
      <p className="mt-1 text-xs text-content-tertiary">
        {t('property_dev.doc_templates.upload_subtitle', {
          defaultValue:
            'Accepts .docx, .html, .pdf, .odt, .md or .txt up to {{max}} MB. The file is stored against your project; rendering is done by the document-generation events.',
          max: maxSizeMb,
        })}
      </p>
      <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12" onSubmit={submit}>
        <div className="md:col-span-4">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_file', {
              defaultValue: 'File',
            })}
          </label>
          <input
            type="file"
            accept={accept}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-oe-blue/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-oe-blue hover:file:bg-oe-blue/20"
            data-testid="custom-upload-file"
          />
        </div>
        <div className="md:col-span-4">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_name', {
              defaultValue: 'Display name',
            })}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('property_dev.doc_templates.upload_field_name_ph', {
              defaultValue: 'e.g. KYC checklist (UAE 2026)',
            })}
            className="h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="custom-upload-name"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_doctype', {
              defaultValue: 'Doc type',
            })}
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-surface-primary px-2 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="custom-upload-doctype"
          >
            <option value="custom">custom</option>
            <option value="reservation_receipt">reservation_receipt</option>
            <option value="sales_contract">sales_contract</option>
            <option value="payment_receipt">payment_receipt</option>
            <option value="handover_certificate">handover_certificate</option>
            <option value="warranty_certificate">warranty_certificate</option>
            <option value="noc">noc</option>
            <option value="snag_report">snag_report</option>
            <option value="invoice">invoice</option>
            <option value="payment_reminder">payment_reminder</option>
            <option value="kyc_checklist">kyc_checklist</option>
            <option value="brokerage_commission">brokerage_commission</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_entity', {
              defaultValue: 'Entity',
            })}
          </label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-surface-primary px-2 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="custom-upload-entity"
          >
            <option value="custom">custom</option>
            <option value="reservation">reservation</option>
            <option value="sales_contract">sales_contract</option>
            <option value="instalment">instalment</option>
            <option value="handover">handover</option>
            <option value="snag">snag</option>
            <option value="broker">broker</option>
            <option value="buyer">buyer</option>
            <option value="plot">plot</option>
            <option value="development">development</option>
          </select>
        </div>
        <div className="md:col-span-8">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_desc', {
              defaultValue: 'Description (optional)',
            })}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('property_dev.doc_templates.upload_field_desc_ph', {
              defaultValue: 'Short note for your team',
            })}
            className="h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="custom-upload-desc"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
            {t('property_dev.doc_templates.upload_field_trigger', {
              defaultValue: 'Trigger',
            })}
          </label>
          <input
            type="text"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="manual"
            className="h-9 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="custom-upload-trigger"
          />
        </div>
        <div className="md:col-span-2 flex items-end">
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={busy}
            loading={busy}
            icon={<UploadIcon size={14} />}
            className="w-full"
            data-testid="custom-upload-submit"
          >
            {t('property_dev.doc_templates.upload_submit', {
              defaultValue: 'Upload',
            })}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TemplateCard({
  template,
  locales,
  regulators,
  activeDevId,
  onAfterDelete,
}: {
  template: DocumentTemplateEntry;
  locales: string[];
  regulators: string[];
  activeDevId: string | null;
  onAfterDelete: () => void;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const qc = useQueryClient();
  const [locale, setLocale] = useState(locales[0] ?? 'en');
  const [regulator, setRegulator] = useState(
    regulators.includes('NONE') ? 'NONE' : (regulators[0] ?? 'NONE'),
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCustom = !!template.is_custom;
  const canPreview =
    !isCustom && BUILTIN_DOC_TYPES.has(template.doc_type as string);
  const docTypeKey = String(template.doc_type);

  // SPA is the only template that injects jurisdiction clauses, so the
  // regulator dropdown only meaningfully affects sales_contract.
  const regulatorMatters = template.doc_type === 'sales_contract';

  const [isDefault, setIsDefault] = useState<boolean>(() => {
    if (!isCustom || !template.id || !activeDevId) return false;
    return getDefaultTemplateForDev(activeDevId, docTypeKey) === template.id;
  });
  useEffect(() => {
    if (!isCustom || !template.id || !activeDevId) {
      setIsDefault(false);
      return;
    }
    setIsDefault(
      getDefaultTemplateForDev(activeDevId, docTypeKey) === template.id,
    );
  }, [isCustom, template.id, docTypeKey, activeDevId]);

  const openSamplePreview = async () => {
    if (!canPreview) return;
    setBusy(true);
    try {
      const res = await sampleDocumentPreview(
        template.doc_type as PropDevDocType,
        locale,
        regulator,
      );
      const bin = atob(res.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        addToast({
          type: 'warning',
          title: t('property_dev.doc_templates.popup_blocked', {
            defaultValue:
              'Browser blocked the preview window. Allow pop-ups for this site and retry.',
          }),
        });
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = async () => {
    if (!canPreview) return;
    setBusy(true);
    try {
      const res = await sampleDocumentPreview(
        template.doc_type as PropDevDocType,
        locale,
        regulator,
      );
      const bin = atob(res.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const downloadCustom = () => {
    if (!template.id) return;
    window.open(customDocumentTemplateDownloadUrl(template.id), '_blank');
  };

  const doDelete = async () => {
    if (!template.id) return;
    setBusy(true);
    try {
      await deleteCustomDocumentTemplate(template.id);
      addToast({
        type: 'success',
        title: t('property_dev.doc_templates.delete_ok', {
          defaultValue: 'Template deleted',
        }),
      });
      setConfirmDelete(false);
      onAfterDelete();
      qc.invalidateQueries({ queryKey: ['propdev', 'document-templates'] });
    } catch (err) {
      addToast({ type: 'error', title: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const toggleDefault = () => {
    if (!isCustom || !template.id || !activeDevId) return;
    const next = !isDefault;
    setDefaultTemplateForDev(
      activeDevId,
      docTypeKey,
      next ? template.id : null,
    );
    setIsDefault(next);
    addToast({
      type: 'info',
      title: next
        ? t('property_dev.doc_templates.default_set', {
            defaultValue: 'Set as default for this development',
          })
        : t('property_dev.doc_templates.default_cleared', {
            defaultValue: 'Default cleared',
          }),
    });
  };

  const filteredRegulators = useMemo(
    () => (regulatorMatters ? regulators : ['NONE']),
    [regulatorMatters, regulators],
  );

  return (
    <Card className="overflow-hidden">
      <header className="flex items-start gap-3 border-b border-border-light px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oe-blue/10 text-oe-blue">
          {ICON_FOR_DOC[docTypeKey] ?? <FileText size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-content-primary truncate">
            {isCustom
              ? template.title
              : t(`property_dev.doc_templates.types.${docTypeKey}.title`, {
                  defaultValue: template.title,
                })}
          </h2>
          <p className="mt-0.5 text-xs text-content-tertiary line-clamp-3">
            {template.description ||
              t('property_dev.doc_templates.no_description', {
                defaultValue: 'No description.',
              })}
          </p>
        </div>
        {isCustom ? (
          <Badge variant="success">
            {t('property_dev.doc_templates.badge_custom', {
              defaultValue: 'Custom',
            })}
          </Badge>
        ) : (
          <Badge variant="blue">
            {t('property_dev.doc_templates.badge_builtin', {
              defaultValue: 'Built-in',
            })}
          </Badge>
        )}
      </header>
      <div className="px-4 py-3 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="uppercase tracking-wide text-content-tertiary">
              {t('property_dev.doc_templates.triggered_by', {
                defaultValue: 'Triggered by',
              })}
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

        {canPreview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-medium uppercase tracking-wide text-content-tertiary mb-1">
                <Globe2 size={10} className="mr-1 inline" />
                {t('property_dev.doc_templates.locale', {
                  defaultValue: 'Locale',
                })}
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
                {t('property_dev.doc_templates.regulator', {
                  defaultValue: 'Regulator',
                })}
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
        )}

        {/* Per-development override for custom templates */}
        {isCustom && template.id && activeDevId && (
          <div className="flex items-center justify-between rounded-md bg-surface-secondary px-2 py-1.5">
            <span className="text-[11px] text-content-secondary">
              {t('property_dev.doc_templates.default_for_dev', {
                defaultValue:
                  'Set as default for current development ({{dev}})',
                dev: activeDevId.slice(0, 8) + '…',
              })}
            </span>
            <button
              type="button"
              onClick={toggleDefault}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isDefault
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-surface-tertiary text-content-tertiary hover:bg-surface-tertiary/80'
              }`}
              data-testid={`toggle-default-${template.id}`}
            >
              {isDefault ? <CheckCircle2 size={11} /> : null}
              {isDefault
                ? t('common.yes', { defaultValue: 'Default' })
                : t('property_dev.doc_templates.set_default', {
                    defaultValue: 'Set default',
                  })}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="neutral">
            {t('property_dev.doc_templates.entity', { defaultValue: 'Entity' })}:{' '}
            {template.entity}
          </Badge>
          <div className="flex items-center gap-2">
            {canPreview && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download size={12} />}
                  onClick={downloadSample}
                  disabled={busy}
                  data-testid={`download-sample-${docTypeKey}`}
                >
                  {t('property_dev.doc_templates.download_sample', {
                    defaultValue: 'Download sample',
                  })}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={
                    busy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Eye size={12} />
                    )
                  }
                  onClick={openSamplePreview}
                  loading={busy}
                  data-testid={`preview-sample-${docTypeKey}`}
                >
                  {t('property_dev.doc_templates.preview_sample', {
                    defaultValue: 'Preview',
                  })}
                </Button>
              </>
            )}
            {isCustom && template.id && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download size={12} />}
                  onClick={downloadCustom}
                  disabled={busy}
                  data-testid={`download-custom-${template.id}`}
                >
                  {t('property_dev.doc_templates.download_custom', {
                    defaultValue: 'Download',
                  })}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={12} />}
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                  data-testid={`delete-custom-${template.id}`}
                >
                  {t('common.delete', { defaultValue: 'Delete' })}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          open={confirmDelete}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
          title={t('property_dev.doc_templates.delete_title', {
            defaultValue: 'Delete this template?',
          })}
          message={t('property_dev.doc_templates.delete_message', {
            defaultValue:
              'The file will be removed from storage and any per-development defaults pointing at it will fall back to the built-in template.',
          })}
          confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
          variant="danger"
          loading={busy}
        />
      )}
    </Card>
  );
}

function VariablesModal({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: DocumentTemplateVariableGroup[];
}) {
  const { t } = useTranslation();
  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('property_dev.doc_templates.variables_title', {
        defaultValue: 'Template variables',
      })}
      size="lg"
    >
      <p className="px-1 text-sm text-content-secondary">
        {t('property_dev.doc_templates.variables_intro', {
          defaultValue:
            'Use these placeholders inside your .docx / .html templates. The document-generation events interpolate them at render time from the active development, plot, buyer, contract, reservation, instalment and handover.',
        })}
      </p>
      <div className="mt-3 space-y-3">
        {groups.length === 0 ? (
          <p className="text-xs text-content-tertiary">
            {t('property_dev.doc_templates.variables_empty', {
              defaultValue:
                'No variable documentation is available — load this page from a tenant with property-dev enabled.',
            })}
          </p>
        ) : (
          groups.map((g) => (
            <WideModalSection key={g.group} title={g.label} columns={2}>
              {g.vars.map((v) => (
                <div
                  key={v.key}
                  className="flex flex-col rounded-md border border-border-light bg-surface-secondary px-2 py-1.5"
                >
                  <code className="text-xs text-oe-blue">{v.key}</code>
                  <span className="text-[11px] text-content-tertiary">
                    {v.desc}
                  </span>
                </div>
              ))}
            </WideModalSection>
          ))
        )}
      </div>
    </WideModal>
  );
}
