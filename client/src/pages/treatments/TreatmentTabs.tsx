import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Column, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Select, Spinner, Textarea,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import {
  FINISH_REASONS, FREEZE_REASONS, PAUSE_REASONS, copayPaymentLabel, kindLabel2, treatmentMeetingSubjectLabel, eventTypeLabel, fmtDate, fmtDateTime, fmtMoney, fmtMonth, reportStatusLabel,
  socialReportTypeLabel, therapistPaymentLabel, trackLabel, treatmentStatusLabel, treatmentStatusTone, todayStr,
} from '../../lib/format';
import type { MonthlyReport, SocialReport, Therapist, Treatment, TreatmentEvent, TreatmentHistory, TreatmentLinks, TreatmentMeeting, TreatmentTask } from '../../lib/types';
import { useTherapists } from './TherapistsDialog';

const money = (n: number) => Math.round(n * 100) / 100;
const reasonOptions = (m: Record<string, string>) => Object.entries(m).map(([k, l]) => <option key={k} value={k}>{l}</option>);

// ======================= טאב 1: פרטים בסיסיים =======================

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}

export function BasicTab({ t, editing, setEditing }: { t: Treatment; editing: boolean; setEditing: (e: boolean) => void }) {
  const workers = useQuery({ queryKey: ['treatment-meta'], queryFn: () => api.get<{ socialWorkers: string[] }>('/treatment-meta') });
  const [v, setV] = useState({ socialWorker: t.socialWorker ?? '', sessionCost: t.sessionCost == null ? '' : String(t.sessionCost), copay: String(t.copayPerSession), approved: String(t.baseApprovedSessions), startDate: t.startDate });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(
    () => api.put(`/treatments/${t.id}`, { socialWorker: v.socialWorker, sessionCost: v.sessionCost, copayPerSession: Number(v.copay), approvedSessions: Number(v.approved), startDate: v.startDate }),
    { success: 'הפרטים נשמרו', silentCodes: ['VALIDATION'], onSuccess: () => setEditing(false), onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields) },
  );
  const pct = t.approvedSessions ? Math.min(100, Math.round((t.heldSessions / t.approvedSessions) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">התקדמות הטיפול</h2>
          <span className="text-sm text-slate-700">{t.heldSessions} מתוך {t.approvedSessions} פגישות</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={t.approvedSessions} aria-valuenow={t.heldSessions} aria-label="התקדמות פגישות" className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">נספרות פגישות מדיווחים חודשיים מאושרים בלבד. נותרו {t.remainingSessions} פגישות.</p>
        {t.overQuota && <div className="mt-2"><InlineAlert tone="amber">מספר הפגישות המאושרות בדיווחים חורג מהמכסה המאושרת. יש לבדוק או להאריך את הטיפול.</InlineAlert></div>}
      </Card>

      <Card className="p-5">
        {editing ? (
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(undefined); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="עו״סית אחראית" error={errors.socialWorker}>
                <Select value={v.socialWorker} onChange={(e) => setV({ ...v, socialWorker: e.target.value })}>
                  {[...new Set([...(workers.data?.socialWorkers ?? []), t.socialWorker ?? ''].filter(Boolean))].map((w) => <option key={w} value={w}>{w}</option>)}
                </Select>
              </Field>
              <Field label="מכסת פגישות בסיסית" hint={t.extensionSessions ? `בנוסף ${t.extensionSessions} פגישות הארכה` : undefined} error={errors.approvedSessions}>
                <Input ltr type="number" min={1} value={v.approved} onChange={(e) => setV({ ...v, approved: e.target.value })} />
              </Field>
              <Field label="עלות פגישה (ש״ח)" error={errors.sessionCost}><Input ltr type="number" min={0} step="0.01" value={v.sessionCost} onChange={(e) => setV({ ...v, sessionCost: e.target.value })} /></Field>
              <Field label="השתתפות עצמית לפגישה (ש״ח)" error={errors.copayPerSession}><Input ltr type="number" min={0} step="0.01" value={v.copay} onChange={(e) => setV({ ...v, copay: e.target.value })} /></Field>
              <Field label="תאריך התחלה" error={errors.startDate}><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-slate-500">שינוי עלות או השתתפות עצמית משפיע על דיווחים חדשים בלבד. דיווחים קיימים שומרים את התעריף שנקבע בהם.</p>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={save.isPending}>שמירת שינויים</Button>
              <Button onClick={() => setEditing(false)} disabled={save.isPending}>ביטול</Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="מזהה תהליך">#{t.id}</Detail>
              <Detail label="שם החבר"><Link className="font-medium text-teal-700 hover:underline" to={`/members/${t.memberId}`}>{t.memberName}</Link></Detail>
              <Detail label="סטטוס התהליך"><Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge></Detail>
              <Detail label="מטפל נוכחי">{t.therapist?.fullName ?? 'טרם נבחר'}</Detail>
              <Detail label="עו״סית אחראית">{t.socialWorker}</Detail>
              <Detail label="מסלול טיפול">{trackLabel[t.track]}</Detail>
              <Detail label="מספר פגישות מאושרות">{t.approvedSessions}{t.extensionSessions ? ` (${t.baseApprovedSessions} + ${t.extensionSessions} הארכה)` : ''}</Detail>
              {t.pendingExtensionSessions > 0 && <Detail label="הארכה הממתינה לחתימה">{t.pendingExtensionSessions} פגישות (לא נספרות עד החתימה)</Detail>}
              <Detail label="פגישות שהתקיימו בפועל">{t.heldSessions}</Detail>
              <Detail label="פגישות שנותרו">{t.remainingSessions}</Detail>
              <Detail label="עלות פגישה">{t.sessionCost == null ? '' : fmtMoney(t.sessionCost)}</Detail>
              <Detail label="השתתפות עצמית לפגישה">{fmtMoney(t.copayPerSession)}</Detail>
              <Detail label="תאריך התחלה">{fmtDate(t.startDate)}</Detail>
              {t.endDate && <Detail label="תאריך סיום">{fmtDate(t.endDate)}</Detail>}
              {t.endReason && <Detail label="סיבת סיום">{FINISH_REASONS[t.endReason as keyof typeof FINISH_REASONS] ?? t.endReason}</Detail>}
            </dl>
            <Button className="mt-5" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> עריכת פרטים</Button>
          </>
        )}
      </Card>
    </div>
  );
}

// ======================= טאב 2: ציר זמן ודיווחים חודשיים =======================

interface Timeline { reports: MonthlyReport[]; events: TreatmentEvent[] }

function ReportDialog({ t, report, open, onClose }: { t: Treatment; report: MonthlyReport | null; open: boolean; onClose: () => void }) {
  const history = useQuery({ queryKey: ['treatment-history', t.id], queryFn: () => api.get<TreatmentHistory>(`/treatments/${t.id}/history`), enabled: open });
  const all = useTherapists();
  const now = new Date();
  const [v, setV] = useState(() => ({
    month: String(report?.month ?? now.getMonth() + 1), year: String(report?.year ?? now.getFullYear()),
    therapistId: String(report?.therapistId ?? t.therapist?.id ?? ''), held: String(report?.sessionsHeld ?? ''), cancelled: String(report?.paidCancellations ?? 0),
    notes: report?.notes ?? '', rate: String(report?.ratePerSession ?? t.sessionCost ?? ''), copay: String(report?.copayPerSession ?? t.copayPerSession),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  const therapistChoices = [...new Map((history.data?.therapists ?? []).map((h) => [h.therapistId, h.therapistName])).entries()];
  const priceOf = (id: string) => (all.data ?? []).find((x: Therapist) => String(x.id) === id)?.pricePerSession;
  const pickTherapist = (id: string) => {
    set('therapistId', id);
    if (!report) set('rate', String(id === String(t.therapist?.id) ? t.sessionCost ?? priceOf(id) ?? '' : priceOf(id) ?? ''));
  };

  const held = Number(v.held) || 0, canc = Number(v.cancelled) || 0, rate = Number(v.rate) || 0, copay = Number(v.copay) || 0;
  const payload = () => ({ therapistId: Number(v.therapistId), year: Number(v.year), month: Number(v.month), sessionsHeld: v.held, paidCancellations: v.cancelled, notes: v.notes, ratePerSession: v.rate, copayPerSession: v.copay });
  const save = useAction(() => (report ? api.put(`/treatment-reports/${report.id}`, payload()) : api.post(`/treatments/${t.id}/reports`, payload())), {
    success: 'הדיווח נשמר כטיוטה',
    silentCodes: ['VALIDATION', 'REPORT_EXISTS', 'THERAPIST_NOT_IN_TREATMENT', 'NOT_ACTIVATED'],
    onSuccess: onClose,
    onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!v.therapistId) e.therapistId = 'יש לבחור מטפל';
    if (v.held === '' || Number(v.held) < 0 || !Number.isInteger(Number(v.held))) e.sessionsHeld = 'יש להזין מספר פגישות';
    if (Number(v.cancelled) < 0 || !Number.isInteger(Number(v.cancelled))) e.paidCancellations = 'מספר ביטולים לא תקין';
    if (v.rate === '' || Number(v.rate) < 0) e.ratePerSession = 'יש להזין תעריף';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !save.isPending && onClose()} title={report ? 'עריכת דיווח חודשי' : 'הוספת דיווח חודשי'} wide
      footer={<><Button variant="primary" loading={save.isPending} onClick={submit}>שמירה כטיוטה</Button><Button onClick={onClose} disabled={save.isPending}>ביטול</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="חודש"><Select value={v.month} onChange={(e) => set('month', e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{fmtMonth(2000, i + 1).split(' ')[0]}</option>)}</Select></Field>
          <Field label="שנה" error={errors.year}><Input ltr type="number" value={v.year} onChange={(e) => set('year', e.target.value)} /></Field>
          <Field label="מטפל" required error={errors.therapistId}>
            <Select value={v.therapistId} onChange={(e) => pickTherapist(e.target.value)}>
              <option value="">בחירה...</option>
              {therapistChoices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Field label="פגישות שהתקיימו" required error={errors.sessionsHeld}><Input ltr type="number" min={0} value={v.held} onChange={(e) => set('held', e.target.value)} /></Field>
          <Field label="ביטולים בתשלום" error={errors.paidCancellations}><Input ltr type="number" min={0} value={v.cancelled} onChange={(e) => set('cancelled', e.target.value)} /></Field>
          <div />
          <Field label="תעריף לפגישה (ש״ח)" required error={errors.ratePerSession} hint="נשמר בדיווח ואינו משתנה עם שינוי תעריף עתידי"><Input ltr type="number" min={0} step="0.01" value={v.rate} onChange={(e) => set('rate', e.target.value)} /></Field>
          <Field label="השתתפות עצמית לפגישה (ש״ח)" error={errors.copayPerSession}><Input ltr type="number" min={0} step="0.01" value={v.copay} onChange={(e) => set('copay', e.target.value)} /></Field>
        </div>
        <Field label="הערות המטפל"><Textarea className="min-h-16" value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2" aria-label="חישוב">
          <span>עלות פגישות שהתקיימו: <strong>{fmtMoney(money(held * rate))}</strong></span>
          <span>עלות ביטולים בתשלום: <strong>{fmtMoney(money(canc * rate))}</strong></span>
          <span>סך תשלום למטפל: <strong>{fmtMoney(money((held + canc) * rate))}</strong></span>
          <span>סך השתתפות עצמית של החבר: <strong>{fmtMoney(money((held + canc) * copay))}</strong></span>
        </div>
        <p className="text-xs text-slate-500">ביטולים בתשלום מחויבים כברירת מחדל לפי אותם תעריפים. רק דיווח מאושר נספר בפגישות שהתקיימו.</p>
        {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
      </div>
    </Dialog>
  );
}

export function TimelineTab({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-timeline', t.id], queryFn: () => api.get<Timeline>(`/treatments/${t.id}/timeline`) });
  const [editing, setEditing] = useState<{ report: MonthlyReport | null } | null>(null);
  const [approving, setApproving] = useState<MonthlyReport | null>(null);
  const [deleting, setDeleting] = useState<MonthlyReport | null>(null);

  const submitR = useAction((r: MonthlyReport) => api.post(`/treatment-reports/${r.id}/submit`), { success: 'הדיווח נשלח לאישור' });
  const approve = useAction((r: MonthlyReport) => api.post(`/treatment-reports/${r.id}/approve`), { success: 'הדיווח אושר והנתונים עודכנו', onSuccess: () => setApproving(null), onError: () => setApproving(null) });
  const del = useAction((r: MonthlyReport) => api.del(`/treatment-reports/${r.id}`), { success: 'הטיוטה נמחקה', onSuccess: () => setDeleting(null), onError: () => setDeleting(null) });
  const pay = useAction((v: { r: MonthlyReport; patch: Record<string, string> }) => api.patch(`/treatment-reports/${v.r.id}/payment`, v.patch), { success: 'סטטוס התשלום עודכן' });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const canReport = !['PENDING_THERAPIST', 'PENDING_CONTRACT'].includes(t.status);
  // אירועים משמעותיים שהתרחשו באותו חודש (מוצגים אוטומטית בשורת החודש)
  const eventsOfMonth = (year: number, month: number) =>
    q.data!.events.filter((e) => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() + 1 === month && ['PAUSE', 'RESUME', 'FREEZE', 'UNFREEZE', 'EXTENSION_SIGNED', 'THERAPIST_CHANGE', 'EXCEPTION', 'MEETING', 'THERAPIST_MESSAGE', 'FINISH'].includes(e.type); });

  const columns: Column<MonthlyReport>[] = [
    { key: 'm', header: 'חודש', cell: (r) => <span className="font-medium">{fmtMonth(r.year, r.month)}</span> },
    { key: 't', header: 'מטפל', cell: (r) => r.therapistName },
    { key: 'h', header: 'פגישות שהתקיימו', cell: (r) => r.sessionsHeld },
    { key: 'c', header: 'ביטולים בתשלום', cell: (r) => r.paidCancellations },
    { key: 'tt', header: 'סכום לתשלום למטפל', cell: (r) => fmtMoney(r.therapistTotal) },
    { key: 'cp', header: 'השתתפות עצמית', cell: (r) => fmtMoney(r.copayTotal) },
    {
      key: 'ev',
      header: 'אירועים בחודש',
      cell: (r) => {
        const ev = eventsOfMonth(r.year, r.month);
        return ev.length ? <span className="text-xs text-slate-700">{[...new Set(ev.map((e) => eventTypeLabel[e.type] ?? e.type))].join(', ')}</span> : '—';
      },
    },
    { key: 's', header: 'סטטוס דיווח', cell: (r) => <Badge tone={r.status === 'APPROVED' ? 'green' : r.status === 'PENDING' ? 'amber' : 'gray'}>{reportStatusLabel[r.status]}</Badge> },
    {
      key: 'tp', header: 'תשלום למטפל',
      cell: (r) => r.status === 'APPROVED' ? (
        <Select aria-label={`סטטוס תשלום למטפל ${fmtMonth(r.year, r.month)}`} className="w-48" value={r.therapistPaymentStatus} onChange={(e) => pay.mutate({ r, patch: { therapistPaymentStatus: e.target.value } })}>
          {Object.entries(therapistPaymentLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      ) : '—',
    },
    {
      key: 'cpp', header: 'תשלום השתתפות עצמית',
      cell: (r) => r.status === 'APPROVED' ? (
        <Select aria-label={`סטטוס השתתפות עצמית ${fmtMonth(r.year, r.month)}`} className="w-32" value={r.copayPaymentStatus} onChange={(e) => pay.mutate({ r, patch: { copayPaymentStatus: e.target.value } })}>
          {Object.entries(copayPaymentLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      ) : '—',
    },
    {
      key: 'a', header: 'פעולות',
      cell: (r) => r.status === 'APPROVED' ? null : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setEditing({ report: r })}>עריכה</Button>
          {r.status === 'DRAFT' && <Button size="sm" loading={submitR.isPending && submitR.variables?.id === r.id} onClick={() => submitR.mutate(r)}>שלח לאישור</Button>}
          <Button size="sm" variant="primary" onClick={() => setApproving(r)}>אשר</Button>
          {r.status === 'DRAFT' && <Button size="sm" variant="danger" onClick={() => setDeleting(r)}>מחק</Button>}
        </div>
      ),
    },
  ];

  const eventCols: Column<TreatmentEvent>[] = [
    { key: 'd', header: 'תאריך', cell: (e) => fmtDateTime(e.date) },
    { key: 't', header: 'אירוע', cell: (e) => <Badge tone={e.exceptionKind ? 'amber' : 'gray'}>{eventTypeLabel[e.type] ?? e.type}</Badge> },
    { key: 'x', header: 'תיאור', cell: (e) => e.description },
    { key: 'a', header: 'גורם מעורב', cell: (e) => e.actor ?? '—' },
    { key: 'dt', header: 'פרטים', cell: (e) => e.details ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">דיווחים חודשיים (מהחדש לישן)</h2>
          <Button variant="primary" size="sm" disabled={!canReport} title={canReport ? undefined : 'יש להפעיל את הטיפול לפני הזנת דיווח'} onClick={() => setEditing({ report: null })}>
            <Plus className="size-4" aria-hidden /> הוסף דיווח חודשי
          </Button>
        </div>
        <DataTable caption="דיווחים חודשיים" columns={columns} rows={q.data!.reports} rowKey={(r) => r.id} empty={<EmptyState title="אין דיווחים חודשיים" text={canReport ? 'הוסיפו דיווח חודשי כדי לעדכן את ספירת הפגישות.' : 'הדיווחים יוזנו לאחר הפעלת הטיפול.'} />} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">אירועים משמעותיים (כרונולוגי)</h2>
        <DataTable caption="אירועים" columns={eventCols} rows={q.data!.events} rowKey={(e) => e.id} empty={<EmptyState title="אין אירועים" />} />
      </Card>

      {editing && <ReportDialog key={editing.report?.id ?? 'new'} t={t} report={editing.report} open onClose={() => setEditing(null)} />}
      <Dialog open={!!approving} onOpenChange={(o) => !o && !approve.isPending && setApproving(null)} title="אישור דיווח חודשי" description="יש לבדוק את הנתונים לפני אישור. לאחר האישור הדיווח ננעל ונספר בפגישות שהתקיימו."
        footer={<><Button variant="primary" loading={approve.isPending} onClick={() => approving && approve.mutate(approving)}>אשר סופית</Button><Button onClick={() => setApproving(null)} disabled={approve.isPending}>חזרה</Button></>}>
        {approving && (
          <dl className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div>חודש: <strong>{fmtMonth(approving.year, approving.month)}</strong></div>
            <div>מטפל: <strong>{approving.therapistName}</strong></div>
            <div>פגישות שהתקיימו: <strong>{approving.sessionsHeld}</strong></div>
            <div>ביטולים בתשלום: <strong>{approving.paidCancellations}</strong></div>
            <div>תעריף: <strong>{fmtMoney(approving.ratePerSession)}</strong></div>
            <div>השתתפות עצמית לפגישה: <strong>{fmtMoney(approving.copayPerSession)}</strong></div>
            <div>תשלום למטפל: <strong>{fmtMoney(approving.therapistTotal)}</strong></div>
            <div>השתתפות עצמית כוללת: <strong>{fmtMoney(approving.copayTotal)}</strong></div>
            {approving.notes && <div className="sm:col-span-2">הערות: {approving.notes}</div>}
          </dl>
        )}
      </Dialog>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="מחיקת טיוטה" description="האם למחוק את הדיווח? ניתן למחוק טיוטה בלבד." confirmLabel="מחק" loading={del.isPending} onConfirm={() => deleting && del.mutate(deleting)} />
    </div>
  );
}

// ======================= טאב 3: דוחות עו"סית =======================

export function SocialReportsTab({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-social', t.id], queryFn: () => api.get<SocialReport[]>(`/treatments/${t.id}/social-reports`) });
  const [form, setForm] = useState<{ id?: number; date: string; type: SocialReport['type']; title: string; content: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(
    () => (form!.id ? api.put(`/social-reports/${form!.id}`, form) : api.post(`/treatments/${t.id}/social-reports`, form)),
    { success: 'הדוח נשמר', silentCodes: ['VALIDATION'], onSuccess: () => setForm(null), onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields) },
  );
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const columns: Column<SocialReport>[] = [
    { key: 'd', header: 'תאריך', cell: (r) => fmtDate(r.date) },
    { key: 't', header: 'סוג הדוח', cell: (r) => socialReportTypeLabel[r.type] },
    { key: 'ti', header: 'כותרת', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'a', header: 'פעולה', cell: (r) => <Button size="sm" onClick={() => { setErrors({}); setForm({ id: r.id, date: r.date, type: r.type, title: r.title, content: r.content }); }}>צפייה ועריכה</Button> },
  ];
  const submit = () => {
    if (!form) return;
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'יש להזין כותרת';
    if (!form.date) e.date = 'יש לבחור תאריך';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(undefined);
  };
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">דוחות עו״סית</h2>
        <Button variant="primary" size="sm" onClick={() => { setErrors({}); setForm({ date: todayStr(), type: 'GENERAL', title: '', content: '' }); }}><Plus className="size-4" aria-hidden /> הוסף דוח</Button>
      </div>
      <DataTable caption="דוחות עו״סית" columns={columns} rows={q.data!} rowKey={(r) => r.id} empty={<EmptyState title="אין דוחות" text="הוסיפו דוח פסיכוסוציאלי, סיכום שיחה או דוח כללי." />} />
      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)} title={form?.id ? 'צפייה ועריכת דוח' : 'דוח חדש'} wide
        footer={<><Button variant="primary" loading={save.isPending} onClick={submit}>שמירה</Button><Button onClick={() => setForm(null)} disabled={save.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="תאריך" required error={errors.date}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="סוג הדוח"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SocialReport['type'] })}>{Object.entries(socialReportTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
            <Field label="כותרת" required error={errors.title}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="תוכן"><Textarea className="min-h-40" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

// ======================= טאב 4: משובים (תצוגה בלבד) =======================

export function FeedbackTab() {
  const rows = [
    { id: 1, name: 'משוב התחלה', when: 'לאחר 5 פגישות' },
    { id: 2, name: 'משוב אמצע', when: 'לאחר 25 פגישות' },
    { id: 3, name: 'משוב סיום', when: 'בסיום הטיפול' },
  ];
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'n', header: 'סוג משוב', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'w', header: 'מועד', cell: (r) => r.when },
    { key: 's', header: 'סטטוס', cell: () => <Badge>הפעלה בשלב הבא</Badge> },
  ];
  return (
    <Card>
      <DataTable caption="משובים" columns={columns} rows={rows} rowKey={(r) => r.id} />
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">מילוי משובים, שליחת טפסים ותזכורות יופעלו בשלב הבא. לא נשלח כאן שום משוב.</p>
    </Card>
  );
}

// ======================= טאב 5: פעולות =======================

function Row({ children }: { children: ReactNode }) { return <div className="space-y-4">{children}</div>; }

type ActionKind = 'assign' | 'change' | 'pause' | 'freeze' | 'extend' | 'finish' | 'note' | 'exception' | null;

function ActionDialogs({ t, kind, onClose }: { t: Treatment; kind: ActionKind; onClose: () => void }) {
  const therapists = useTherapists(true);
  const choices = (therapists.data ?? []).filter((x) => x.type === t.track && x.id !== t.therapist?.id);
  const [v, setV] = useState({ therapistId: '', date: todayStr(), reason: '', note: '', code: kind === 'pause' ? 'NON_PAYMENT' : 'OTHER', sessions: '10', copay: String(t.copayPerSession), approval: false, finish: 'GOAL', excKind: 'LATE_PAYMENT', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())));
  const set = (k: keyof typeof v, val: string | boolean) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  const path = `/treatments/${t.id}`;
  const run = useAction(
    () => {
      switch (kind) {
        case 'assign': return api.post(`${path}/assign-therapist`, { therapistId: Number(v.therapistId), date: v.date });
        case 'change': return api.post(`${path}/change-therapist`, { newTherapistId: Number(v.therapistId), date: v.date, reason: v.reason, note: v.note });
        case 'pause': return api.post(`${path}/pause`, { reason: v.code, note: v.note });
        case 'freeze': return api.post(`${path}/freeze`, { reason: v.code, note: v.note });
        case 'extend': return api.post(`${path}/extensions`, { additionalSessions: Number(v.sessions), copayPerSession: Number(v.copay), yehudaApproval: v.approval, date: v.date, idempotencyKey: key });
        case 'finish': return api.post(`${path}/finish`, { reason: v.finish, date: v.date, note: v.note });
        case 'note': return api.post(`${path}/notes`, { description: v.description, date: v.date });
        default: return api.post(`${path}/exceptions`, { kind: v.excKind, description: v.description, date: v.date });
      }
    },
    { success: 'הפעולה בוצעה ותועדה', silentCodes: ['VALIDATION', 'APPROVAL_REQUIRED', 'SAME_THERAPIST', 'INVALID_STATUS', 'TRACK_MISMATCH'], onSuccess: onClose, onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }) },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if ((kind === 'assign' || kind === 'change') && !v.therapistId) e.therapistId = 'יש לבחור מטפל';
    if (kind === 'change' && !v.reason.trim()) e.reason = 'יש להזין סיבת החלפה';
    if (kind === 'extend') {
      if (!(Number(v.sessions) >= 1)) e.sessions = 'יש להזין מספר פגישות נוספות';
      if (!v.approval) e.approval = 'לא ניתן להאריך ללא אישור מיהודה';
    }
    if ((kind === 'note' || kind === 'exception') && !v.description.trim()) e.description = 'יש להזין תיאור';
    setErrors(e);
    if (!Object.keys(e).length) run.mutate(undefined);
  };

  const titles: Record<Exclude<ActionKind, null>, string> = {
    assign: 'שיוך מטפל', change: 'החלפת מטפל', pause: 'השהיית טיפול', freeze: 'הקפאת טיפול', extend: 'הארכת טיפול', finish: 'סיום טיפול', note: 'הוספת הערה', exception: 'סימון חריגה',
  };
  const therapistSelect = (
    <Field label={kind === 'change' ? 'מטפל חדש' : 'מטפל'} required error={errors.therapistId}>
      <Select value={v.therapistId} onChange={(e) => set('therapistId', e.target.value)}>
        <option value="">בחירה...</option>
        {(kind === 'assign' ? (therapists.data ?? []).filter((x) => x.type === t.track) : choices).map((x) => <option key={x.id} value={x.id}>{x.fullName} · {fmtMoney(x.pricePerSession)}</option>)}
      </Select>
    </Field>
  );

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && !run.isPending && onClose()} title={kind ? titles[kind] : ''} wide
      footer={<><Button variant="primary" loading={run.isPending} onClick={submit}>אישור</Button><Button onClick={onClose} disabled={run.isPending}>ביטול</Button></>}>
      {kind && (
        <Row>
          {kind === 'assign' && <>{therapistSelect}<Field label="תאריך שיוך"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field></>}
          {kind === 'change' && (
            <>
              <Field label="מטפל נוכחי"><Input disabled readOnly value={t.therapist?.fullName ?? ''} /></Field>
              {therapistSelect}
              <Field label="תאריך החלפה"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="סיבת החלפה" required error={errors.reason}><Input value={v.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
              <Field label="הערה"><Textarea className="min-h-16" value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
              <InlineAlert tone="blue">המטפל הקודם יישמר בהיסטוריה, ודיווחים ישנים יישארו משויכים אליו.</InlineAlert>
            </>
          )}
          {(kind === 'pause' || kind === 'freeze') && (
            <>
              <Field label="סיבה"><Select value={v.code} onChange={(e) => set('code', e.target.value)}>{reasonOptions(kind === 'pause' ? PAUSE_REASONS : FREEZE_REASONS)}</Select></Field>
              <Field label="הערה"><Textarea className="min-h-16" value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
              <InlineAlert tone="blue">{kind === 'pause' ? 'השהיה היא בדרך כלל סנקציה. הסטטוס ישתנה ל"מושהה".' : 'הקפאה היא בדרך כלל מסיבה אישית. הסטטוס ישתנה ל"בהקפאה".'}</InlineAlert>
            </>
          )}
          {kind === 'extend' && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="מספר פגישות נוספות" required error={errors.sessions}><Input ltr type="number" min={1} value={v.sessions} onChange={(e) => set('sessions', e.target.value)} /></Field>
                <Field label="השתתפות עצמית לפגישות ההארכה (ש״ח)"><Input ltr type="number" min={0} step="0.01" value={v.copay} onChange={(e) => set('copay', e.target.value)} /></Field>
                <Field label="תאריך ההארכה"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal-600" checked={v.approval} onChange={(e) => set('approval', e.target.checked)} /> קיים אישור מיהודה</label>
                {errors.approval && <p role="alert" className="mt-1 text-xs text-red-700">{errors.approval}</p>}
              </div>
              <p className="text-xs text-slate-500">נוצרת הארכה הממתינה לחתימת המטופל. לאחר החתימה סך הפגישות המאושרות יעמוד על {t.approvedSessions + (Number(v.sessions) || 0)}, והסטטוס יעבור ל"פעיל (הארכה)".</p>
            </>
          )}
          {kind === 'finish' && (
            <>
              <Field label="סיבת סיום"><Select value={v.finish} onChange={(e) => set('finish', e.target.value)}>{reasonOptions(FINISH_REASONS)}</Select></Field>
              <Field label="תאריך סיום"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="הערה"><Textarea className="min-h-16" value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
            </>
          )}
          {(kind === 'note' || kind === 'exception') && (
            <>
              {kind === 'exception' && <Field label="סוג חריגה"><Select value={v.excKind} onChange={(e) => set('excKind', e.target.value)}><option value="LATE_PAYMENT">איחור בתשלום</option><option value="MANUAL">חריגה ידנית</option></Select></Field>}
              <Field label="תאריך"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="תיאור" required error={errors.description}><Textarea className="min-h-20" value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
            </>
          )}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </Row>
      )}
    </Dialog>
  );
}

// ----- הארכות הממתינות לחתימה (חתימה ידנית לצורך הדגמה, ללא חתימה דיגיטלית) -----
function PendingExtensions({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-history', t.id], queryFn: () => api.get<TreatmentHistory>(`/treatments/${t.id}/history`) });
  const sign = useAction((extId: number) => api.post(`/treatments/${t.id}/extensions/${extId}/sign`), { success: 'חוזה ההארכה סומן כחתום (הדגמה). המכסה עודכנה' });
  const pending = (q.data?.extensions ?? []).filter((e) => !e.signedAt);
  if (!pending.length) return null;
  type Ex = TreatmentHistory['extensions'][number];
  const columns: Column<Ex>[] = [
    { key: 'n', header: 'מספר הארכה', cell: (e) => e.number },
    { key: 'd', header: 'תאריך', cell: (e) => fmtDate(e.extensionDate) },
    { key: 's', header: 'פגישות נוספות', cell: (e) => e.additionalSessions },
    { key: 'c', header: 'השתתפות עצמית לפגישה', cell: (e) => fmtMoney(e.copayPerSession) },
    { key: 'a', header: 'פעולה', cell: (e) => <Button size="sm" variant="primary" loading={sign.isPending && sign.variables === e.id} onClick={() => sign.mutate(e.id)}>סמן חוזה הארכה כחתום (הדגמה)</Button> },
  ];
  return (
    <Card>
      <div className="border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">הארכות הממתינות לחתימת המטופל</h2>
        <p className="mt-1 text-xs text-slate-500">עד החתימה ההארכה אינה נספרת במכסה. במערכת זו אין חתימה דיגיטלית, והסימון ידני ומתועד.</p>
      </div>
      <DataTable caption="הארכות ממתינות לחתימה" columns={columns} rows={pending} rowKey={(e) => e.id} />
    </Card>
  );
}

// ----- פגישות עם המטופל -----
function MeetingsSection({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-meetings', t.id], queryFn: () => api.get<TreatmentMeeting[]>(`/treatments/${t.id}/meetings`) });
  const [form, setForm] = useState<{ date: string; subject: string; summary: string } | null>(null);
  const save = useAction(() => api.post(`/treatments/${t.id}/meetings`, form), { success: 'הפגישה נשמרה', onSuccess: () => setForm(null) });
  const columns: Column<TreatmentMeeting>[] = [
    { key: 'd', header: 'תאריך', cell: (m) => fmtDate(m.date) },
    { key: 's', header: 'נושא', cell: (m) => treatmentMeetingSubjectLabel[m.subject] ?? m.subjectLabel },
    { key: 'x', header: 'סיכום', cell: (m) => m.summary ?? '—' },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">פגישות עם המטופל</h2>
        <Button size="sm" variant="primary" onClick={() => setForm({ date: todayStr(), subject: 'FIT', summary: '' })}><Plus className="size-4" aria-hidden /> פגישה</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable caption="פגישות עם המטופל" columns={columns} rows={q.data!} rowKey={(m) => m.id} empty={<EmptyState title="אין פגישות" text="תעדו פגישה עם המטופל: מידת ההתאמה, בקשה לסיום מוקדם, התייעצות או בקשת הארכה." />} />
      )}
      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)} title="פגישה עם המטופל" wide
        footer={<><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>שמירה</Button><Button onClick={() => setForm(null)} disabled={save.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="תאריך"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="נושא"><Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>{Object.entries(treatmentMeetingSubjectLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
            <Field label="סיכום"><Textarea className="min-h-24" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

// ----- משימות לעו"סית -----
function TasksSection({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-tasks', t.id], queryFn: () => api.get<TreatmentTask[]>(`/treatments/${t.id}/tasks`) });
  const [form, setForm] = useState<{ title: string; dueDate: string } | null>(null);
  const [error, setError] = useState('');
  const add = useAction(() => api.post(`/treatments/${t.id}/tasks`, form), { success: 'המשימה נוספה', onSuccess: () => setForm(null) });
  const toggle = useAction((v: { id: number; done: boolean }) => api.patch(`/treatment-tasks/${v.id}`, { done: v.done }));
  const columns: Column<TreatmentTask>[] = [
    { key: 'd', header: 'בוצעה', cell: (k) => <input type="checkbox" className="size-4 accent-teal-600" aria-label={`סימון המשימה ${k.title} כבוצעה`} checked={k.done} onChange={(e) => toggle.mutate({ id: k.id, done: e.target.checked })} /> },
    { key: 't', header: 'משימה', cell: (k) => <span className={k.done ? 'text-slate-400 line-through' : 'font-medium'}>{k.title}</span> },
    { key: 'due', header: 'יעד', cell: (k) => (k.dueDate ? fmtDate(k.dueDate) : '—') },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">משימות לעו״סית</h2>
        <Button size="sm" variant="primary" onClick={() => { setError(''); setForm({ title: '', dueDate: '' }); }}><Plus className="size-4" aria-hidden /> משימה</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable caption="משימות לעו״סית" columns={columns} rows={q.data!} rowKey={(k) => k.id} empty={<EmptyState title="אין משימות" text="משימות שהעו״סית יוצרת לעצמה בתהליך." />} />
      )}
      <Dialog open={!!form} onOpenChange={(o) => !o && !add.isPending && setForm(null)} title="משימה חדשה"
        footer={<><Button variant="primary" loading={add.isPending} onClick={() => (form?.title.trim() ? add.mutate(undefined) : setError('יש להזין כותרת למשימה'))}>שמירה</Button><Button onClick={() => setForm(null)} disabled={add.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="משימה" required error={error}><Input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(''); }} /></Field>
            <Field label="תאריך יעד"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

export function ActionsTab({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-events', t.id], queryFn: () => api.get<TreatmentEvent[]>(`/treatments/${t.id}/events`) });
  const [kind, setKind] = useState<ActionKind>(null);
  const [view, setView] = useState<TreatmentEvent | null>(null);
  const resume = useAction(() => api.post(`/treatments/${t.id}/resume`), { success: 'ההשהיה בוטלה והטיפול חזר לפעילות' });
  const unfreeze = useAction(() => api.post(`/treatments/${t.id}/unfreeze`), { success: 'הטיפול הוצא מהקפאה' });

  const isActive = t.status === 'ACTIVE' || t.status === 'ACTIVE_EXTENSION';
  const open = t.status !== 'FINISHED';
  const canExtend = isActive || t.status === 'PAUSED' || t.status === 'FROZEN' || (t.status === 'FINISHED' && t.endReason === 'QUOTA');

  const columns: Column<TreatmentEvent>[] = [
    { key: 'd', header: 'תאריך', cell: (e) => fmtDateTime(e.date) },
    { key: 't', header: 'סוג פעולה', cell: (e) => <Badge tone={e.exceptionKind ? 'amber' : 'gray'}>{eventTypeLabel[e.type] ?? e.type}</Badge> },
    { key: 'x', header: 'תיאור קצר', cell: (e) => e.description },
    { key: 'a', header: 'גורם מעורב', cell: (e) => e.actor ?? '—' },
    { key: 'v', header: 'פעולה', cell: (e) => <Button size="sm" onClick={() => setView(e)}>פרטים</Button> },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-slate-900">פעולות מרכזיות</h2>
        <div className="flex flex-wrap gap-2">
          {t.therapist ? <Button disabled={!open} onClick={() => setKind('change')}>החלפת מטפל</Button> : <Button variant="primary" disabled={!open} onClick={() => setKind('assign')}>שיוך מטפל</Button>}
          {t.status === 'PAUSED' ? <Button loading={resume.isPending} onClick={() => resume.mutate(undefined)}>בטל השהיה</Button> : <Button disabled={!isActive} onClick={() => setKind('pause')}>השהיית טיפול</Button>}
          {t.status === 'FROZEN' ? <Button loading={unfreeze.isPending} onClick={() => unfreeze.mutate(undefined)}>הוצא מהקפאה</Button> : <Button disabled={!isActive} onClick={() => setKind('freeze')}>הקפאת טיפול</Button>}
          <Button disabled={!canExtend} onClick={() => setKind('extend')}>הארכת טיפול</Button>
          <Button variant="danger" disabled={!open} onClick={() => setKind('finish')}>סיום טיפול</Button>
          <Button onClick={() => setKind('note')}>הוסף הערה</Button>
          <Button onClick={() => setKind('exception')}>סמן חריגה</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">השהיה (בדרך כלל סנקציה) והקפאה (בדרך כלל מסיבה אישית) הן שתי פעולות נפרדות עם סטטוסים נפרדים.</p>
      </Card>
      <PendingExtensions t={t} />
      <MeetingsSection t={t} />
      <TasksSection t={t} />
      <Card>
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
          <DataTable caption="פעולות במהלך שפ״ח" columns={columns} rows={q.data!} rowKey={(e) => e.id} empty={<EmptyState title="אין פעולות" />} />
        )}
      </Card>
      {kind && <ActionDialogs key={kind} t={t} kind={kind} onClose={() => setKind(null)} />}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)} title={view ? eventTypeLabel[view.type] ?? view.type : ''}>
        {view && (
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-slate-500">תאריך</dt><dd>{fmtDateTime(view.date)}</dd></div>
            <div><dt className="text-xs text-slate-500">תיאור</dt><dd>{view.description}</dd></div>
            <div><dt className="text-xs text-slate-500">גורם מעורב</dt><dd>{view.actor ?? '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">פרטים נוספים</dt><dd>{view.details ?? '—'}</dd></div>
          </dl>
        )}
      </Dialog>
    </div>
  );
}

// ======================= טאב 6: פרטים נוספים =======================

export function MoreTab({ t }: { t: Treatment }) {
  const q = useQuery({ queryKey: ['treatment-history', t.id], queryFn: () => api.get<TreatmentHistory>(`/treatments/${t.id}/history`) });
  const links = useQuery({ queryKey: ['treatment-links', t.id], queryFn: () => api.get<TreatmentLinks>(`/treatments/${t.id}/links`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const h = q.data!;
  type Th = TreatmentHistory['therapists'][number];
  type St = TreatmentHistory['statuses'][number];
  type Ex = TreatmentHistory['extensions'][number];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-medium text-slate-500">כרטיס החבר</dt><dd className="mt-0.5"><Link className="font-medium text-teal-700 hover:underline" to={`/members/${t.memberId}`}>{t.memberName}</Link></dd></div>
          <div><dt className="text-xs font-medium text-slate-500">כרטיס אינטייק</dt><dd className="mt-0.5 text-slate-400">בפיתוח עתידי</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">מסמכים חתומים</dt><dd className="mt-0.5 text-slate-400">בפיתוח עתידי. לא קיים מסמך חתום בפועל</dd></div>
        </dl>
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">קשרים לליווי עו״ס ולפניות</h2>
        <DataTable caption="קשרים לליווי עו״ס ולפניות" columns={[
          { key: 'k', header: 'סוג', cell: (r: { kind: string }) => r.kind },
          { key: 'i', header: 'מזהה', cell: (r: { id: number }) => `#${r.id}` },
          { key: 't', header: 'פירוט', cell: (r: { title: string }) => r.title },
          { key: 'a', header: 'פעולה', cell: (r: { href: string }) => <Link className="font-medium text-teal-700 hover:underline" to={r.href}>פתח</Link> },
        ]} rows={[
          ...(links.data?.socialProcesses ?? []).map((p) => ({ key: `s${p.id}`, kind: 'ליווי עו״ס', id: p.id, title: p.kinds.map((k) => kindLabel2[k] ?? k).join(', ') || '—', href: `/social-work/${p.id}` })),
          ...(links.data?.requests ?? []).map((r) => ({ key: `r${r.id}`, kind: 'פנייה', id: r.id, title: r.subject, href: `/requests/${r.id}` })),
        ]} rowKey={(r) => r.key} empty={<EmptyState title="אין קשרים" text="לא קושרו לתהליך זה תהליכי ליווי עו״ס או פניות." />} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">היסטוריית מטפלים</h2>
        <DataTable caption="היסטוריית מטפלים" columns={[
          { key: 'n', header: 'מטפל', cell: (r: Th) => r.therapistName },
          { key: 'f', header: 'מתאריך', cell: (r: Th) => fmtDate(r.fromDate) },
          { key: 't', header: 'עד תאריך', cell: (r: Th) => (r.toDate ? fmtDate(r.toDate) : <Badge tone="green">נוכחי</Badge>) },
          { key: 'h', header: 'פגישות שהתקיימו', cell: (r: Th) => r.heldSessions },
          { key: 'r', header: 'סיבת החלפה', cell: (r: Th) => r.changeReason ?? '—' },
          { key: 'o', header: 'הערה', cell: (r: Th) => r.note ?? '—' },
        ]} rows={h.therapists} rowKey={(r) => r.id} empty={<EmptyState title="טרם שויך מטפל" />} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">היסטוריית סטטוסים</h2>
        <DataTable caption="היסטוריית סטטוסים" columns={[
          { key: 'd', header: 'תאריך ושעה', cell: (r: St) => fmtDateTime(r.createdAt) },
          { key: 'f', header: 'סטטוס קודם', cell: (r: St) => (r.fromStatus ? treatmentStatusLabel[r.fromStatus as Treatment['status']] : '—') },
          { key: 't', header: 'סטטוס חדש', cell: (r: St) => <Badge tone={treatmentStatusTone(r.toStatus)}>{treatmentStatusLabel[r.toStatus]}</Badge> },
          { key: 'r', header: 'סיבה', cell: (r: St) => r.reason ?? '—' },
          { key: 's', header: 'מקור', cell: (r: St) => (r.source === 'MANUAL' ? 'פעולה ידנית' : 'פעולה אוטומטית') },
        ]} rows={h.statuses} rowKey={(r) => r.id} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">היסטוריית הארכות</h2>
        <DataTable caption="היסטוריית הארכות" columns={[
          { key: 'num', header: 'מספר הארכה', cell: (r: Ex) => r.number },
          { key: 'd', header: 'תאריך', cell: (r: Ex) => fmtDate(r.extensionDate) },
          { key: 's', header: 'פגישות נוספות', cell: (r: Ex) => r.additionalSessions },
          { key: 'c', header: 'השתתפות עצמית לפגישה', cell: (r: Ex) => fmtMoney(r.copayPerSession) },
          { key: 'a', header: 'אישור מיהודה', cell: (r: Ex) => (r.yehudaApproval ? 'קיים' : 'חסר') },
          { key: 'sg', header: 'חתימה', cell: (r: Ex) => (r.signedAt ? <Badge tone="green">נחתמה {fmtDate(r.signedAt)}</Badge> : <Badge tone="amber">ממתינה לחתימה</Badge>) },
        ]} rows={h.extensions} rowKey={(r) => r.id} empty={<EmptyState title="לא בוצעו הארכות" />} />
      </Card>
    </div>
  );
}

