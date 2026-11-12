import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Checkbox, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Ltr, PageHeader, Select, Spinner, Tabs, TabsContent, TabsList } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useEditState } from '../../lib/auth';
import { fmtDate, todayStr } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { Candidate, IntakeSummary, InterviewSession, candidateStatusLabel, candidateStatusTone, outcomeLabel, settingLabel } from '../../lib/intake';

function SummaryCards({ s, onPick, active }: { s: IntakeSummary; onPick: (status: string) => void; active: string }) {
  const order = ['NEW', 'AWAITING_CLARIFICATION', 'INVITED_GROUP', 'AWAITING_PERSONAL', 'ACCEPTED', 'REJECTED', 'AIR', 'FADED', 'MAYBE_FUTURE'];
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9" role="group" aria-label="סיכום לפי סטטוס">
      {order.map((st) => (
        <button
          key={st}
          type="button"
          aria-pressed={active === st}
          onClick={() => onPick(active === st ? '' : st)}
          className={`rounded-lg border p-3 text-start transition ${active === st ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        >
          <span className="block text-2xl font-bold text-slate-900">{s.counts[st] ?? 0}</span>
          <span className="block text-xs text-slate-600">{candidateStatusLabel[st]}</span>
        </button>
      ))}
    </div>
  );
}

function Alerts({ a }: { a: IntakeSummary['alerts'] }) {
  const nav = useNavigate();
  const items: { key: string; text: string; onClick?: () => void }[] = [];
  if (a.unhandled.length) items.push({ key: 'u', text: `${a.unhandled.length} בקשות מועמדות לא טופלו יותר מ-10 ימים (הוותיקה: ${a.unhandled[0].name}, ${a.unhandled[0].days} ימים)` });
  for (const s of a.undecidedSessions) items.push({ key: `s${s.id}`, text: `בראיון ${s.name} (${fmtDate(s.date)}) נותרו ${s.pending} נרשמים בלי החלטה, שבוע אחרי הראיון`, onClick: () => nav(`/intake/sessions/${s.id}`) });
  if (a.needMoreSessions) items.push({ key: 'f', text: `יש ${a.futureSessions} ראיונות קבוצתיים עתידיים. נדרשים לפחות 2 כדי שההזמנות האוטומטיות יכללו שני מועדים` });
  if (!items.length) return null;
  return (
    <InlineAlert tone="amber">
      <span className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" aria-hidden /> תזכורות לרכז הקבלה</span>
      <ul className="list-disc space-y-1 ps-5">
        {items.map((i) => <li key={i.key}>{i.onClick ? <button type="button" className="text-start underline" onClick={i.onClick}>{i.text}</button> : i.text}</li>)}
      </ul>
    </InlineAlert>
  );
}

function CandidatesTab({ status, setStatus }: { status: string; setStatus: (s: string) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [repeat, setRepeat] = useState(false);
  const dq = useDebounced(q);
  const list = useQuery({ queryKey: ['intake-candidates', dq, status, repeat], queryFn: () => api.get<Candidate[]>('/intake/candidates', { q: dq, status, repeat }) });
  const cols: Column<Candidate>[] = [
    { key: 'n', header: 'שם', cell: (c) => <span className="font-medium text-slate-900">{c.fullName}</span> },
    { key: 'a', header: 'גיל', cell: (c) => c.age ?? '—' },
    { key: 'p', header: 'טלפון', cell: (c) => <Ltr>{c.phone}</Ltr> },
    { key: 'd', header: 'הוגשה', cell: (c) => <span>{fmtDate(c.submittedAt)}{(c.daysSinceSubmitted ?? 0) >= 10 && ['NEW', 'AWAITING_CLARIFICATION'].includes(c.status) ? <Badge tone="red">{c.daysSinceSubmitted} ימים</Badge> : null}</span> },
    { key: 's', header: 'סטטוס', cell: (c) => <Badge tone={candidateStatusTone(c.status)}>{candidateStatusLabel[c.status]}</Badge> },
    { key: 'r', header: 'בקשה חוזרת', cell: (c) => (c.isRepeat ? <Badge tone="amber">חוזרת{c.repeatReason ? `: ${outcomeLabel[c.repeatReason] ?? ''}` : ''}</Badge> : '—') },
    { key: 'c', header: 'רכז', cell: (c) => c.coordinator ?? '—' },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" aria-label="חיפוש מועמד" placeholder="חיפוש לפי שם, טלפון או תעודת זהות" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="סינון לפי סטטוס" className="w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {Object.entries(candidateStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Checkbox label="בקשות חוזרות בלבד" checked={repeat} onChange={setRepeat} />
      </div>
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBlock error={list.error} onRetry={() => list.refetch()} /> : (
        <DataTable caption="מועמדים" columns={cols} rows={list.data ?? []} rowKey={(c) => c.id} onRowClick={(c) => nav(`/intake/candidates/${c.id}`)} empty={<EmptyState title="אין מועמדים" text="בקשות הצטרפות מהאתר מופיעות כאן. אפשר לנסות את דף ההצטרפות בכתובת /join." />} />
      )}
    </Card>
  );
}

function SessionsTab() {
  const nav = useNavigate();
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['intake-sessions'], queryFn: () => api.get<InterviewSession[]>('/intake/sessions') });
  const coords = useQuery({ queryKey: ['intake-coordinators'], queryFn: () => api.get<string[]>('/intake/coordinators') });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ date: todayStr(), startTime: '18:00', coordinator: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAction(() => api.post('/intake/sessions', f), {
    success: 'מועד הראיון נוסף', silentCodes: ['VALIDATION'], onSuccess: () => { setAdding(false); setErrors({}); },
    onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }),
  });
  const cols: Column<InterviewSession>[] = [
    { key: 'n', header: 'שם הראיון', cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'd', header: 'תאריך', cell: (s) => `${fmtDate(s.date)} ${s.startTime ?? ''}` },
    { key: 'c', header: 'רכז', cell: (s) => s.coordinator ?? '—' },
    { key: 's', header: 'נרשמו', cell: (s) => s.signups },
    { key: 'a', header: 'הגיעו', cell: (s) => s.attended },
    { key: 'p', header: 'מצב', cell: (s) => (s.past ? <Badge>התקיים</Badge> : <Badge tone="green">עתידי</Badge>) },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <p className="text-sm text-slate-600">הרכז קובע מועדים לראיונות קבוצתיים אחת לחודש, לכמה חודשים קדימה. ההזמנות כוללות את שני המועדים הקרובים.</p>
        <Button variant="primary" size="sm" disabled={readOnly} onClick={() => { setErrors({}); setAdding(true); }}><Plus className="size-4" aria-hidden /> הוסף מועד ראיון</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="ראיונות קבוצתיים" columns={cols} rows={q.data ?? []} rowKey={(s) => s.id} onRowClick={(s) => nav(`/intake/sessions/${s.id}`)} empty={<EmptyState title="אין ראיונות קבוצתיים" text="יש להוסיף לפחות שני מועדים עתידיים." />} />}
      <Dialog open={adding} onOpenChange={(o) => !o && !create.isPending && setAdding(false)} title="מועד ראיון קבוצתי חדש"
        footer={<><Button variant="primary" loading={create.isPending} onClick={() => create.mutate(undefined)}>שמירה</Button><Button onClick={() => setAdding(false)} disabled={create.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="תאריך" required error={errors.date}><Input type="date" min={todayStr()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="שעה" error={errors.startTime}><Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          </div>
          <Field label="רכז קבלה" hint="אם ריק: המשתמש המחובר"><Select value={f.coordinator} onChange={(e) => setF({ ...f, coordinator: e.target.value })}><option value="">בחירה</option>{(coords.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <p className="text-xs text-slate-500">שם הראיון נקבע אוטומטית לפי החודש והשנה (למשל נובמבר 2026).</p>
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>
    </Card>
  );
}

interface NewMemberRow { id: number; name: string; phone: string; joinDate: string; registered: number; present: number; level: 'NONE' | 'LOW' | 'OK' }
function NewMembersTab() {
  const q = useQuery({ queryKey: ['intake-new-members'], queryFn: () => api.get<NewMemberRow[]>('/intake/new-members') });
  const cols: Column<NewMemberRow>[] = [
    { key: 'n', header: 'שם', cell: (m) => <Link className="font-medium text-teal-700 hover:underline" to={`/members/${m.id}`}>{m.name}</Link> },
    { key: 'p', header: 'טלפון', cell: (m) => <Ltr>{m.phone}</Ltr> },
    { key: 'j', header: 'הצטרף', cell: (m) => fmtDate(m.joinDate) },
    { key: 'r', header: 'רשום לפעילויות', cell: (m) => m.registered },
    { key: 'a', header: 'הגיע בפועל', cell: (m) => m.present },
    { key: 'l', header: 'מצב', cell: (m) => (m.level === 'NONE' ? <Badge tone="red">לא השתתף כלל</Badge> : m.level === 'LOW' ? <Badge tone="amber">כמעט לא השתתף</Badge> : <Badge tone="green">משתתף</Badge>) },
  ];
  return (
    <Card>
      <p className="border-b border-slate-200 p-3 text-sm text-slate-600">חברים שהצטרפו בחודשיים האחרונים. מי שכמעט לא השתתף מודגש: כדאי ליצור איתו קשר ולשאול למה. (הדוח הדו-חודשי האוטומטי טרם הוגדר סופית באפיון.)</p>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="מעקב חברים חדשים" columns={cols} rows={q.data ?? []} rowKey={(m) => m.id} empty={<EmptyState title="אין חברים שהצטרפו בחודשיים האחרונים" />} />}
    </Card>
  );
}

function SettingsTab() {
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['intake-settings'], queryFn: () => api.get<Record<string, string>>('/intake/settings') });
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => api.put('/intake/settings', f), { success: 'ההגדרות נשמרו', silentCodes: ['VALIDATION'], onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }), onSuccess: () => setErrors({}) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const v = f ?? q.data!;
  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <InlineAlert tone="blue"><span className="block">גילאי הקבלה אינם מוגדרים באפיון, ולכן הוגדרו ערכי ברירת מחדל. יש לעדכן לפי הצורך. הקוד והקישור נכנסים להודעת הקבלה.</span></InlineAlert>
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.keys(settingLabel).map((k) => (
          <Field key={k} label={settingLabel[k]} error={errors[k]}>
            <Input value={v[k] ?? ''} disabled={readOnly} onChange={(e) => setF({ ...v, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
      <Button variant="primary" disabled={readOnly || !f} loading={save.isPending} onClick={() => save.mutate(undefined)}>שמירה</Button>
    </Card>
  );
}

export default function IntakePage() {
  const [tab, setTab] = useState('candidates');
  const [status, setStatus] = useState('');
  const summary = useQuery({ queryKey: ['intake-summary'], queryFn: () => api.get<IntakeSummary>('/intake/summary') });
  const tabs = [{ value: 'candidates', label: 'מועמדים' }, { value: 'sessions', label: 'ראיונות קבוצתיים' }, { value: 'new', label: 'מעקב חברים חדשים' }, { value: 'settings', label: 'הגדרות קבלה' }];
  return (
    <>
      <PageHeader
        title="קבלת חברים חדשים"
        subtitle="בקשות הצטרפות מהאתר, סינון, ראיונות קבוצתיים, שאלון היכרות וקבלה"
        breadcrumbs={[{ label: 'קבלת חברים' }]}
        actions={<Button onClick={() => window.open('/join', '_blank')}>פתח את טופס ההצטרפות לדוגמה</Button>}
      />
      {summary.data && <SummaryCards s={summary.data} active={status} onPick={(s) => { setStatus(s); setTab('candidates'); }} />}
      {summary.data && <div className="mb-4"><Alerts a={summary.data.alerts} /></div>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="candidates"><CandidatesTab status={status} setStatus={setStatus} /></TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
        <TabsContent value="new"><NewMembersTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </>
  );
}
