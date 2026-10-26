import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { todayStr } from '../../lib/format';
import { useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Column, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Select, Spinner, Textarea,
} from '../../components/ui';
import { api } from '../../lib/api';
import { attendanceLabel, copayPaymentLabel, fmtDate, fmtDateRange, fmtDateTime, fmtMoney, kindLabel, kindLabel2, processTypeLabel, requestStatusLabel, requestStatusTone, requestTypeLabel, socialStatusLabel, socialStatusTone, statusLabel, trackLabel, treatmentStatusLabel, treatmentStatusTone } from '../../lib/format';
import type { ActivityRow, ExceptionRow, Member, MemberCopayRow, MemberNote, MemberSessionAttendance, Restriction, ServiceRequest, SocialProcess, Treatment, TreatmentExceptionRow, Workshop } from '../../lib/types';

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
  const [sort, setSort] = useState<{ sort: string; order: 'asc' | 'desc' }>({ sort: 'date', order: 'desc' });
  const activity = useQuery({ queryKey: ['member-activity', memberId], queryFn: () => api.get<ActivityRow[]>(`/members/${memberId}/activity`) });
  const detail = useQuery({ queryKey: ['member-session-attendance', memberId], queryFn: () => api.get<MemberSessionAttendance[]>(`/members/${memberId}/session-attendance`) });

  if (activity.isLoading) return <Spinner />;
  if (activity.error) return <ErrorBlock error={activity.error} onRetry={() => activity.refetch()} />;
  const dir = sort.order === 'asc' ? 1 : -1;
  const rows = (activity.data ?? [])
    .filter((r) => filter === 'all' || r.category === filter)
    .sort((a, b) => {
      switch (sort.sort) {
        case 'name': return a.workshopName.localeCompare(b.workshopName, 'he') * dir;
        case 'kind': return (a.kind.localeCompare(b.kind) || a.workshopName.localeCompare(b.workshopName, 'he')) * dir;
        case 'status': return a.workshopStatus.localeCompare(b.workshopStatus) * dir;
        default: return (a.startDate ?? '').localeCompare(b.startDate ?? '') * dir;
      }
    });
  const onSort = (key: string) => setSort((p) => (p.sort === key ? { sort: key, order: p.order === 'asc' ? 'desc' : 'asc' } : { sort: key, order: 'asc' }));
  const open = (r: ActivityRow) => nav(`/workshops/${r.workshopId}`);

  const columns: Column<ActivityRow>[] = [
    { key: 'name', header: 'שם הסדנה', sortKey: 'name', cell: (r) => <span className="font-medium">{r.workshopName}</span> },
    { key: 'kind', header: 'סוג', sortKey: 'kind', cell: (r) => kindLabel[r.kind] },
    { key: 'date', header: 'תאריך', sortKey: 'date', cell: (r) => fmtDateRange(r.startDate, r.endDate) },
    { key: 'ws', header: 'סטטוס הסדנה', sortKey: 'status', cell: (r) => <Badge tone={workshopTone(r.workshopStatus)}>{statusLabel[r.workshopStatus]}</Badge> },
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
          sort={sort}
          onSort={onSort}
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
  const [scope, setScope] = useState<'GENERAL' | 'KIND' | 'WORKSHOP'>('GENERAL');
  const [kind, setKind] = useState('WORKSHOP');
  const [workshopId, setWorkshopId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<Restriction | null>(null);

  const add = useAction(() => api.post(`/members/${memberId}/restrictions`, { workshopId: scope === 'WORKSHOP' ? Number(workshopId) : null, kind: scope === 'KIND' ? kind : null, reason }), {
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
    { key: 'scope', header: 'סוג הגבלה', cell: (r) => (r.scope === 'GENERAL' ? 'חסימה מכל הסדנאות והאירועים' : r.scope === 'KIND' ? `חסימה מכל ${r.kind === 'EVENT' ? 'האירועים' : 'הסדנאות'}` : `חסימה מהפעילות: ${r.workshopName}`) },
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
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" className="accent-teal-600" checked={scope === 'KIND'} onChange={() => setScope('KIND')} /> חסימה מסוג פעילות (כל הסדנאות או כל האירועים)</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" className="accent-teal-600" checked={scope === 'WORKSHOP'} onChange={() => setScope('WORKSHOP')} /> חסימה מפעילות ספציפית שטרם התקיימה</label>
            </div>
          </fieldset>
          {scope === 'KIND' && (
            <Field label="סוג הפעילות">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="WORKSHOP">סדנאות</option>
                <option value="EVENT">אירועים</option>
              </Select>
            </Field>
          )}
          {scope === 'WORKSHOP' && (
            <Field label="פעילות" required error={formError}>
              <Select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                <option value="">בחירת סדנה...</option>
                {(workshops.data ?? [])
                  .filter((w) => w.status !== 'FINISHED' && w.status !== 'CANCELLED' && (!w.endDate || w.endDate >= todayStr()))
                  .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
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

type AnyException = {
  id: string;
  type: ExceptionRow['type'] | TreatmentExceptionRow['type'];
  title: string;
  date: string;
  details: string | null;
  treatmentId?: number;
};

const exceptionLabel: Record<AnyException['type'], { text: string; tone: 'amber' | 'red' | 'gray' }> = {
  CANCELLATION: { text: 'ביטול הרשמה', tone: 'amber' },
  ABSENCE: { text: 'אי-הגעה', tone: 'red' },
  TREATMENT_LATE_PAYMENT: { text: 'שפ״ח: איחור בתשלום', tone: 'amber' },
  TREATMENT_VIOLATION: { text: 'שפ״ח: השהיה בעקבות הפרה', tone: 'red' },
  TREATMENT_MANUAL: { text: 'שפ״ח: חריגה ידנית', tone: 'gray' },
};

export function ExceptionsTab({ memberId }: { memberId: number }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['member-exceptions', memberId], queryFn: () => api.get<ExceptionRow[]>(`/members/${memberId}/exceptions`) });
  const tq = useQuery({ queryKey: ['member-treatment-exceptions', memberId], queryFn: () => api.get<TreatmentExceptionRow[]>(`/members/${memberId}/treatment-exceptions`) });
  if (q.isLoading || tq.isLoading) return <Spinner />;
  if (q.error || tq.error) return <ErrorBlock error={q.error ?? tq.error} onRetry={() => { void q.refetch(); void tq.refetch(); }} />;

  const rows: AnyException[] = [
    ...(q.data ?? []).map((r) => ({ id: r.id, type: r.type, title: r.workshopName, date: r.date, details: r.details })),
    ...(tq.data ?? []).map((r) => ({ id: r.id, type: r.type, title: `תהליך שפ״ח #${r.treatmentId}`, date: r.date, details: r.details, treatmentId: r.treatmentId })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const columns: Column<AnyException>[] = [
    { key: 'w', header: 'שם הסדנה / התהליך', cell: (r) => r.title },
    { key: 'd', header: 'תאריך', cell: (r) => (r.type === 'ABSENCE' ? fmtDate(r.date) : fmtDateTime(r.date)) },
    { key: 't', header: 'סוג חריגה', cell: (r) => <Badge tone={exceptionLabel[r.type].tone}>{exceptionLabel[r.type].text}</Badge> },
    { key: 'x', header: 'פרטים נוספים', cell: (r) => r.details ?? '—' },
    { key: 'a', header: 'פעולה', cell: (r) => (r.treatmentId ? <Button size="sm" onClick={() => nav(`/treatments/${r.treatmentId}`)}>פתח כרטיס שפ״ח</Button> : null) },
  ];
  const count = (types: string[]) => rows.filter((r) => types.includes(r.type)).length;
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3" aria-label="ספירת חריגות">
        <Badge tone="amber">ביטולי הרשמה: {count(['CANCELLATION'])}</Badge>
        <Badge tone="red">אי-הגעות: {count(['ABSENCE'])}</Badge>
        <Badge tone="gray">חריגות שפ״ח: {count(['TREATMENT_LATE_PAYMENT', 'TREATMENT_VIOLATION', 'TREATMENT_MANUAL'])}</Badge>
      </div>
      <InlineAlert tone="blue">
        <span className="block">החריגות נגזרות מביטולי הרשמה ומהיעדרויות שסומנו בפועל במפגשים, ומחריגות שנרשמו בתהליכי שפ״ח. אי-הגעה נרשמת רק כשסומן "לא הגיע".</span>
      </InlineAlert>
      <DataTable caption="חריגות" columns={columns} rows={rows} rowKey={(r) => r.id} empty={<EmptyState title="אין חריגות" text="לא נרשמו ביטולים, היעדרויות או חריגות שפ״ח." />} />
    </Card>
  );
}

/** טאב "שירותים סוציאליים": שלושה אזורים, כל אחד טבלה: שפ״ח, ליווי עו״ס ופניות (כולל שהסתיימו) */
export function SocialServicesTab({ member }: { member: Member }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['member-treatments', member.id], queryFn: () => api.get<Treatment[]>(`/members/${member.id}/treatments`) });
  const sw = useQuery({ queryKey: ['member-social-work', member.id], queryFn: () => api.get<SocialProcess[]>(`/members/${member.id}/social-work`) });
  const rq = useQuery({ queryKey: ['member-service-requests', member.id], queryFn: () => api.get<ServiceRequest[]>(`/members/${member.id}/service-requests`) });
  const notes = useQuery({ queryKey: ['member-notes', member.id], queryFn: () => api.get<MemberNote[]>(`/members/${member.id}/notes`) });
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteError, setNoteError] = useState('');
  const addNote = useAction(() => api.post(`/members/${member.id}/notes`, { text: noteText, author: noteAuthor }), {
    success: 'ההערה נשמרה', onSuccess: () => { setNoteOpen(false); setNoteText(''); setNoteError(''); },
  });
  if (q.isLoading || sw.isLoading || rq.isLoading) return <Spinner />;
  const err = q.error ?? sw.error ?? rq.error;
  if (err) return <ErrorBlock error={err} onRetry={() => { void q.refetch(); void sw.refetch(); void rq.refetch(); }} />;

  const openT = (t: Treatment) => nav(`/treatments/${t.id}`);
  const tCols: Column<Treatment>[] = [
    { key: 'id', header: 'מזהה תהליך', cell: (t) => `#${t.id}` },
    { key: 'th', header: 'מטפל', cell: (t) => t.therapist?.fullName ?? <span className="text-slate-400">טרם נבחר</span> },
    { key: 'tr', header: 'מסלול', cell: (t) => trackLabel[t.track] },
    { key: 'sd', header: 'תאריך התחלה', cell: (t) => fmtDate(t.startDate) },
    { key: 's', header: 'סטטוס', cell: (t) => <Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge> },
    { key: 'h', header: 'פגישות שהתקיימו', cell: (t) => t.heldSessions },
    { key: 'a', header: 'פגישות מאושרות', cell: (t) => t.approvedSessions },
    { key: 'o', header: 'פעולה', cell: (t) => <Button size="sm" onClick={(e) => { e.stopPropagation(); openT(t); }}>פתח כרטיס שפ״ח</Button> },
  ];
  const openS = (p: SocialProcess) => nav(`/social-work/${p.id}`);
  const sCols: Column<SocialProcess>[] = [
    { key: 'id', header: 'מזהה תהליך', cell: (p) => `#${p.id}` },
    { key: 'w', header: 'עו״סית', cell: (p) => p.socialWorker ?? '—' },
    { key: 'k', header: 'מהות הליווי', cell: (p) => p.kinds.map((k) => kindLabel2[k]).join(', ') },
    { key: 'ty', header: 'סוג', cell: (p) => processTypeLabel[p.type] },
    { key: 'sd', header: 'תאריך התחלה', cell: (p) => fmtDate(p.startDate) },
    { key: 's', header: 'סטטוס', cell: (p) => <Badge tone={socialStatusTone(p.status)}>{socialStatusLabel[p.status]}</Badge> },
    { key: 'm', header: 'פגישות', cell: (p) => p.meetingCount },
    { key: 'o', header: 'פעולה', cell: (p) => <Button size="sm" onClick={(e) => { e.stopPropagation(); openS(p); }}>פתח כרטיס ליווי</Button> },
  ];
  const openR = (r: ServiceRequest) => nav(`/requests/${r.id}`);
  const rCols: Column<ServiceRequest>[] = [
    { key: 'id', header: 'מספר פנייה', cell: (r) => `#${r.id}` },
    { key: 'd', header: 'תאריך פתיחה', cell: (r) => fmtDate(r.openedAt) },
    { key: 't', header: 'סוג', cell: (r) => requestTypeLabel[r.type] },
    { key: 'su', header: 'נושא', cell: (r) => r.subject },
    { key: 'as', header: 'אחראי', cell: (r) => r.assignee ?? '—' },
    { key: 's', header: 'סטטוס', cell: (r) => <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge> },
    { key: 'o', header: 'פעולה', cell: (r) => <Button size="sm" onClick={(e) => { e.stopPropagation(); openR(r); }}>פתח פנייה</Button> },
  ];
  const noteCols: Column<MemberNote>[] = [
    { key: 'd', header: 'תאריך', cell: (n) => fmtDateTime(n.createdAt) },
    { key: 'a', header: 'נכתב על ידי', cell: (n) => n.author ?? '—' },
    { key: 't', header: 'הערה', cell: (n) => <span className="whitespace-pre-line">{n.text}</span> },
  ];
  const hasOpenT = (q.data ?? []).some((t) => t.status !== 'FINISHED');

  const Section = ({ title, button, children }: { title: string; button: ReactNode; children: ReactNode }) => (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {button}
      </div>
      {children}
    </Card>
  );
  return (
    <div className="space-y-5">
      <Section title="תהליכי שפ״ח (ליווי טיפול פסיכולוגי חיצוני)" button={
        <Button variant="primary" size="sm" disabled={hasOpenT} title={hasOpenT ? 'לחבר כבר קיים תהליך שפ״ח שטרם הסתיים' : undefined} onClick={() => nav(`/treatments/new?memberId=${member.id}`)}>
          <Plus className="size-4" aria-hidden /> פתח תהליך שפ״ח חדש
        </Button>}>
        <DataTable caption="תהליכי שפ״ח של החבר" columns={tCols} rows={q.data ?? []} rowKey={(t) => t.id} onRowClick={openT} empty={<EmptyState title="אין תהליכי שפ״ח" text="לחבר לא נפתח תהליך ליווי טיפול פסיכולוגי." />} />
      </Section>
      <Section title="תהליכי ליווי עו״ס" button={<Button variant="primary" size="sm" onClick={() => nav(`/social-work/new?memberId=${member.id}`)}><Plus className="size-4" aria-hidden /> פתח תהליך ליווי חדש</Button>}>
        <DataTable caption="תהליכי ליווי עו״ס של החבר" columns={sCols} rows={sw.data ?? []} rowKey={(p) => p.id} onRowClick={openS} empty={<EmptyState title="אין תהליכי ליווי עו״ס" />} />
      </Section>
      <Section title="פניות ובקשות סיוע" button={<Button variant="primary" size="sm" onClick={() => nav(`/requests/new?memberId=${member.id}`)}><Plus className="size-4" aria-hidden /> פנייה חדשה</Button>}>
        <DataTable caption="פניות ובקשות סיוע של החבר" columns={rCols} rows={rq.data ?? []} rowKey={(r) => r.id} onRowClick={openR} empty={<EmptyState title="אין פניות" />} />
      </Section>
      <Section title="הערות העו״סית בכרטיס החבר" button={<Button variant="primary" size="sm" onClick={() => { setNoteError(''); setNoteOpen(true); }}><Plus className="size-4" aria-hidden /> הוסף הערה</Button>}>
        <DataTable caption="הערות עו״סית" columns={noteCols} rows={notes.data ?? []} rowKey={(n) => n.id} empty={<EmptyState title="אין הערות" text="הערות שהעו״סית כותבת ישירות בכרטיס החבר." />} />
      </Section>
      <Dialog open={noteOpen} onOpenChange={(o) => !o && !addNote.isPending && setNoteOpen(false)} title="הערה חדשה"
        footer={<><Button variant="primary" loading={addNote.isPending} onClick={() => (noteText.trim() ? addNote.mutate(undefined) : setNoteError('יש להזין טקסט'))}>שמירה</Button><Button onClick={() => setNoteOpen(false)} disabled={addNote.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="נכתב על ידי"><Select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)}><option value="">לא צוין</option><option>אורית לביא</option><option>רונית כץ</option><option>שירה אדלר</option></Select></Field>
          <Field label="הערה" required error={noteError}><Textarea className="min-h-28" value={noteText} onChange={(e) => { setNoteText(e.target.value); setNoteError(''); }} /></Field>
          <p className="text-xs text-slate-500">ההערה נשמרת בטבלה נפרדת ואינה מופיעה בטבלת החברים הראשית.</p>
        </div>
      </Dialog>
    </div>
  );
}

/** כרטסת: אזור בסיסי של השתתפות עצמית בשפ״ח, נגזר מדיווחים מאושרים */
export function LedgerTab({ memberId }: { memberId: number }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['member-treatment-copay', memberId], queryFn: () => api.get<MemberCopayRow[]>(`/members/${memberId}/treatment-copay`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0);
  const columns: Column<MemberCopayRow>[] = [
    { key: 'p', header: 'חודש', cell: (r) => r.period },
    { key: 't', header: 'תהליך', cell: (r) => `#${r.treatmentId}` },
    { key: 'th', header: 'מטפל', cell: (r) => r.therapistName },
    { key: 'a', header: 'סכום השתתפות עצמית', cell: (r) => fmtMoney(r.amount) },
    { key: 's', header: 'סטטוס תשלום', cell: (r) => <Badge tone={r.status === 'PAID' ? 'green' : 'amber'}>{copayPaymentLabel[r.status]}</Badge> },
    { key: 'o', header: 'פעולה', cell: (r) => <Button size="sm" onClick={() => nav(`/treatments/${r.treatmentId}`)}>פתח כרטיס שפ״ח</Button> },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">השתתפות עצמית בשפ״ח</h2>
        <Badge tone={pending > 0 ? 'amber' : 'green'}>יתרה שטרם שולמה: {fmtMoney(pending)}</Badge>
      </div>
      <DataTable caption="השתתפות עצמית בשפ״ח" columns={columns} rows={rows} rowKey={(r) => r.reportId} empty={<EmptyState title="אין נתוני השתתפות עצמית" text="הנתונים נגזרים מדיווחים חודשיים מאושרים בתהליכי שפ״ח." />} />
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">כרטסת מלאה (מלגות, תשלומים וחישובים נוספים) בפיתוח עתידי. הסכומים כאן לצורכי מעקב בלבד, ללא סליקה.</p>
    </Card>
  );
}
