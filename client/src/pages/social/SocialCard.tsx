import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil, Plus } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import KindsField from '../../components/KindsField';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Checkbox, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, PageHeader, Select, Spinner, Tabs, TabsContent, TabsList, Textarea,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import {
  DURATION_BANDS, durationBand, durationLabel, meetingActionLabel, topicLabel, endReasonLabel, fmtDate, fmtDateTime, interventionStatusLabel, interventionTypeLabel, kindLabel2, modeLabel, processTypeLabel, requestStatusLabel, requestStatusTone, requestTypeLabel,
  socialEventLabel, socialStatusLabel, socialStatusTone, swReportTypeLabel, todayStr, trackLabel, treatmentStatusLabel, treatmentStatusTone,
} from '../../lib/format';
import type { ProcessRelated, SocialEvent, SocialIntervention, SocialMeeting, SocialProcess, SwReport, Treatment } from '../../lib/types';
import { useStaff } from '../requests/RequestsList';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}

// ----- טאב 1: פרטים כלליים -----
function GeneralTab({ p, editing, setEditing }: { p: SocialProcess; editing: boolean; setEditing: (e: boolean) => void }) {
  const staff = useStaff();
  const [v, setV] = useState({ socialWorker: p.socialWorker ?? '', type: (p.typeManual ? p.type : 'AUTO') as string, goal: p.goal ?? '', startDate: p.startDate });
  const [kinds, setKinds] = useState<string[]>(p.kinds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.put(`/social-work/processes/${p.id}`, { ...v, kinds }), {
    success: 'פרטי התהליך נשמרו', silentCodes: ['VALIDATION'], onSuccess: () => setEditing(false), onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });
  const applyType = useAction(() => api.put(`/social-work/processes/${p.id}`, { type: p.suggestedType }), { success: 'סוג התהליך עודכן' });

  return (
    <div className="space-y-4">
      {p.suggestedType && (
        <InlineAlert tone="amber">
          <p>מספר הפגישות בפועל ({p.meetingCount}) מתאים יותר לתהליך <strong>{processTypeLabel[p.suggestedType]}</strong>, אך הוגדר כ{processTypeLabel[p.type]}.</p>
          <Button size="sm" className="mt-2" loading={applyType.isPending} onClick={() => applyType.mutate(undefined)}>עדכן ל{processTypeLabel[p.suggestedType]}</Button>
        </InlineAlert>
      )}
      <Card className="p-5">
        {editing ? (
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!kinds.length) return setErrors({ kinds: 'יש לבחור לפחות מהות ליווי אחת' }); if (!save.isPending) save.mutate(undefined); }} className="space-y-5">
            <KindsField value={kinds} onChange={(k) => { setKinds(k); setErrors((x) => ({ ...x, kinds: '' })); }} error={errors.kinds} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="עו״סית אחראית"><Select value={v.socialWorker} onChange={(e) => setV({ ...v, socialWorker: e.target.value })}><option value="">לא שויכה</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
              <Field label="סוג התהליך"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="AUTO">אוטומטי לפי מספר הפגישות</option><option value="ONE_TIME">{processTypeLabel.ONE_TIME}</option><option value="ONGOING">{processTypeLabel.ONGOING}</option></Select></Field>
              <Field label="תאריך התחלה" error={errors.startDate}><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
            </div>
            <Field label="מטרת הליווי"><Textarea className="min-h-20" value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} /></Field>
            <div className="flex gap-2"><Button type="submit" variant="primary" loading={save.isPending}>שמירת שינויים</Button><Button onClick={() => setEditing(false)} disabled={save.isPending}>ביטול</Button></div>
          </form>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="מספר תהליך">#{p.id}</Detail>
              <Detail label="שם החבר"><Link className="font-medium text-teal-700 hover:underline" to={`/members/${p.memberId}`}>{p.memberName}</Link></Detail>
              <Detail label="שם העו״סית">{p.socialWorker}</Detail>
              <Detail label="סוג התהליך">{processTypeLabel[p.type]} <span className="text-xs text-slate-500">({p.typeManual ? 'הוגדר ידנית' : 'נקבע אוטומטית לפי מספר הפגישות'})</span></Detail>
              <Detail label="מהות הליווי">{p.kinds.map((k) => kindLabel2[k]).join(', ')}</Detail>
              <Detail label="סטטוס"><Badge tone={socialStatusTone(p.status)}>{socialStatusLabel[p.status]}</Badge></Detail>
              <Detail label="תאריך התחלה">{fmtDate(p.startDate)}</Detail>
              {p.endDate && <Detail label="תאריך סיום">{fmtDate(p.endDate)}</Detail>}
              <Detail label="מספר פגישות שהתקיימו">{p.meetingCount}</Detail>
              <Detail label="ביטוח לאומי (מכרטיס החבר)">{p.nationalInsurance ? 'משויך' : 'לא משויך'}</Detail>
              <Detail label="פנייה מקורית">{p.requestId ? <Link className="font-medium text-teal-700 hover:underline" to={`/requests/${p.requestId}`}>פנייה #{p.requestId}</Link> : ''}</Detail>
              {p.endReason && <Detail label="סיבת סיום">{endReasonLabel[p.endReason]}</Detail>}
              <div className="sm:col-span-2 lg:col-span-3"><Detail label="מטרת הליווי">{p.goal}</Detail></div>
              {p.endSummary && <div className="sm:col-span-2 lg:col-span-3"><Detail label="סיכום סיום">{p.endSummary}</Detail></div>}
            </dl>
            <Button className="mt-5" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> עריכת פרטים</Button>
          </>
        )}
      </Card>
    </div>
  );
}

// ----- טאב 2: פגישות -----
interface MForm {
  id?: number; date: string; time: string; subject: string; mode: string; duration: number; originalMinutes: number | null; summary: string; followUpNotes: string; followUpRequired: boolean;
  status: 'HELD' | 'CANCELLED'; cancelReason: string; topics: string[]; meetingActions: string[]; externalPartner: string;
}

function CheckGroup({ legend, options, value, onChange }: { legend: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {Object.entries(options).map(([k, l]) => (
          <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-teal-600" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MeetingsTab({ p }: { p: SocialProcess }) {
  const q = useQuery({ queryKey: ['social-meetings', p.id], queryFn: () => api.get<SocialMeeting[]>(`/social-work/processes/${p.id}/meetings`) });
  const [form, setForm] = useState<MForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(
    () => {
      const f = form!;
      // משך נשמר בדקות; אם הקטגוריה לא השתנתה נשמר הערך המקורי
      const minutes = f.originalMinutes && durationBand(f.originalMinutes) === f.duration ? f.originalMinutes : f.duration;
      const body = { ...f, durationMinutes: minutes };
      return f.id ? api.put(`/social-work/meetings/${f.id}`, body) : api.post(`/social-work/processes/${p.id}/meetings`, body);
    },
    { success: 'הפגישה נשמרה', silentCodes: ['VALIDATION', 'FINISHED'], onSuccess: () => setForm(null), onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }) },
  );
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const held = q.data!.filter((m) => m.status === 'HELD');
  const cancelled = q.data!.filter((m) => m.status === 'CANCELLED');
  const edit = (m: SocialMeeting) => {
    setErrors({});
    setForm({
      id: m.id, date: m.date, time: m.time, subject: m.subject, mode: m.mode, duration: durationBand(m.durationMinutes), originalMinutes: m.durationMinutes, summary: m.summary ?? '',
      followUpNotes: m.followUpNotes ?? '', followUpRequired: m.followUpRequired, status: m.status, cancelReason: m.cancelReason ?? '', topics: m.topics, meetingActions: m.meetingActions, externalPartner: m.externalPartner ?? '',
    });
  };
  const blank = (status: 'HELD' | 'CANCELLED'): MForm => ({
    date: todayStr(), time: '10:00', subject: '', mode: 'FACE', duration: 60, originalMinutes: null, summary: '', followUpNotes: '', followUpRequired: false, status, cancelReason: '', topics: [], meetingActions: [], externalPartner: '',
  });

  const columns: Column<SocialMeeting>[] = [
    { key: 'n', header: 'מספר', cell: (m) => m.number },
    { key: 'd', header: 'תאריך', cell: (m) => `${fmtDate(m.date)} ${m.time}` },
    { key: 's', header: 'נושא', cell: (m) => <span className="font-medium">{m.subject}</span> },
    { key: 'tp', header: 'נושאים שעלו', cell: (m) => (m.topics.length ? m.topics.map((t) => topicLabel[t]).join(', ') : '—') },
    { key: 'ac', header: 'התערבויות בפגישה', cell: (m) => (m.meetingActions.length ? m.meetingActions.map((a) => (a === 'EXTERNAL_PARTNER' && m.externalPartner ? `${meetingActionLabel[a]}: ${m.externalPartner}` : meetingActionLabel[a])).join(', ') : '—') },
    { key: 'm', header: 'אופן מפגש', cell: (m) => modeLabel[m.mode] },
    { key: 'du', header: 'משך', cell: (m) => durationLabel(m.durationMinutes) },
    { key: 'su', header: 'סיכום קצר', cell: (m) => <span className="line-clamp-2 max-w-xs">{m.summary ?? '—'}</span> },
    { key: 'f', header: 'המשך', cell: (m) => (m.followUpRequired ? <Badge tone="amber">נדרשת פעולה</Badge> : '—') },
    { key: 'a', header: 'פעולה', cell: (m) => <Button size="sm" onClick={() => edit(m)}>פתח רשומה</Button> },
  ];
  const cCols: Column<SocialMeeting>[] = [
    { key: 'd', header: 'תאריך', cell: (m) => `${fmtDate(m.date)} ${m.time}` },
    { key: 's', header: 'נושא', cell: (m) => m.subject },
    { key: 'r', header: 'סיבת הביטול', cell: (m) => m.cancelReason ?? '—' },
    { key: 'a', header: 'פעולה', cell: (m) => <Button size="sm" onClick={() => edit(m)}>פתח רשומה</Button> },
  ];

  const submit = () => {
    if (!form) return;
    const e: Record<string, string> = {};
    if (!form.date) e.date = 'יש לבחור תאריך';
    if (!form.time) e.time = 'יש לבחור שעה';
    if (form.status === 'CANCELLED' && !form.cancelReason.trim()) e.cancelReason = 'בפגישה שבוטלה יש להזין סיבה';
    if (form.meetingActions.includes('EXTERNAL_PARTNER') && !form.externalPartner.trim()) e.externalPartner = 'יש להזין את שם גורם השת"פ';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(undefined);
  };
  const disabled = p.status === 'FINISHED';
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">פגישות שהתקיימו ({p.meetingCount})</h2>
          <div className="flex gap-2">
            <Button size="sm" disabled={disabled} onClick={() => { setErrors({}); setForm(blank('CANCELLED')); }}>רשום פגישה שבוטלה</Button>
            <Button variant="primary" size="sm" disabled={disabled} title={disabled ? 'יש לפתוח את התהליך מחדש כדי להוסיף פגישה' : undefined} onClick={() => { setErrors({}); setForm(blank('HELD')); }}>
              <Plus className="size-4" aria-hidden /> הוסף פגישה
            </Button>
          </div>
        </div>
        <DataTable caption="פגישות" columns={columns} rows={held} rowKey={(m) => m.id} empty={<EmptyState title="עדיין אין פגישות" text="הוסיפו את הפגישה הראשונה בתהליך." />} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">פגישות שבוטלו ({cancelled.length})</h2>
        <DataTable caption="פגישות שבוטלו" columns={cCols} rows={cancelled} rowKey={(m) => m.id} empty={<EmptyState title="אין פגישות שבוטלו" text="התיעוד מסייע לזהות חברים שמבטלים באופן קבוע." />} />
      </Card>
      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)} title={form?.id ? 'עריכת פגישה' : form?.status === 'CANCELLED' ? 'פגישה שבוטלה' : 'פגישה חדשה'} wide
        footer={<><Button variant="primary" loading={save.isPending} onClick={submit}>שמירה</Button><Button onClick={() => setForm(null)} disabled={save.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="תאריך" required error={errors.date}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="שעה" required error={errors.time}><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
              <Field label="סטטוס הפגישה"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MForm['status'] })}><option value="HELD">התקיימה</option><option value="CANCELLED">בוטלה</option></Select></Field>
            </div>
            {form.status === 'CANCELLED' && <Field label="סיבת הביטול" required error={errors.cancelReason}><Input value={form.cancelReason} onChange={(e) => { setForm({ ...form, cancelReason: e.target.value }); setErrors((x) => ({ ...x, cancelReason: '' })); }} /></Field>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="נושא הפגישה" hint="אם ריק: לפי מהות התהליך" error={errors.subject}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <Field label="פורמט הפגישה"><Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{Object.entries(modeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="משך הפגישה"><Select value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}>{DURATION_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select></Field>
            </div>
            {form.status === 'HELD' && (
              <>
                <CheckGroup legend="נושאים שעלו בפגישה" options={topicLabel} value={form.topics} onChange={(topics) => setForm({ ...form, topics })} />
                <CheckGroup legend="התערבויות בפגישה" options={meetingActionLabel} value={form.meetingActions} onChange={(meetingActions) => setForm({ ...form, meetingActions })} />
                {form.meetingActions.includes('EXTERNAL_PARTNER') && <Field label="שם גורם השת״פ החיצוני" required error={errors.externalPartner}><Input value={form.externalPartner} onChange={(e) => { setForm({ ...form, externalPartner: e.target.value }); setErrors((x) => ({ ...x, externalPartner: '' })); }} /></Field>}
                <Field label="סיכום הפגישה (לא חובה)"><Textarea className="min-h-20" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
                <Field label="הערות להמשך"><Textarea className="min-h-16" value={form.followUpNotes} onChange={(e) => setForm({ ...form, followUpNotes: e.target.value })} /></Field>
                <Checkbox label="נדרשת פעולת המשך" checked={form.followUpRequired} onChange={(c) => setForm({ ...form, followUpRequired: c })} />
              </>
            )}
            {form.id && <p className="text-xs text-slate-500">שינויים משמעותיים בפגישה מתועדים בהיסטוריית התהליך.</p>}
            {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ----- טאב 3: התערבויות -----
interface IForm { id?: number; date: string; type: string; description: string; involved: string; status: string; treatmentId: string; meetingId: string }

function InterventionsTab({ p }: { p: SocialProcess }) {
  const q = useQuery({ queryKey: ['social-interventions', p.id], queryFn: () => api.get<SocialIntervention[]>(`/social-work/processes/${p.id}/interventions`) });
  const treatments = useQuery({ queryKey: ['member-treatments', p.memberId], queryFn: () => api.get<Treatment[]>(`/members/${p.memberId}/treatments`) });
  const meetings = useQuery({ queryKey: ['social-meetings', p.id], queryFn: () => api.get<SocialMeeting[]>(`/social-work/processes/${p.id}/meetings`) });
  const [form, setForm] = useState<IForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(
    () => {
      const body = { ...form, treatmentId: form!.treatmentId ? Number(form!.treatmentId) : null, meetingId: form!.meetingId ? Number(form!.meetingId) : null };
      return form!.id ? api.put(`/social-work/interventions/${form!.id}`, body) : api.post(`/social-work/processes/${p.id}/interventions`, body);
    },
    { success: 'הפעולה נשמרה', silentCodes: ['VALIDATION', 'CROSS_MEMBER'], onSuccess: () => setForm(null), onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }) },
  );
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const columns: Column<SocialIntervention>[] = [
    { key: 'd', header: 'תאריך', cell: (i) => fmtDate(i.date) },
    { key: 't', header: 'סוג פעולה', cell: (i) => interventionTypeLabel[i.type] },
    { key: 'x', header: 'תיאור', cell: (i) => i.description },
    { key: 'inv', header: 'גורם מעורב', cell: (i) => i.involved ?? '—' },
    { key: 's', header: 'סטטוס פעולה', cell: (i) => <Badge tone={i.status === 'DONE' ? 'green' : i.status === 'IN_PROGRESS' ? 'amber' : 'gray'}>{interventionStatusLabel[i.status]}</Badge> },
    { key: 'mt', header: 'פגישה קשורה', cell: (i) => { const m = (meetings.data ?? []).find((x) => x.id === i.meetingId); return m ? `${m.number ? `#${m.number} ` : ''}${fmtDate(m.date)}` : '—'; } },
    { key: 'tr', header: 'שפ״ח קשור', cell: (i) => (i.treatmentId ? <Link className="text-teal-700 hover:underline" to={`/treatments/${i.treatmentId}`}>#{i.treatmentId}</Link> : '—') },
    { key: 'a', header: 'פעולה', cell: (i) => <Button size="sm" onClick={() => { setErrors({}); setForm({ id: i.id, date: i.date, type: i.type, description: i.description, involved: i.involved ?? '', status: i.status, treatmentId: i.treatmentId ? String(i.treatmentId) : '', meetingId: i.meetingId ? String(i.meetingId) : '' }); }}>עריכה</Button> },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">התערבויות ופעולות</h2>
        <Button variant="primary" size="sm" onClick={() => { setErrors({}); setForm({ date: todayStr(), type: 'EXTERNAL_CONTACT', description: '', involved: '', status: 'OPEN', treatmentId: '', meetingId: '' }); }}><Plus className="size-4" aria-hidden /> הוסף פעולה</Button>
      </div>
      <DataTable caption="התערבויות" columns={columns} rows={q.data!} rowKey={(i) => i.id} empty={<EmptyState title="אין פעולות" text="תעדו כאן פעולות שאינן בהכרח פגישה." />} />
      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)} title={form?.id ? 'עריכת פעולה' : 'פעולה חדשה'} wide
        footer={<><Button variant="primary" loading={save.isPending} onClick={() => { if (!form) return; if (!form.description.trim()) return setErrors({ description: 'תיאור הוא שדה חובה' }); save.mutate(undefined); }}>שמירה</Button><Button onClick={() => setForm(null)} disabled={save.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="תאריך"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="סוג פעולה"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(interventionTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="סטטוס פעולה"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(interventionStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
            <Field label="תיאור" required error={errors.description}><Textarea className="min-h-20" value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setErrors({}); }} /></Field>
            <Field label="גורם מעורב"><Input value={form.involved} onChange={(e) => setForm({ ...form, involved: e.target.value })} /></Field>
            <Field label="קישור לפגישה (לא חובה)" hint="פגישה באותו תהליך ליווי">
              <Select value={form.meetingId} onChange={(e) => setForm({ ...form, meetingId: e.target.value })}>
                <option value="">ללא קישור</option>
                {(meetings.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.number ? `#${m.number} · ` : 'בוטלה · '}{fmtDate(m.date)} · {m.subject}</option>)}
              </Select>
            </Field>
            <Field label="קישור לתהליך שפ״ח (של אותו חבר)" hint="אופציונלי, אם הפעולה קשורה לטיפול הפסיכולוגי">
              <Select value={form.treatmentId} onChange={(e) => setForm({ ...form, treatmentId: e.target.value })}>
                <option value="">ללא קישור</option>
                {(treatments.data ?? []).map((t) => <option key={t.id} value={t.id}>#{t.id} · {trackLabel[t.track]} · {treatmentStatusLabel[t.status]}</option>)}
              </Select>
            </Field>
            {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
          </div>
        )}
      </Dialog>
    </Card>
  );
}

// ----- טאב 4: דוחות וסיכומים -----
function ReportsTab({ p }: { p: SocialProcess }) {
  const q = useQuery({ queryKey: ['social-reports', p.id], queryFn: () => api.get<SwReport[]>(`/social-work/processes/${p.id}/reports`) });
  const [form, setForm] = useState<{ id?: number; type: string; date: string; title: string; content: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => (form!.id ? api.put(`/social-work/reports/${form!.id}`, form) : api.post(`/social-work/processes/${p.id}/reports`, form)), {
    success: 'הדוח נשמר', silentCodes: ['VALIDATION'], onSuccess: () => setForm(null), onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const columns: Column<SwReport>[] = [
    { key: 'd', header: 'תאריך', cell: (r) => fmtDate(r.date) },
    { key: 't', header: 'סוג', cell: (r) => swReportTypeLabel[r.type] },
    { key: 'ti', header: 'כותרת', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'a', header: 'פעולה', cell: (r) => <Button size="sm" onClick={() => { setErrors({}); setForm({ id: r.id, type: r.type, date: r.date, title: r.title, content: r.content }); }}>צפייה ועריכה</Button> },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">דוחות וסיכומים</h2>
        <Button variant="primary" size="sm" onClick={() => { setErrors({}); setForm({ type: 'PERIODIC', date: todayStr(), title: '', content: '' }); }}><Plus className="size-4" aria-hidden /> הוסף דוח</Button>
      </div>
      <DataTable caption="דוחות וסיכומים" columns={columns} rows={q.data!} rowKey={(r) => r.id} empty={<EmptyState title="אין דוחות" text="ניתן לכתוב סיכום תקופתי, כללי או סיכום סיום." />} />
      <Dialog open={!!form} onOpenChange={(o) => !o && !save.isPending && setForm(null)} title={form?.id ? 'צפייה ועריכת דוח' : 'דוח חדש'} wide
        footer={<><Button variant="primary" loading={save.isPending} onClick={() => { if (!form?.title.trim()) return setErrors({ title: 'יש להזין כותרת' }); save.mutate(undefined); }}>שמירה</Button><Button onClick={() => setForm(null)} disabled={save.isPending}>ביטול</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="סוג"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(swReportTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="תאריך"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            </div>
            <Field label="כותרת" required error={errors.title}><Input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setErrors({}); }} /></Field>
            <Field label="תוכן"><Textarea className="min-h-40" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

// ----- טאב 5: תהליכים קשורים -----
function RelatedTab({ p }: { p: SocialProcess }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['social-related', p.id], queryFn: () => api.get<ProcessRelated>(`/social-work/processes/${p.id}/related`) });
  const treatments = useQuery({ queryKey: ['member-treatments', p.memberId], queryFn: () => api.get<Treatment[]>(`/members/${p.memberId}/treatments`) });
  const [linking, setLinking] = useState(false);
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const link = useAction(() => api.post(`/social-work/processes/${p.id}/link-treatment`, { treatmentId: Number(pick) }), {
    success: 'התהליך קושר לשפ״ח', silentCodes: ['ALREADY_LINKED', 'CROSS_MEMBER'], onSuccess: () => { setLinking(false); setPick(''); }, onError: (e: ApiError) => setError(e.message),
  });
  const unlink = useAction((id: number) => api.del(`/social-work/processes/${p.id}/link-treatment/${id}`), { success: 'הקישור הוסר' });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const rel = q.data!;

  type TR = ProcessRelated['treatments'][number];
  const tCols: Column<TR>[] = [
    { key: 'id', header: 'מזהה שפ״ח', cell: (t) => `#${t.id}` },
    { key: 'tr', header: 'מסלול', cell: (t) => trackLabel[t.track] },
    { key: 'th', header: 'מטפל', cell: (t) => t.therapist ?? '—' },
    { key: 's', header: 'סטטוס', cell: (t) => <Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge> },
    { key: 'd', header: 'תאריך התחלה', cell: (t) => fmtDate(t.startDate) },
    { key: 'a', header: 'פעולות', cell: (t) => <div className="flex gap-1.5"><Button size="sm" onClick={() => nav(`/treatments/${t.id}`)}>פתח כרטיס שפ״ח</Button><Button size="sm" variant="danger" loading={unlink.isPending && unlink.variables === t.id} onClick={() => unlink.mutate(t.id)}>הסר קישור</Button></div> },
  ];
  const oCols: Column<SocialProcess>[] = [
    { key: 'id', header: 'מזהה', cell: (o) => `#${o.id}` },
    { key: 'k', header: 'מהות', cell: (o) => o.kinds.map((k) => kindLabel2[k]).join(', ') },
    { key: 's', header: 'סטטוס', cell: (o) => <Badge tone={socialStatusTone(o.status)}>{socialStatusLabel[o.status]}</Badge> },
    { key: 'd', header: 'תאריך התחלה', cell: (o) => fmtDate(o.startDate) },
    { key: 'a', header: 'פעולה', cell: (o) => <Button size="sm" onClick={() => nav(`/social-work/${o.id}`)}>פתח</Button> },
  ];
  const linkedIds = new Set(rel.treatments.map((t) => t.id));
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">הפנייה שהובילה לפתיחת התהליך</h2>
        {rel.request ? (
          <DataTable caption="פנייה מקורית" columns={[
            { key: 'i', header: 'מספר', cell: (r: NonNullable<ProcessRelated['request']>) => `#${r.id}` },
            { key: 's', header: 'נושא', cell: (r: NonNullable<ProcessRelated['request']>) => r.subject },
            { key: 't', header: 'סוג', cell: (r: NonNullable<ProcessRelated['request']>) => requestTypeLabel[r.type] },
            { key: 'st', header: 'סטטוס', cell: (r: NonNullable<ProcessRelated['request']>) => <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge> },
            { key: 'a', header: 'פעולה', cell: (r: NonNullable<ProcessRelated['request']>) => <Button size="sm" onClick={() => nav(`/requests/${r.id}`)}>פתח פנייה</Button> },
          ]} rows={[rel.request]} rowKey={(r) => r.id} />
        ) : <EmptyState title="התהליך לא נפתח מפנייה" />}
      </Card>
      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">תהליכי שפ״ח מקושרים</h2>
          <Button size="sm" onClick={() => { setError(''); setLinking(true); }}>קשר שפ״ח של החבר</Button>
        </div>
        <DataTable caption="שפ״ח מקושר" columns={tCols} rows={rel.treatments} rowKey={(t) => t.id} empty={<EmptyState title="אין שפ״ח מקושר" text="ניתן לקשר רק תהליך שפ״ח של אותו חבר." />} />
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">תהליכי ליווי נוספים של החבר</h2>
        <DataTable caption="תהליכי ליווי נוספים" columns={oCols} rows={rel.otherProcesses} rowKey={(o) => o.id} empty={<EmptyState title="אין תהליכי ליווי נוספים" />} />
      </Card>
      <Dialog open={linking} onOpenChange={(o) => !o && !link.isPending && setLinking(false)} title="קישור לתהליך שפ״ח"
        footer={<><Button variant="primary" loading={link.isPending} onClick={() => (pick ? link.mutate(undefined) : setError('יש לבחור תהליך שפ"ח'))}>קשר</Button><Button onClick={() => setLinking(false)} disabled={link.isPending}>ביטול</Button></>}>
        <Field label="תהליך שפ״ח של החבר" error={error}>
          <Select value={pick} onChange={(e) => { setPick(e.target.value); setError(''); }}>
            <option value="">בחירה...</option>
            {(treatments.data ?? []).filter((t) => !linkedIds.has(t.id)).map((t) => <option key={t.id} value={t.id}>#{t.id} · {trackLabel[t.track]} · {treatmentStatusLabel[t.status]}</option>)}
          </Select>
        </Field>
        <p className="mt-2 text-xs text-slate-500">הקישור אינו משנה את תהליך השפ״ח. פתיחת שפ״ח חדש מתבצעת במסך שפ״ח.</p>
      </Dialog>
    </div>
  );
}

// ----- טאב 6: היסטוריה -----
function HistoryTab({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['social-events', id], queryFn: () => api.get<SocialEvent[]>(`/social-work/processes/${id}/events`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const columns: Column<SocialEvent>[] = [
    { key: 'd', header: 'תאריך ושעה', cell: (e) => fmtDateTime(e.createdAt) },
    { key: 't', header: 'פעולה', cell: (e) => <Badge>{socialEventLabel[e.type] ?? e.type}</Badge> },
    { key: 'x', header: 'פרטים', cell: (e) => e.description },
    { key: 's', header: 'סטטוס קודם ← חדש', cell: (e) => (e.toStatus ? `${e.fromStatus ? socialStatusLabel[e.fromStatus] : '—'} ← ${socialStatusLabel[e.toStatus]}` : '—') },
  ];
  return <Card><DataTable caption="היסטוריית התהליך" columns={columns} rows={q.data!} rowKey={(e) => e.id} empty={<EmptyState title="אין אירועים" />} /></Card>;
}

// ----- כרטיס -----
export default function SocialCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const [tab, setTab] = useState('general');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'freeze' | 'finish' | 'reopen' | null>(null);
  const [note, setNote] = useState('');
  const [fin, setFin] = useState({ reason: 'GOAL_ACHIEVED', summary: '', endDate: todayStr() });
  const [finErr, setFinErr] = useState('');
  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ['social-process', id], queryFn: () => api.get<SocialProcess>(`/social-work/processes/${id}`) });

  const activate = useAction(() => api.post(`/social-work/processes/${id}/activate`), { success: 'התהליך הופעל' });
  const unfreeze = useAction(() => api.post(`/social-work/processes/${id}/unfreeze`), { success: 'התהליך הוצא מהקפאה' });
  const act = useAction(
    () => {
      const base = `/social-work/processes/${id}`;
      if (dialog === 'freeze') return api.post(`${base}/freeze`, { note });
      if (dialog === 'reopen') return api.post(`${base}/reopen`, { note });
      return api.post(`${base}/finish`, fin);
    },
    { success: 'הפעולה בוצעה ותועדה', silentCodes: ['VALIDATION'], onSuccess: () => { setDialog(null); setNote(''); }, onError: (e: ApiError) => e.code === 'VALIDATION' && setFinErr(e.fields.summary ?? e.message) },
  );

  if (isLoading) return <Spinner />;
  if (error || !p) return <ErrorBlock error={error ?? new Error('התהליך לא נמצא')} onRetry={() => refetch()} />;
  const tabs = [
    { value: 'general', label: 'פרטים כלליים' }, { value: 'meetings', label: `פגישות (${p.meetingCount})` }, { value: 'interventions', label: 'התערבויות ופעולות' },
    { value: 'reports', label: 'דוחות וסיכומים' }, { value: 'related', label: 'תהליכים קשורים' }, { value: 'history', label: 'היסטוריה' },
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'ליווי עו״ס', to: '/social-work' }, { label: `תהליך #${p.id}` }]}
        title={<>ליווי עו״ס #{p.id}: <Link className="text-teal-700 hover:underline" to={`/members/${p.memberId}`}>{p.memberName}</Link></>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={socialStatusTone(p.status)}>{socialStatusLabel[p.status]}</Badge>
            <span>{processTypeLabel[p.type]}</span>
            <span>{p.kinds.map((k) => kindLabel2[k]).join(', ')}</span>
            <span>עו״סית: {p.socialWorker ?? 'לא שויכה'}</span>
            <span>{p.meetingCount} פגישות</span>
          </span>
        }
        actions={
          <>
            {p.status === 'NOT_STARTED' && <Button variant="primary" loading={activate.isPending} onClick={() => activate.mutate(undefined)}>הפעל תהליך</Button>}
            {p.status === 'ACTIVE' && <Button onClick={() => { setNote(''); setDialog('freeze'); }}>הקפא תהליך</Button>}
            {p.status === 'FROZEN' && <Button loading={unfreeze.isPending} onClick={() => unfreeze.mutate(undefined)}>הוצא מהקפאה</Button>}
            {p.status !== 'FINISHED' && <Button variant="danger" onClick={() => { setFinErr(''); setDialog('finish'); }}>סיים תהליך</Button>}
            {p.status === 'FINISHED' && <Button variant="primary" onClick={() => { setNote(''); setDialog('reopen'); }}>פתח מחדש</Button>}
            <Button onClick={() => { setTab('general'); setEditing(true); }}><Pencil className="size-4" aria-hidden /> עריכה</Button>
            <Button onClick={() => nav('/social-work')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="general"><GeneralTab key={editing ? 'e' : 'v'} p={p} editing={editing} setEditing={setEditing} /></TabsContent>
        <TabsContent value="meetings"><MeetingsTab p={p} /></TabsContent>
        <TabsContent value="interventions"><InterventionsTab p={p} /></TabsContent>
        <TabsContent value="reports"><ReportsTab p={p} /></TabsContent>
        <TabsContent value="related"><RelatedTab p={p} /></TabsContent>
        <TabsContent value="history"><HistoryTab id={p.id} /></TabsContent>
      </Tabs>

      <Dialog open={dialog === 'freeze' || dialog === 'reopen'} onOpenChange={(o) => !o && !act.isPending && setDialog(null)} title={dialog === 'freeze' ? 'הקפאת תהליך' : 'פתיחה מחדש של תהליך'}
        footer={<><Button variant="primary" loading={act.isPending} onClick={() => act.mutate(undefined)}>אישור</Button><Button onClick={() => setDialog(null)} disabled={act.isPending}>ביטול</Button></>}>
        <Field label="הערה (אופציונלי)"><Textarea className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {dialog === 'reopen' && <p className="mt-2 text-xs text-slate-500">כל ההיסטוריה (פגישות, אירועים וסיכום הסיום הקודם) נשמרת. ניתן להוסיף פגישות לאחר הפתיחה מחדש.</p>}
      </Dialog>
      <Dialog open={dialog === 'finish'} onOpenChange={(o) => !o && !act.isPending && setDialog(null)} title="סיום תהליך ליווי" wide
        footer={<><Button variant="primary" loading={act.isPending} onClick={() => (fin.summary.trim() ? act.mutate(undefined) : setFinErr('יש להזין סיכום קצר'))}>סיים תהליך</Button><Button onClick={() => setDialog(null)} disabled={act.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="סיבת סיום"><Select value={fin.reason} onChange={(e) => setFin({ ...fin, reason: e.target.value })}>{Object.entries(endReasonLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="תאריך סיום"><Input type="date" value={fin.endDate} onChange={(e) => setFin({ ...fin, endDate: e.target.value })} /></Field>
          </div>
          <Field label="סיכום קצר" required error={finErr}><Textarea className="min-h-24" value={fin.summary} onChange={(e) => { setFin({ ...fin, summary: e.target.value }); setFinErr(''); }} /></Field>
        </div>
      </Dialog>
    </>
  );
}
