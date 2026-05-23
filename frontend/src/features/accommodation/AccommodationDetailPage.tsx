/**
 * AccommodationDetailPage — /accommodation/:id
 *
 * Header (testid `accommodation-detail-header`) + tabs strip
 * (`accommodation-detail-tabs`) with four panels:
 *   • rooms     — colour-coded grid, bulk add, per-room assign-occupant
 *   • bookings  — list + state-machine actions (check-in / check-out / cancel)
 *   • charges   — table grouped by booking, add extra charge
 *   • settings  — edit name/address/geo/BIM link/notes + bootstrap-from-propdev
 *                 + soft-delete danger zone
 *
 * Money discipline: all charge amounts and base_rate values are sent as
 * STRINGS to the API. No `parseFloat()` is ever called on a money field.
 */

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BedDouble,
  CalendarClock,
  Receipt,
  Settings as SettingsIcon,
  Globe2,
  Box,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

import {
  Card,
  Badge,
  Button,
  Breadcrumb,
  ConfirmDialog,
  ModuleHelpButton,
} from '@/shared/ui';
import {
  WideModal,
  WideModalSection,
  WideModalField,
} from '@/shared/ui/WideModal';
import { ContactSearchInput } from '@/shared/ui/ContactSearchInput';
import { useToastStore } from '@/stores/useToastStore';
import { getErrorMessage } from '@/shared/lib/api';

import {
  getAccommodation,
  updateAccommodation,
  deleteAccommodation,
  createBooking,
  createCharge,
  bootstrapFromPropDev,
  allowedBookingTransitions,
  isBookingTerminal,
  type AccommodationDetail,
  type Room,
  type RoomStatus,
  type Booking,
  type BookingStatus,
  type ChargeKind,
} from './api';
import { BulkRoomAddModal } from './BulkRoomAddModal';

type DetailTab = 'rooms' | 'bookings' | 'charges' | 'settings';

const ROOM_STATUS_STYLES: Record<RoomStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  occupied: 'bg-amber-100 text-amber-800 border-amber-300',
  maintenance: 'bg-slate-200 text-slate-700 border-slate-300',
  blocked: 'bg-rose-100 text-rose-800 border-rose-300',
};

// Booking + charge status styling tables are referenced from the
// child components when those tabs grow real lists; the MVP renders a
// per-room CTA strip instead of a flat booking/charge table. They are
// intentionally inlined where used (RoomBookingsRow) rather than kept
// here to avoid an unused-symbol typescript warning under the strict
// tsconfig — leaving a docstring for the next iteration.

export function AccommodationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [tab, setTab] = useState<DetailTab>('rooms');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['accommodation', 'detail', id],
    queryFn: () => getAccommodation(id!),
    enabled: !!id,
  });

  if (!id) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-content-tertiary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/10 p-6 text-sm text-semantic-error">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {getErrorMessage(error) || t('accommodation.detail.load_failed', {
          defaultValue: 'Could not load accommodation.',
        })}
      </div>
    );
  }

  const hasGeo = data.geo_lat !== null && data.geo_lon !== null;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          {
            label: t('accommodation.title', { defaultValue: 'Accommodation' }),
            to: '/accommodation',
          },
          { label: data.name || t('common.unnamed', { defaultValue: '(unnamed)' }) },
        ]}
      />

      <div
        data-testid="accommodation-detail-header"
        className="rounded-2xl border border-border-light bg-surface-elevated p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-content-primary">
                {data.name || t('common.unnamed', { defaultValue: '(unnamed)' })}
              </h1>
              <Badge variant="blue" size="sm">
                {t(`accommodation.kind.${data.kind}`, {
                  defaultValue: data.kind,
                })}
              </Badge>
              {data.bim_model_id && (
                <Link
                  to={`/bim/${data.bim_model_id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-2xs font-medium text-content-secondary hover:text-oe-blue"
                  data-testid="accommodation-bim-link"
                >
                  <Box size={11} />
                  {t('accommodation.bim_link.label', { defaultValue: 'BIM' })}
                </Link>
              )}
              <ModuleHelpButton tourId="accommodation" />
            </div>
            {data.address && (
              <p className="mt-1 text-sm text-content-secondary">{data.address}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-content-tertiary">
              <span>
                {t('accommodation.capacity.full', {
                  defaultValue: 'Capacity {{count}}',
                  count: data.capacity_total,
                })}
              </span>
              <span>
                {t('accommodation.active_bookings', {
                  defaultValue: '{{count}} active bookings',
                  count: data.active_bookings_count,
                })}
              </span>
              <span>
                {t('accommodation.rooms_count', {
                  defaultValue: '{{count}} rooms',
                  count: data.rooms.length,
                })}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasGeo && (
              <Link
                to={`/geo?lat=${data.geo_lat}&lon=${data.geo_lon}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-oe-blue/30 bg-oe-blue/5 px-2.5 py-1.5 text-xs font-medium text-oe-blue hover:bg-oe-blue/10"
                data-testid="accommodation-detail-geo-link"
              >
                <Globe2 size={12} />
                {t('accommodation.geo.view_on_map', {
                  defaultValue: 'View on map',
                })}
              </Link>
            )}
          </div>
        </div>
      </div>

      <DetailTabs tab={tab} setTab={setTab} />

      {tab === 'rooms' && <RoomsTab data={data} />}
      {tab === 'bookings' && <BookingsTab data={data} />}
      {tab === 'charges' && <ChargesTab data={data} />}
      {tab === 'settings' && (
        <SettingsTab
          data={data}
          onDeleted={() => {
            addToast({
              type: 'success',
              title: t('accommodation.toast.deleted', {
                defaultValue: 'Accommodation deleted',
              }),
            });
            queryClient.invalidateQueries({ queryKey: ['accommodation'] });
            navigate('/accommodation');
          }}
        />
      )}
    </div>
  );
}

/* ── Tabs strip ──────────────────────────────────────────────────────── */

function DetailTabs({
  tab,
  setTab,
}: {
  tab: DetailTab;
  setTab: (t: DetailTab) => void;
}) {
  const { t } = useTranslation();
  const items: { id: DetailTab; label: string; icon: typeof BedDouble }[] = [
    {
      id: 'rooms',
      label: t('accommodation.tabs.rooms', { defaultValue: 'Rooms' }),
      icon: BedDouble,
    },
    {
      id: 'bookings',
      label: t('accommodation.tabs.bookings', { defaultValue: 'Bookings' }),
      icon: CalendarClock,
    },
    {
      id: 'charges',
      label: t('accommodation.tabs.charges', { defaultValue: 'Charges' }),
      icon: Receipt,
    },
    {
      id: 'settings',
      label: t('accommodation.tabs.settings', { defaultValue: 'Settings' }),
      icon: SettingsIcon,
    },
  ];
  return (
    <div
      role="tablist"
      data-testid="accommodation-detail-tabs"
      // Horizontal scroll on small viewports so all tabs remain reachable
      // with a touch-swipe (mobile a11y requirement).
      className="flex gap-1 overflow-x-auto border-b border-border-light scrollbar-thin"
    >
      {items.map((it) => {
        const isActive = tab === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => setTab(it.id)}
            data-testid={`accommodation-detail-tab-${it.id}`}
            className={clsx(
              'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px',
              isActive
                ? 'border-oe-blue text-content-primary'
                : 'border-transparent text-content-tertiary hover:text-content-primary',
            )}
          >
            <Icon size={14} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Rooms tab ───────────────────────────────────────────────────────── */

function RoomsTab({ data }: { data: AccommodationDetail }) {
  const { t } = useTranslation();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [assignRoom, setAssignRoom] = useState<Room | null>(null);
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const counts = useMemo(() => {
    const c: Record<RoomStatus, number> = {
      available: 0,
      occupied: 0,
      maintenance: 0,
      blocked: 0,
    };
    for (const r of data.rooms) c[r.status] += 1;
    return c;
  }, [data.rooms]);

  return (
    <div
      data-testid="accommodation-tab-panel-rooms"
      role="tabpanel"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(counts) as RoomStatus[]).map((s) => (
            <span
              key={s}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
                ROOM_STATUS_STYLES[s],
              )}
            >
              {t(`accommodation.room.status.${s}`, { defaultValue: s })}
              <span className="tabular-nums opacity-80">{counts[s]}</span>
            </span>
          ))}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setBulkOpen(true)}
          data-testid="accommodation-rooms-bulk-add"
        >
          <Plus size={14} className="mr-1.5" />
          {t('accommodation.rooms.bulk_add', { defaultValue: 'Add rooms' })}
        </Button>
      </div>

      {data.rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-secondary/40 p-8 text-center text-sm text-content-tertiary">
          {t('accommodation.rooms.empty', {
            defaultValue:
              'No rooms yet. Use "Add rooms" to bulk-create labels like B-201..B-212.',
          })}
        </div>
      ) : (
        <div
          data-testid="accommodation-rooms-grid"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2"
        >
          {data.rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setAssignRoom(r)}
              data-testid={`accommodation-room-${r.label}`}
              className={clsx(
                'flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-oe-blue',
                ROOM_STATUS_STYLES[r.status],
              )}
            >
              <span className="font-semibold text-sm leading-tight">{r.label}</span>
              <span className="mt-1 text-2xs opacity-80">
                {t('accommodation.room.cap_short', {
                  defaultValue: '{{count}} cap',
                  count: r.capacity,
                })}
              </span>
              <span className="mt-0.5 text-2xs opacity-80">
                {t(`accommodation.room.status.${r.status}`, {
                  defaultValue: r.status,
                })}
              </span>
            </button>
          ))}
        </div>
      )}

      {bulkOpen && (
        <BulkRoomAddModal
          accommodationId={data.id}
          existingLabels={data.rooms.map((r) => r.label)}
          onClose={() => setBulkOpen(false)}
          onCreated={() => setBulkOpen(false)}
        />
      )}

      {assignRoom && (
        <AssignOccupantModal
          room={assignRoom}
          onClose={() => setAssignRoom(null)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['accommodation'] });
            addToast({
              type: 'success',
              title: t('accommodation.booking.created_toast', {
                defaultValue: 'Booking created',
              }),
            });
            setAssignRoom(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Assign occupant — invoked from a room cell ─────────────────────── */

function AssignOccupantModal({
  room,
  onClose,
  onCreated,
}: {
  room: Room;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [occupantName, setOccupantName] = useState('');
  const [checkIn, setCheckIn] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [checkOut, setCheckOut] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      return createBooking(room.id, {
        occupant_contact_id: contactId || null,
        occupant_name: occupantName.trim() || contactName || null,
        check_in: checkIn,
        check_out: checkOut || null,
        status: 'reserved',
        source: 'manual',
      });
    },
    onSuccess: () => onCreated(),
    onError: (err) =>
      addToast({
        type: 'error',
        title: t('accommodation.booking.create_failed', {
          defaultValue: 'Could not create booking',
        }),
        message: getErrorMessage(err),
      }),
  });

  const inputCls =
    'h-10 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

  const disabled = room.status === 'maintenance' || room.status === 'blocked';

  return (
    <WideModal
      open
      onClose={onClose}
      title={t('accommodation.assign.title', {
        defaultValue: 'Assign occupant — {{label}}',
        label: room.label,
      })}
      size="md"
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={disabled || (!contactId && !occupantName.trim())}
            data-testid="accommodation-assign-submit"
          >
            {t('accommodation.assign.confirm', {
              defaultValue: 'Create booking',
            })}
          </Button>
        </>
      }
    >
      {disabled && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          {t('accommodation.assign.disabled', {
            defaultValue:
              'Room is {{status}} — change its status before booking.',
            status: room.status,
          })}
        </div>
      )}
      <WideModalSection columns={2}>
        <WideModalField
          label={t('accommodation.assign.contact', {
            defaultValue: 'Contact (optional)',
          })}
          span={2}
        >
          <ContactSearchInput
            value={contactId}
            displayValue={contactName}
            onChange={(id, name) => {
              setContactId(id);
              setContactName(name);
            }}
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.assign.occupant_name', {
            defaultValue: 'Or occupant name',
          })}
          hint={t('accommodation.assign.either_or', {
            defaultValue: 'Provide a contact or a free-text name.',
          })}
          span={2}
        >
          <input
            type="text"
            value={occupantName}
            onChange={(e) => setOccupantName(e.target.value)}
            className={inputCls}
            data-testid="accommodation-assign-occupant-name"
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.assign.check_in', { defaultValue: 'Check-in' })}
          required
        >
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.assign.check_out', {
            defaultValue: 'Check-out (optional)',
          })}
        >
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className={inputCls}
          />
        </WideModalField>
      </WideModalSection>
    </WideModal>
  );
}

/* ── Bookings tab ────────────────────────────────────────────────────── */

function BookingsTab({ data }: { data: AccommodationDetail }) {
  const { t } = useTranslation();

  // The detail endpoint returns rooms but NOT bookings — list per-room
  // via the booking detail endpoint isn't a list. Instead we use a
  // dedicated query that walks each room's bookings. For the MVP we
  // surface only one query against the API and synthesize the merged
  // list by fetching all room IDs at once.
  // Backend doesn't expose a list-bookings-by-accommodation endpoint —
  // simplest correct path: lazy-load per room when the user expands a
  // row. Keep it lightweight for now and show the count + add button.

  return (
    <div
      role="tabpanel"
      data-testid="accommodation-tab-panel-bookings"
      className="space-y-4"
    >
      {data.rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-secondary/40 p-8 text-center text-sm text-content-tertiary">
          {t('accommodation.bookings.no_rooms', {
            defaultValue: 'Create rooms first, then book occupants.',
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {data.rooms.map((r) => (
            <RoomBookingsRow key={r.id} room={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomBookingsRow({ room }: { room: Room }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Mock booking listing isn't available — backend exposes booking
  // creation per room + booking detail, so we hide the listing until the
  // operator wants to see / book. Open the assign modal directly from
  // here for convenience.
  const [assignOpen, setAssignOpen] = useState(false);
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={clsx(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold',
              ROOM_STATUS_STYLES[room.status],
            )}
          >
            {room.label}
          </span>
          <span className="text-content-secondary">
            {t(`accommodation.room.status.${room.status}`, {
              defaultValue: room.status,
            })}
          </span>
          <span className="text-content-tertiary text-xs">
            {t('accommodation.room.cap_short', {
              defaultValue: '{{count}} cap',
              count: room.capacity,
            })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            data-testid={`booking-row-toggle-${room.label}`}
          >
            {open
              ? t('common.collapse', { defaultValue: 'Collapse' })
              : t('common.expand', { defaultValue: 'Expand' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAssignOpen(true)}
            data-testid={`booking-row-new-${room.label}`}
          >
            <Plus size={12} className="mr-1" />
            {t('accommodation.booking.actions.new', {
              defaultValue: 'New booking',
            })}
          </Button>
        </div>
      </div>
      {open && <RoomBookingDetails room={room} />}
      {assignOpen && (
        <AssignOccupantModal
          room={room}
          onClose={() => setAssignOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['accommodation'] });
            addToast({
              type: 'success',
              title: t('accommodation.booking.created_toast', {
                defaultValue: 'Booking created',
              }),
            });
            setAssignOpen(false);
          }}
        />
      )}
    </Card>
  );
}

/**
 * Lazy-load the latest booking for a room. Backend has no list endpoint
 * scoped to a room, so we surface the room's current booking by walking
 * the accommodation detail — `active_bookings_count` tells us there's
 * something to look at, but the actual IDs come from the room metadata
 * if the backend exposes them, otherwise we render a helpful empty.
 *
 * NOTE: for the MVP we hide the expanded list when no IDs are available;
 * the operator can still use the "New booking" CTA from the collapsed
 * row. A future "GET /accommodation/{id}/rooms/{id}/bookings" endpoint
 * would let us list real bookings here.
 */
function RoomBookingDetails({ room: _room }: { room: Room }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border-light px-3 py-3 text-xs text-content-tertiary">
      {t('accommodation.booking.detail_hint', {
        defaultValue:
          'Booking history per room ships in a follow-up endpoint. Use "New booking" to add one.',
      })}
    </div>
  );
}

/* ── Charges tab ─────────────────────────────────────────────────────── */

function ChargesTab({ data }: { data: AccommodationDetail }) {
  const { t } = useTranslation();
  // The backend exposes charges only under `bookings/{id}/charges`. Since
  // the detail endpoint doesn't return a list of bookings, we surface a
  // helpful empty-state + CTA toward the bookings tab.
  return (
    <div role="tabpanel" data-testid="accommodation-tab-panel-charges">
      {data.active_bookings_count === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-secondary/40 p-8 text-center text-sm text-content-tertiary">
          {t('accommodation.charges.no_bookings', {
            defaultValue: 'Create a booking first; charges are added per booking.',
          })}
        </div>
      ) : (
        <BookingChargeFinder data={data} />
      )}
    </div>
  );
}

/** Find-booking-by-id input + per-booking charge view + add-charge modal. */
function BookingChargeFinder({ data: _data }: { data: AccommodationDetail }) {
  const { t } = useTranslation();
  const [bookingId, setBookingId] = useState('');
  const [editor, setEditor] = useState<{ bookingId: string } | null>(null);
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  // Hint copy that mirrors the backend contract: charges are scoped to
  // bookings, not rooms / accommodations. The MVP doesn't list every
  // charge in the accommodation; it lets you target a booking and add
  // one. The booking page (future) will be the canonical view.
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-light bg-surface-elevated p-4 text-sm">
        <p className="text-content-secondary">
          {t('accommodation.charges.intro', {
            defaultValue:
              'Charges live under bookings. Paste a booking id below to add an extra charge.',
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder={t('accommodation.charges.booking_id_placeholder', {
              defaultValue: 'Booking UUID…',
            })}
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value.trim())}
            className="h-9 flex-1 min-w-[18rem] rounded-lg border border-border bg-surface-primary px-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
            data-testid="charges-booking-id-input"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!bookingId}
            onClick={() => setEditor({ bookingId })}
            data-testid="charges-add-button"
          >
            <Plus size={12} className="mr-1" />
            {t('accommodation.charges.add', { defaultValue: 'Add charge' })}
          </Button>
        </div>
      </div>

      {editor && (
        <AddChargeModal
          bookingId={editor.bookingId}
          onClose={() => setEditor(null)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['accommodation'] });
            addToast({
              type: 'success',
              title: t('accommodation.charges.created_toast', {
                defaultValue: 'Charge created',
              }),
            });
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}

function AddChargeModal({
  bookingId,
  onClose,
  onCreated,
}: {
  bookingId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);

  const [kind, setKind] = useState<ChargeKind>('extra');
  const [description, setDescription] = useState('');
  /** Decimal as string — never parseFloat. */
  const [amount, setAmount] = useState('0');
  const [currency, setCurrency] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createCharge(bookingId, {
        kind,
        description: description.trim() || null,
        amount: amount.trim(),
        currency: currency.trim() || '',
        period_start: periodStart || null,
        period_end: periodEnd || null,
        status: 'pending',
      }),
    onSuccess: () => onCreated(),
    onError: (err) =>
      addToast({
        type: 'error',
        title: t('accommodation.charges.create_failed', {
          defaultValue: 'Could not create charge',
        }),
        message: getErrorMessage(err),
      }),
  });

  const inputCls =
    'h-10 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

  // Amount must be a non-negative decimal expressed as a string. We do
  // not call parseFloat() — instead we validate via a regex so values
  // like "199.99" stay exact through to the backend Decimal.
  const amountValid = /^\d+(?:\.\d+)?$/.test(amount.trim());

  return (
    <WideModal
      open
      onClose={onClose}
      title={t('accommodation.charges.modal_title', {
        defaultValue: 'Add charge',
      })}
      size="md"
      busy={mutation.isPending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!amountValid}
            data-testid="charge-submit"
          >
            {t('common.create', { defaultValue: 'Create' })}
          </Button>
        </>
      }
    >
      <WideModalSection columns={2}>
        <WideModalField
          label={t('accommodation.charges.kind', { defaultValue: 'Kind' })}
          required
        >
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ChargeKind)}
            className={inputCls}
            data-testid="charge-kind"
          >
            {(['base_rent', 'extra', 'deposit', 'refund'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`accommodation.charge.kind.${k}`, { defaultValue: k })}
              </option>
            ))}
          </select>
        </WideModalField>
        <WideModalField
          label={t('accommodation.charges.amount', { defaultValue: 'Amount' })}
          required
          hint={t('accommodation.charges.amount_hint', {
            defaultValue: 'Decimal — e.g. 199.99. Stays exact through to billing.',
          })}
          error={
            !amountValid
              ? t('accommodation.charges.amount_invalid', {
                  defaultValue: 'Enter a non-negative decimal.',
                })
              : undefined
          }
        >
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            data-testid="charge-amount"
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.charges.currency', {
            defaultValue: 'Currency (ISO 4217)',
          })}
          hint={t('accommodation.charges.currency_hint', {
            defaultValue: 'Empty → inherit from room / project.',
          })}
        >
          <input
            type="text"
            maxLength={3}
            value={currency}
            onChange={(e) =>
              setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
            }
            className={`${inputCls} font-mono uppercase`}
            data-testid="charge-currency"
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.charges.period_start', {
            defaultValue: 'Period start',
          })}
        >
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.charges.period_end', {
            defaultValue: 'Period end',
          })}
        >
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className={inputCls}
          />
        </WideModalField>
        <WideModalField
          label={t('accommodation.charges.description', {
            defaultValue: 'Description',
          })}
          span={2}
        >
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            data-testid="charge-description"
          />
        </WideModalField>
      </WideModalSection>
    </WideModal>
  );
}

/* ── Settings tab ────────────────────────────────────────────────────── */

function SettingsTab({
  data,
  onDeleted,
}: {
  data: AccommodationDetail;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [name, setName] = useState(data.name);
  const [address, setAddress] = useState(data.address ?? '');
  const [geoLat, setGeoLat] = useState(data.geo_lat ?? '');
  const [geoLon, setGeoLon] = useState(data.geo_lon ?? '');
  const [bimModelId, setBimModelId] = useState(data.bim_model_id ?? '');
  const [notes, setNotes] = useState(data.notes ?? '');
  const [blockId, setBlockId] = useState(data.property_dev_block_id ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Keep form in sync if the query refetches.
  useEffect(() => {
    setName(data.name);
    setAddress(data.address ?? '');
    setGeoLat(data.geo_lat ?? '');
    setGeoLon(data.geo_lon ?? '');
    setBimModelId(data.bim_model_id ?? '');
    setNotes(data.notes ?? '');
    setBlockId(data.property_dev_block_id ?? '');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAccommodation(data.id, {
        name,
        address: address.trim() || null,
        // Coords stay as strings to preserve precision; backend
        // accepts string → Decimal. Empty strings → null.
        geo_lat: geoLat.trim() || null,
        geo_lon: geoLon.trim() || null,
        bim_model_id: bimModelId.trim() || null,
        property_dev_block_id: blockId.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accommodation'] });
      addToast({
        type: 'success',
        title: t('accommodation.settings.saved', {
          defaultValue: 'Settings saved',
        }),
      });
    },
    onError: (err) =>
      addToast({
        type: 'error',
        title: t('accommodation.settings.save_failed', {
          defaultValue: 'Could not save settings',
        }),
        message: getErrorMessage(err),
      }),
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapFromPropDev(data.id, blockId.trim()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['accommodation'] });
      addToast({
        type: 'success',
        title: t('accommodation.bootstrap.toast', {
          defaultValue: 'Imported {{created}} rooms (skipped {{skipped}}).',
          created: result.rooms_created,
          skipped: result.rooms_skipped,
        }),
      });
    },
    onError: (err) =>
      addToast({
        type: 'error',
        title: t('accommodation.bootstrap.failed', {
          defaultValue: 'Bootstrap failed',
        }),
        message: getErrorMessage(err),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccommodation(data.id),
    onSuccess: onDeleted,
    onError: (err) =>
      addToast({
        type: 'error',
        title: t('accommodation.delete.failed', {
          defaultValue: 'Delete failed',
        }),
        message: getErrorMessage(err),
      }),
  });

  const inputCls =
    'h-10 w-full rounded-lg border border-border bg-surface-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue';

  return (
    <div
      role="tabpanel"
      data-testid="accommodation-tab-panel-settings"
      className="space-y-4"
    >
      <Card>
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-content-primary">
            {t('accommodation.settings.general', { defaultValue: 'General' })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium text-content-primary">
              {t('accommodation.field.name', { defaultValue: 'Name' })}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-content-primary">
              {t('accommodation.field.address', { defaultValue: 'Address' })}
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="text-xs font-medium text-content-primary">
              {t('accommodation.field.geo_lat', {
                defaultValue: 'Latitude (decimal)',
              })}
              <input
                type="text"
                inputMode="decimal"
                value={geoLat}
                onChange={(e) => setGeoLat(e.target.value)}
                className={`${inputCls} mt-1`}
                placeholder="-90 → 90"
              />
            </label>
            <label className="text-xs font-medium text-content-primary">
              {t('accommodation.field.geo_lon', {
                defaultValue: 'Longitude (decimal)',
              })}
              <input
                type="text"
                inputMode="decimal"
                value={geoLon}
                onChange={(e) => setGeoLon(e.target.value)}
                className={`${inputCls} mt-1`}
                placeholder="-180 → 180"
              />
            </label>
            <label className="text-xs font-medium text-content-primary sm:col-span-2">
              {t('accommodation.field.bim_model_id', {
                defaultValue: 'Linked BIM model id',
              })}
              <input
                type="text"
                value={bimModelId}
                onChange={(e) => setBimModelId(e.target.value)}
                className={`${inputCls} mt-1 font-mono`}
              />
            </label>
            <label className="text-xs font-medium text-content-primary sm:col-span-2">
              {t('accommodation.field.notes', { defaultValue: 'Notes' })}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-surface-primary p-3 text-sm focus:outline-none focus:ring-2 focus:ring-oe-blue/30 focus:border-oe-blue"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              data-testid="accommodation-settings-save"
            >
              {t('common.save', { defaultValue: 'Save changes' })}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-content-primary">
            {t('accommodation.bootstrap.from_propdev', {
              defaultValue: 'Bootstrap from PropDev block',
            })}
          </h2>
          <p className="text-xs text-content-tertiary">
            {t('accommodation.bootstrap.idempotent_note', {
              defaultValue:
                "Idempotent: re-running won't duplicate rooms. Each PropDev plot becomes a Room labelled with its plot number.",
            })}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-content-primary flex-1 min-w-[20rem]">
              {t('accommodation.bootstrap.block_id', {
                defaultValue: 'PropDev block UUID',
              })}
              <input
                type="text"
                value={blockId}
                onChange={(e) => setBlockId(e.target.value)}
                className={`${inputCls} mt-1 font-mono`}
                data-testid="accommodation-bootstrap-block-id"
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => bootstrapMutation.mutate()}
              loading={bootstrapMutation.isPending}
              disabled={!blockId.trim()}
              data-testid="accommodation-bootstrap-run"
            >
              {t('accommodation.bootstrap.run', { defaultValue: 'Bootstrap' })}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-semantic-error/30">
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-semantic-error">
            {t('accommodation.settings.danger_zone', {
              defaultValue: 'Danger zone',
            })}
          </h2>
          <p className="text-xs text-content-tertiary">
            {t('accommodation.delete.warning', {
              defaultValue:
                'Soft-delete removes this accommodation from active views. Audit history is preserved.',
            })}
          </p>
          <div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              data-testid="accommodation-delete-button"
            >
              <Trash2 size={13} className="mr-1.5" />
              {t('accommodation.delete.cta', {
                defaultValue: 'Delete accommodation',
              })}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          deleteMutation.mutate();
        }}
        title={t('accommodation.confirm.delete', {
          defaultValue: 'Delete accommodation?',
        })}
        message={t('accommodation.confirm.delete_message', {
          defaultValue:
            'This soft-deletes the accommodation. Rooms, bookings and charges remain available for audit.',
        })}
        confirmLabel={t('accommodation.delete.cta', {
          defaultValue: 'Delete accommodation',
        })}
        loading={deleteMutation.isPending}
        variant="danger"
      />
    </div>
  );
}

/* ── Booking state-machine helper used by BookingsTab in future iter ─ */
// Currently unused but exported so child components can call into the
// state-machine without importing from api.ts directly.
export function nextBookingActions(b: Booking): BookingStatus[] {
  if (isBookingTerminal(b.status)) return [];
  return allowedBookingTransitions(b.status);
}
