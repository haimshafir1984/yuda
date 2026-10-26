import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import KindsField from '../../components/KindsField';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, PageHeader, Select, Spinner, Tabs, TabsContent, TabsList, Textarea,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import {
  decisionLabel, fmtDate, fmtDateTime, modeLabel, priorityLabel, priorityTone, processTypeLabel, requestEventLabel, requestSourceLabel, requestStatusLabel,
  requestStatusTone, requestTypeLabel, socialStatusLabel, socialStatusTone, todayStr, trackLabel, treatmentStatusLabel, treatmentStatusTone, kindLabel2,
} from '../../lib/format';
import type { RequestEvent, RequestRelated, ServiceRequest, Treatment } from '../../lib/types';
import { useStaff } from './RequestsList';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}

// ----- טאב 1: פרטי פנייה -----
function DetailsTab({ r, editing, setEditing }: { r: ServiceRequest; editing: boolean; setEditing: (e: boolean) => void }) {
  const [v, setV] = useState({ type: r.type, subject: r.subject, description: r.description ?? '', openedAt: r.openedAt, source: r.source, priority: r.priority, internalNote: r.internalNote ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.put(`/service-requests/${r.id}`, v), {
    success: 'פרטי הפנייה נשמרו',
    silentCodes: ['VALIDATION'],
    onSuccess: () => setEditing(false),
    onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });
  const set = (k: keyof typeof v, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  if (editing)
    return (
      <Card className="p-5">
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (!v.subject.trim()) return setErrors({ subject: 'נושא הוא שדה חובה' }); if (!save.isPending) save.mutate(undefined); }} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="סוג פנייה"><Select value={v.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(requestTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="נושא" required error={errors.subject} className="lg:col-span-2"><Input value={v.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
            <Field label="תיאור" className="sm:col-span-2 lg:col-span-3"><Textarea value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="תאריך פתיחה"><Input type="date" value={v.openedAt} onChange={(e) => set('openedAt', e.target.value)} /></Field>
            <Field label="מקור"><Select value={v.source} onChange={(e) => set('source', e.target.value)}>{Object.entries(requestSourceLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="עדיפות"><Select value={v.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(priorityLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="הערה פנימית" className="sm:col-span-2 lg:col-span-3"><Input value={v.internalNote} onChange={(e) => set('internalNote', e.target.value)} /></Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={save.isPending}>שמירת שינויים</Button>
            <Button onClick={() => setEditing(false)} disabled={save.isPending}>ביטול</Button>
          </div>
        </form>
      </Card>
    );

  return (
    <Card className="p-5">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="מספר פנייה">#{r.id}</Detail>
        <Detail label="שם החבר"><Link className="font-medium text-teal-700 hover:underline" to={`/members/${r.memberId}`}>{r.memberName}</Link></Detail>
        <Detail label="תאריך פתיחה">{fmtDate(r.openedAt)}</Detail>
        <Detail label="סוג הפנייה">{requestTypeLabel[r.type]}</Detail>
        <Detail label="נושא">{r.subject}</Detail>
        <Detail label="מקור">{requestSourceLabel[r.source]}</Detail>
        <Detail label="אחראי">{r.assignee}</Detail>
        <Detail label="עדיפות"><Badge tone={priorityTone(r.priority)}>{priorityLabel[r.priority]}</Badge></Detail>
        <Detail label="סטטוס"><Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge></Detail>
        <Detail label="החלטה אחרונה">{r.decision ? decisionLabel[r.decision] : ''}</Detail>
        {r.closeReason && <Detail label="סיבת סגירה / סיכום טיפול">{r.closeReason}</Detail>}
        <div className="sm:col-span-2 lg:col-span-3"><Detail label="תיאור">{r.description}</Detail></div>
        <div className="sm:col-span-2 lg:col-span-3"><Detail label="הערה פנימית">{r.internalNote}</Detail></div>
      </dl>
      <Button className="mt-5" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> עריכת פרטים</Button>
    </Card>
  );
}

// ----- טאב 2: טיפול בפנייה -----
type Action = 'assign' | 'status' | 'note' | 'contact' | 'decision' | 'social' | 'link' | null;

function HandlingDialogs({ r, action, onClose }: { r: ServiceRequest; action: Action; onClose: () => void }) {
  const staff = useStaff();
  const treatments = useQuery({ queryKey: ['member-treatments', r.memberId], queryFn: () => api.get<Treatment[]>(`/members/${r.memberId}/treatments`), enabled: action === 'link' });
  const [v, setV] = useState({
    assignee: r.assignee ?? '', status: r.status as string, reason: '', text: '', mode: 'PHONE', date: todayStr(), decision: 'SOCIAL_WORK_NEEDED', note: '',
    worker: r.assignee ?? '', type: 'AUTO', goal: r.subject, startDate: todayStr(), treatmentId: '', allowAnother: false,
  });
  const [kinds, setKinds] = useState<string[]>(r.type === 'RIGHTS' ? ['RIGHTS'] : r.type === 'BUREAUCRATIC' ? ['BUREAUCRATIC'] : ['SUPPORT']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [already, setAlready] = useState<number | null>(null);
  const nav = useNavigate();
  const set = (k: keyof typeof v, val: string | boolean) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  const run = useAction(
    () => {
      const base = `/service-requests/${r.id}`;
      switch (action) {
        case 'assign': return api.post(`${base}/assign`, { assignee: v.assignee });
        case 'status': return api.post(`${base}/status`, { status: v.status, reason: v.reason });
        case 'note': return api.post(`${base}/notes`, { text: v.text });
        case 'contact': return api.post(`${base}/contacts`, { text: v.text, mode: v.mode, date: v.date });
        case 'decision': return api.post(`${base}/decision`, { decision: v.decision, note: v.note });
        case 'social': return api.post<{ id: number }>(`${base}/open-social-work`, { socialWorker: v.worker, kinds, type: v.type, goal: v.goal, startDate: v.startDate, allowAnother: v.allowAnother });
        default: return api.post(`${base}/link-treatment`, { treatmentId: Number(v.treatmentId) });
      }
    },
    {
      success: action === 'social' ? 'נפתח תהליך ליווי עו״ס' : 'הפעולה נשמרה ותועדה',
      silentCodes: ['VALIDATION', 'REASON_REQUIRED', 'NO_CHANGE', 'REQUEST_ALREADY_LINKED', 'ALREADY_LINKED', 'CROSS_MEMBER'],
      onSuccess: (res) => { onClose(); if (action === 'social') nav(`/social-work/${(res as { id: number }).id}`); },
      onError: (e: ApiError) => {
        if (e.code === 'REQUEST_ALREADY_LINKED') setAlready(e.details?.processId ?? null);
        setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message });
      },
    },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (action === 'assign' && !v.assignee) e.assignee = 'יש לבחור גורם אחראי';
    if (action === 'status' && v.status === 'CLOSED' && !v.reason.trim()) e.reason = 'בסגירת פנייה יש להזין סיבת סגירה או סיכום טיפול';
    if ((action === 'note' || action === 'contact') && !v.text.trim()) e.text = 'יש להזין טקסט';
    if (action === 'social' && !kinds.length) e.kinds = 'יש לבחור לפחות מהות ליווי אחת';
    if (action === 'link' && !v.treatmentId) e.treatmentId = 'יש לבחור תהליך שפ"ח';
    setErrors(e);
    if (!Object.keys(e).length) run.mutate(undefined);
  };

  const titles: Record<Exclude<Action, null>, string> = {
    assign: 'שיוך גורם אחראי', status: 'עדכון סטטוס', note: 'הוספת הערת טיפול', contact: 'תיעוד שיחה או פגישה', decision: 'קביעת החלטה', social: 'פתיחת תהליך ליווי עו״ס', link: 'קישור לתהליך שפ״ח קיים',
  };
  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && !run.isPending && onClose()} title={action ? titles[action] : ''} wide
      footer={<><Button variant="primary" loading={run.isPending} onClick={submit}>אישור</Button><Button onClick={onClose} disabled={run.isPending}>ביטול</Button></>}>
      {action && (
        <div className="space-y-4">
          {action === 'assign' && <Field label="גורם אחראי" required error={errors.assignee}><Select value={v.assignee} onChange={(e) => set('assignee', e.target.value)}><option value="">בחירה...</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>}
          {action === 'status' && (
            <>
              <Field label="סטטוס חדש"><Select value={v.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(requestStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label={v.status === 'CLOSED' ? 'סיבת סגירה / סיכום טיפול' : 'הערה (אופציונלי)'} required={v.status === 'CLOSED'} error={errors.reason}><Textarea className="min-h-20" value={v.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
            </>
          )}
          {(action === 'note' || action === 'contact') && (
            <>
              {action === 'contact' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="אופן"><Select value={v.mode} onChange={(e) => set('mode', e.target.value)}>{Object.entries(modeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="תאריך"><Input type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
                </div>
              )}
              <Field label={action === 'note' ? 'הערת טיפול' : 'תיאור השיחה או הפגישה'} required error={errors.text}><Textarea className="min-h-24" value={v.text} onChange={(e) => set('text', e.target.value)} /></Field>
            </>
          )}
          {action === 'decision' && (
            <>
              <Field label="החלטה"><Select value={v.decision} onChange={(e) => set('decision', e.target.value)}>{Object.entries(decisionLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="הערה"><Textarea className="min-h-16" value={v.note} onChange={(e) => set('note', e.target.value)} /></Field>
              <InlineAlert tone="blue">קביעת החלטה אינה סוגרת את הפנייה. את הסטטוס מעדכנים בנפרד.</InlineAlert>
            </>
          )}
          {action === 'social' && (
            <>
              <InlineAlert tone="blue">החבר ({r.memberName}) והפנייה #{r.id} ישויכו לתהליך אוטומטית.</InlineAlert>
              <KindsField value={kinds} onChange={(k) => { setKinds(k); setErrors((p) => ({ ...p, kinds: '' })); }} error={errors.kinds} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="עו״סית אחראית"><Select value={v.worker} onChange={(e) => set('worker', e.target.value)}><option value="">לא שויכה</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
                <Field label="סוג התהליך"><Select value={v.type} onChange={(e) => set('type', e.target.value)}><option value="AUTO">אוטומטי לפי מספר הפגישות</option><option value="ONE_TIME">{processTypeLabel.ONE_TIME} (עד 2 פגישות)</option><option value="ONGOING">{processTypeLabel.ONGOING} (3 פגישות ומעלה)</option></Select></Field>
                <Field label="תאריך התחלה"><Input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
              </div>
              <Field label="מטרת הליווי"><Textarea className="min-h-16" value={v.goal} onChange={(e) => set('goal', e.target.value)} /></Field>
              {already && (
                <InlineAlert tone="amber">
                  <p>מהפנייה הזו כבר נפתח תהליך ליווי <Link className="font-medium underline" to={`/social-work/${already}`}>#{already}</Link>. כדי לפתוח תהליך נוסף בכל זאת, סמנו את האפשרות ושמרו שוב.</p>
                  <label className="mt-2 inline-flex items-center gap-2"><input type="checkbox" className="size-4 accent-teal-600" checked={v.allowAnother} onChange={(e) => set('allowAnother', e.target.checked)} /> פתח תהליך נוסף</label>
                </InlineAlert>
              )}
            </>
          )}
          {action === 'link' && (
            <Field label="תהליך שפ״ח של החבר" required error={errors.treatmentId} hint="קישור בלבד. פתיחת שפ״ח חדש מתבצעת במסך שפ״ח, בכפוף לאישור יהודה">
              <Select value={v.treatmentId} onChange={(e) => set('treatmentId', e.target.value)}>
                <option value="">בחירה...</option>
                {(treatments.data ?? []).map((t) => <option key={t.id} value={t.id}>#{t.id} · {trackLabel[t.track]} · {treatmentStatusLabel[t.status]}</option>)}
              </Select>
            </Field>
          )}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      )}
    </Dialog>
  );
}

function HandlingTab({ r }: { r: ServiceRequest }) {
  const nav = useNavigate();
  const [action, setAction] = useState<Action>(null);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-slate-900">פעולות טיפול</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAction('assign')}>שיוך גורם אחראי</Button>
          <Button onClick={() => setAction('status')}>עדכון סטטוס</Button>
          <Button onClick={() => setAction('note')}>הוספת הערת טיפול</Button>
          <Button onClick={() => setAction('contact')}>תיעוד שיחה או פגישה</Button>
          <Button onClick={() => setAction('decision')}>קביעת החלטה</Button>
        </div>
        {r.decision && <p className="mt-3 text-sm text-slate-700">החלטה אחרונה: <strong>{decisionLabel[r.decision]}</strong></p>}
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-slate-900">פתיחת תהליך המשך</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setAction('social')}>פתח תהליך ליווי עו״ס</Button>
          <Button onClick={() => nav(`/treatments/new?memberId=${r.memberId}&requestId=${r.id}`)}>פתח תהליך שפ״ח</Button>
          <Button onClick={() => setAction('link')}>קשר שפ״ח קיים</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">שפ״ח נפתח במסך שפ״ח הקיים, עם כל כללי הפתיחה והאישור (כולל אישור יהודה). לאחר היצירה הוא מקושר לפנייה אוטומטית.</p>
      </Card>
      {action && <HandlingDialogs key={action} r={r} action={action} onClose={() => setAction(null)} />}
    </div>
  );
}

// ----- טאב 3: היסטוריה -----
function HistoryTab({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['request-events', id], queryFn: () => api.get<RequestEvent[]>(`/service-requests/${id}/events`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const columns: Column<RequestEvent>[] = [
    { key: 'd', header: 'תאריך ושעה', cell: (e) => fmtDateTime(e.createdAt) },
    { key: 't', header: 'סוג פעולה', cell: (e) => <Badge>{requestEventLabel[e.type] ?? e.type}</Badge> },
    { key: 'x', header: 'תיאור', cell: (e) => e.description },
    { key: 'a', header: 'מבצע הפעולה', cell: (e) => e.actor ?? '—' },
    { key: 's', header: 'סטטוס קודם ← חדש', cell: (e) => (e.toStatus ? `${e.fromStatus ? requestStatusLabel[e.fromStatus] : '—'} ← ${requestStatusLabel[e.toStatus]}` : '—') },
  ];
  return <Card><DataTable caption="היסטוריית פעולות" columns={columns} rows={q.data!} rowKey={(e) => e.id} empty={<EmptyState title="אין פעולות" />} /></Card>;
}

// ----- טאב 4: תהליכים קשורים -----
function RelatedTab({ id }: { id: number }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['request-related', id], queryFn: () => api.get<RequestRelated>(`/service-requests/${id}/related`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { socialProcesses, treatments } = q.data!;
  type Row = { key: string; kind: 'social' | 'psych'; id: number; title: string; status: ReactNode; start: string };
  const rows: Row[] = [
    ...socialProcesses.map((p) => ({ key: `s${p.id}`, kind: 'social' as const, id: p.id, title: p.kinds.map((k) => kindLabel2[k]).join(', '), status: <Badge tone={socialStatusTone(p.status)}>{socialStatusLabel[p.status]}</Badge>, start: p.startDate })),
    ...treatments.map((t) => ({ key: `t${t.id}`, kind: 'psych' as const, id: t.id, title: `${trackLabel[t.track]}${t.therapist ? `, ${t.therapist.fullName}` : ''}`, status: <Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge>, start: t.startDate })),
  ];
  const open = (r: Row) => nav(r.kind === 'social' ? `/social-work/${r.id}` : `/treatments/${r.id}`);
  const columns: Column<Row>[] = [
    { key: 'k', header: 'סוג תהליך', cell: (r) => (r.kind === 'social' ? 'ליווי עו״ס' : 'שפ״ח') },
    { key: 'i', header: 'מזהה', cell: (r) => `#${r.id}` },
    { key: 't', header: 'פירוט', cell: (r) => r.title },
    { key: 's', header: 'סטטוס', cell: (r) => r.status },
    { key: 'd', header: 'תאריך התחלה', cell: (r) => fmtDate(r.start) },
    { key: 'o', header: 'פעולה', cell: (r) => <Button size="sm" onClick={(e) => { e.stopPropagation(); open(r); }}>פתח כרטיס</Button> },
  ];
  return (
    <Card>
      <DataTable caption="תהליכים קשורים" columns={columns} rows={rows} rowKey={(r) => r.key} onRowClick={open} empty={<EmptyState title="עדיין לא נוצרו תהליכים מהפנייה" text="בטאב 'טיפול בפנייה' ניתן לפתוח תהליך ליווי עו״ס או שפ״ח." />} />
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">תהליכים נוספים יוצגו כאן בעתיד.</p>
    </Card>
  );
}

export default function RequestCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const { data: r, isLoading, error, refetch } = useQuery({ queryKey: ['service-request', id], queryFn: () => api.get<ServiceRequest>(`/service-requests/${id}`) });
  if (isLoading) return <Spinner />;
  if (error || !r) return <ErrorBlock error={error ?? new Error('הפנייה לא נמצאה')} onRetry={() => refetch()} />;
  const tabs = [
    { value: 'details', label: 'פרטי פנייה' }, { value: 'handling', label: 'טיפול בפנייה' }, { value: 'history', label: 'היסטוריית פעולות' }, { value: 'related', label: 'תהליכים קשורים' },
  ];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'פניות ובקשות סיוע', to: '/requests' }, { label: `פנייה #${r.id}` }]}
        title={<>פנייה #{r.id}: {r.subject}</>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link className="font-medium text-teal-700 hover:underline" to={`/members/${r.memberId}`}>{r.memberName}</Link>
            <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge>
            <Badge tone={priorityTone(r.priority)}>{priorityLabel[r.priority]}</Badge>
            <span>{requestTypeLabel[r.type]}</span>
            <span>אחראי: {r.assignee ?? 'לא שויך'}</span>
          </span>
        }
        actions={<><Button onClick={() => { setTab('details'); setEditing(true); }}><Pencil className="size-4" aria-hidden /> עריכה</Button><Button onClick={() => nav('/requests')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button></>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="details"><DetailsTab key={editing ? 'e' : 'v'} r={r} editing={editing} setEditing={setEditing} /></TabsContent>
        <TabsContent value="handling"><HandlingTab r={r} /></TabsContent>
        <TabsContent value="history"><HistoryTab id={r.id} /></TabsContent>
        <TabsContent value="related"><RelatedTab id={r.id} /></TabsContent>
      </Tabs>
    </>
  );
}
