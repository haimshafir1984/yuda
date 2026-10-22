import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Column, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Select, Spinner, Textarea,
} from '../../components/ui';
import { api } from '../../lib/api';
import { attendanceLabel, fmtDate, fmtDateRange, fmtDateTime, kindLabel, statusLabel } from '../../lib/format';
import type { ActivityRow, ExceptionRow, Member, MemberSessionAttendance, Restriction, Workshop } from '../../lib/types';

const FILTERS = [
  { value: 'all', label: 'הכל' },
  { value: 'future', label: 'עתידיות' },
  { value: 'active', label: 'פעילות' },
  { value: 'history', label: 'היסטוריות' },
] as const;

const workshopTone = (s: string) => (s === 'ONGOING' ? 'green' : s === 'PUBLISHED' ? 'blue' : s === 'CANCELLED' ? 'red' : s === 'FINISHED' ? 'gray' : 'amber');

export function ActivityTab({ memberId }: { memberId: number }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const activity = useQuery({ queryKey: ['member-activity', memberId], queryFn: () => api.get<ActivityRow[]>(`/members/${memberId}/activity`) });
  const detail = useQuery({ queryKey: ['member-session-attendance', memberId], queryFn: () => api.get<MemberSessionAttendance[]>(`/members/${memberId}/session-attendance`) });

  if (activity.isLoading) return <Spinner />;
  if (activity.error) return <ErrorBlock error={activity.error} onRetry={() => activity.refetch()} />;
  const rows = (activity.data ?? []).filter((r) => filter === 'all' || r.category === filter);
  const open = (r: ActivityRow) => nav(`/workshops/${r.workshopId}`);

  const columns: Column<ActivityRow>[] = [
    { key: 'name', header: 'שם הסדנה', cell: (r) => <span className="font-medium">{r.workshopName}</span> },
    { key: 'kind', header: 'סוג', cell: (r) => kindLabel[r.kind] },
    { key: 'date', header: 'תאריך', cell: (r) => fmtDateRange(r.startDate, r.endDate) },
    { key: 'ws', header: 'סטטוס הסדנה', cell: (r) => <Badge tone={workshopTone(r.workshopStatus)}>{statusLabel[r.workshopStatus]}</Badge> },
    {
      key: 'rs',
      header: 'סטטוס הרשמה',
      cell: (r) => (r.registrationStatus === 'ACTIVE' ? <Badge tone="green">רשום</Badge> : <Badge tone="red">בוטלה {r.cancelledAt ? fmtDate(r.cancelledAt) : ''}</Badge>),
    },
    {
      key: 'att',
      header: 'נוכחות',
      cell: (r) =>
        r.registrationStatus === 'CANCELLED' || r.attendance.totalSessions === 0 ? (
          '—'
        ) : (
          <span>
            {r.attendance.present} מתוך {r.attendance.totalSessions}
            {r.attendance.absent > 0 && <span className="text-slate-500"> ({r.attendance.absent === 1 ? 'היעדרות אחת' : `${r.attendance.absent} היעדרויות`})</span>}
          </span>
        ),
    },
    {
      key: 'open',
      header: 'פעולה',
      cell: (r) => (
        <Button size="sm" onClick={(e) => { e.stopPropagation(); open(r); }} aria-label={`פתיחת הסדנה ${r.workshopName}`}>
          פתח סדנה
        </Button>
      ),
    },
  ];

  const detailRows = detail.data ?? [];
  const detailCols: Column<MemberSessionAttendance>[] = [
    { key: 'w', header: 'סדנה', cell: (r) => r.workshopName },
    { key: 'n', header: 'מפגש', cell: (r) => `מפגש ${r.sessionNumber}` },
    { key: 'd', header: 'תאריך', cell: (r) => fmtDate(r.date) },
    { key: 't', header: 'שעה', cell: (r) => r.startTime ?? '—' },
    {
      key: 's',
      header: 'נוכחות',
      cell: (r) => <Badge tone={r.status === 'PRESENT' ? 'green' : r.status === 'ABSENT' ? 'red' : 'gray'}>{attendanceLabel[r.status]}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">סדנאות ואירועים של החבר</h2>
          <div role="group" aria-label="סינון לפי מצב" className="inline-flex overflow-hidden rounded-md border border-slate-300">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-sm ${filter === f.value ? 'bg-teal-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          caption="פעילות קבוצתית"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.registrationId}
          onRowClick={open}
          empty={<EmptyState title="אין פעילות להצגה" text={filter === 'all' ? 'החבר טרם נרשם לסדנאות או לאירועים. ניתן לרשום אותו מכרטיס הסדנה.' : 'אין רשומות התואמות לסינון.'} />}
        />
      </Card>
      {detailRows.length > 0 && (
        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">פירוט נוכחות לפי מפגש</h2>
          <DataTable caption="נוכחות לפי מפגש" columns={detailCols} rows={detailRows} rowKey={(r) => `${r.registrationId}-${r.sessionId}`} />
        </Card>
      )}
    </div>
  );
}

export function PreferencesTab({ member }: { member: Member }) {
  const [channel, setChannel] = useState<string>(member.preferredChannel);
  const save = useAction((c: string) => api.patch(`/members/${member.id}/preferences`, { preferredChannel: c }), { success: 'ההעדפה נשמרה' });
  return (
    <Card className="max-w-xl p-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">ערוץ תקשורת מועדף</legend>
        <div className="flex gap-6">
          {[
            ['SMS', 'SMS'],
            ['EMAIL', 'מייל'],
          ].map(([v, l]) => (
            <label key={v} className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="channel" className="size-4 accent-teal-600" checked={channel === v} onChange={() => setChannel(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-slate-500">ההעדפה נשמרת בלבד. במערכת זו לא נשלחות הודעות בפועל.</p>
      <Button variant="primary" className="mt-4" loading={save.isPending} disabled={channel === member.preferredChannel} onClick={() => save.mutate(channel)}>
        שמירה
      </Button>
    </Card>
  );
}

export function RestrictionsTab({ memberId }: { memberId: number }) {
  const q = useQuery({ queryKey: ['member-restrictions', memberId], queryFn: () => api.get<Restriction[]>(`/members/${memberId}/restrictions`) });
  const workshops = useQuery({ queryKey: ['workshops', 'all'], queryFn: () => api.get<Workshop[]>('/workshops') });
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<'GENERAL' | 'WORKSHOP'>('GENERAL');
  const [workshopId, setWorkshopId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<Restriction | null>(null);

  const add = useAction(() => api.post(`/members/${memberId}/restrictions`, { workshopId: scope === 'WORKSHOP' ? Number(workshopId) : null, reason }), {
    success: 'ההגבלה נוספה',
    onSuccess: () => { setAdding(false); setReason(''); setWorkshopId(''); setScope('GENERAL'); },
  });
  const remove = useAction((r: Restriction) => api.del(`/members/${memberId}/restrictions/${r.id}`), {
    success: 'ההגבלה הוסרה',
    onSuccess: () => setRemoving(null),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const columns: Column<Restriction>[] = [
    { key: 'scope', header: 'סוג הגבלה', cell: (r) => (r.scope === 'GENERAL' ? 'חסימה מכל הסדנאות והאירועים' : `חסימה מהסדנה: ${r.workshopName}`) },
    { key: 'reason', header: 'סיבה', cell: (r) => r.reason ?? '—' },
    { key: 'created', header: 'נוספה בתאריך', cell: (r) => fmtDate(r.createdAt) },
    { key: 'status', header: 'מצב', cell: (r) => (r.active ? <Badge tone="red">פעילה</Badge> : <Badge>הוסרה {fmtDate(r.removedAt)}</Badge>) },
    { key: 'act', header: 'פעולה', cell: (r) => (r.active ? <Button size="sm" variant="danger" onClick={() => setRemoving(r)}>הסר הגבלה</Button> : null) },
  ];

  const submit = () => {
    if (scope === 'WORKSHOP' && !workshopId) return setFormError('יש לבחור סדנה');
    setFormError('');
    add.mutate();
  };

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">הגבלות הרשמה</h2>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> הוסף הגבלה
        </Button>
      </div>
      <DataTable caption="הגבלות הרשמה" columns={columns} rows={q.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="אין הגבלות" text="לחבר אין הגבלות הרשמה." />} />

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="הוספת הגבלת הרשמה"
        footer={
          <>
            <Button variant="primary" loading={add.isPending} onClick={submit}>הוספה</Button>
            <Button onClick={() => setAdding(false)} disabled={add.isPending}>ביטול</Button>
          </>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">סוג ההגבלה</legend>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" className="accent-teal-600" checked={scope === 'GENERAL'} onChange={() => setScope('GENERAL')} /> חסימה כללית מכל הסדנאות והאירועים</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" className="accent-teal-600" checked={scope === 'WORKSHOP'} onChange={() => setScope('WORKSHOP')} /> חסימה מסדנה מסוימת</label>
            </div>
          </fieldset>
          {scope === 'WORKSHOP' && (
            <Field label="סדנה" required error={formError}>
              <Select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                <option value="">בחירת סדנה...</option>
                {(workshops.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="סיבה (אופציונלי)">
            <Textarea className="min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="הסרת הגבלה"
        description="לאחר ההסרה החבר יוכל להירשם. ההגבלה תישמר בהיסטוריה."
        confirmLabel="הסר הגבלה"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </Card>
  );
}

export function ExceptionsTab({ memberId }: { memberId: number }) {
  const q = useQuery({ queryKey: ['member-exceptions', memberId], queryFn: () => api.get<ExceptionRow[]>(`/members/${memberId}/exceptions`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const columns: Column<ExceptionRow>[] = [
    { key: 'w', header: 'שם הסדנה', cell: (r) => r.workshopName },
    { key: 'd', header: 'תאריך', cell: (r) => (r.type === 'CANCELLATION' ? fmtDateTime(r.date) : fmtDate(r.date)) },
    { key: 't', header: 'סוג חריגה', cell: (r) => (r.type === 'CANCELLATION' ? <Badge tone="amber">ביטול הרשמה</Badge> : <Badge tone="red">אי-הגעה</Badge>) },
    { key: 'x', header: 'פרטים נוספים', cell: (r) => r.details ?? '—' },
  ];
  return (
    <Card>
      <InlineAlert tone="blue">
        <span className="block">החריגות נגזרות מביטולי הרשמה ומהיעדרויות שסומנו בפועל במפגשים. אי-הגעה נרשמת רק כשסומן "לא הגיע".</span>
      </InlineAlert>
      <DataTable caption="חריגות" columns={columns} rows={q.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="אין חריגות" text="לא נרשמו ביטולים או היעדרויות." />} />
    </Card>
  );
}
