import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MemberPicker, { PickedMember } from '../../components/MemberPicker';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useEditState } from '../../lib/auth';
import { complaintActionLabel, complaintStatusLabel, complaintStatusTone, entryKindLabel, fmtDate, removalKindLabel, todayStr } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { Complaint, ComplaintFull } from '../../lib/types';
import { useStaff } from '../requests/RequestsList';

/** רשימת דיווחים ותלונות + יצירת תלונה חדשה (גם מכרטיס חבר: ?new=<מזהה חבר>) */
export function ComplaintsList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { readOnly } = useEditState();
  const staff = useStaff();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const query = useQuery({ queryKey: ['complaints', dq, status], queryFn: () => api.get<Complaint[]>('/complaints', { q: dq, status }) });

  const presetSubject = Number(params.get('new')) || null;
  const [creating, setCreating] = useState(!!presetSubject);
  const [subject, setSubject] = useState<PickedMember | null>(null);
  const [complainantType, setComplainantType] = useState<'STAFF' | 'MEMBER'>('STAFF');
  const [complainantName, setComplainantName] = useState('');
  const [complainant, setComplainant] = useState<PickedMember | null>(null);
  const [receivedAt, setReceivedAt] = useState(todayStr());
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const close = () => { setCreating(false); setParams({}, { replace: true }); };
  const create = useAction(
    () => api.post<ComplaintFull>('/complaints', { receivedAt, complainantType, complainantName: complainantType === 'STAFF' ? complainantName : null, complainantMemberId: complainantType === 'MEMBER' ? complainant?.id : null, subjectMemberId: subject?.id, text }),
    { success: 'התלונה נרשמה', silentCodes: ['VALIDATION'], onSuccess: (c) => { close(); nav(`/complaints/${c.id}`); }, onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }) },
  );
  const submit = () => {
    const e: Record<string, string> = {};
    if (!subject) e.subjectMemberId = 'יש לבחור על מי התלונה';
    if (complainantType === 'MEMBER' && !complainant) e.complainantMemberId = 'יש לבחור את החבר המתלונן';
    if (complainantType === 'STAFF' && !complainantName) e.complainantName = 'יש לבחור את איש הצוות';
    if (!text.trim()) e.text = 'יש לתאר את התלונה';
    setErrors(e);
    if (!Object.keys(e).length) create.mutate(undefined);
  };

  const cols: Column<Complaint>[] = [
    { key: 'id', header: 'מספר', cell: (c) => `#${c.id}` },
    { key: 'd', header: 'תאריך קבלה', cell: (c) => fmtDate(c.receivedAt) },
    { key: 'w', header: 'על מי', cell: (c) => <Link to={`/members/${c.subjectMemberId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-teal-700 hover:underline">{c.subjectName}</Link> },
    { key: 'c', header: 'המתלונן', cell: (c) => <span>{c.complainantName ?? '—'} <span className="text-xs text-slate-500">({c.complainantType === 'STAFF' ? 'איש צוות' : 'חבר'})</span></span> },
    { key: 't', header: 'התלונה', cell: (c) => <span className="line-clamp-2 max-w-md">{c.text}</span> },
    { key: 's', header: 'סטטוס', cell: (c) => <Badge tone={complaintStatusTone(c.status)}>{complaintStatusLabel[c.status]}</Badge> },
    { key: 'a', header: 'פעולה שננקטה', cell: (c) => (c.actionTaken ? complaintActionLabel[c.actionTaken] : '—') },
    { key: 'n', header: 'תיעוד', cell: (c) => c.entryCount ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="דיווחים ותלונות"
        subtitle="תלונות שהתקבלו מחוץ למערכת (פנים אל פנים, ווטסאפ) ומתועדות כאן ידנית"
        breadcrumbs={[{ label: 'דיווחים ותלונות' }]}
        actions={<Button variant="primary" disabled={readOnly} onClick={() => { setErrors({}); setCreating(true); }}><Plus className="size-4" aria-hidden /> תלונה חדשה</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש תלונה" placeholder="חיפוש לפי שם חבר או תוכן התלונה" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי סטטוס" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {Object.entries(complaintStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        {query.isLoading ? <Spinner /> : query.error ? <ErrorBlock error={query.error} onRetry={() => query.refetch()} /> : (
          <DataTable caption="דיווחים ותלונות" columns={cols} rows={query.data ?? []} rowKey={(c) => c.id} onRowClick={(c) => nav(`/complaints/${c.id}`)} empty={<EmptyState title="אין תלונות" text="לא נרשמו דיווחים או תלונות." />} />
        )}
      </Card>

      <Dialog open={creating} onOpenChange={(o) => !o && !create.isPending && close()} title="תלונה חדשה" wide
        footer={<><Button variant="primary" loading={create.isPending} onClick={submit}>שמירה</Button><Button onClick={close} disabled={create.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <MemberPicker value={subject} onChange={setSubject} presetId={presetSubject} error={errors.subjectMemberId} />
          <p className="-mt-2 text-xs text-slate-500">החבר שעליו מתלוננים.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="המתלונן"><Select value={complainantType} onChange={(e) => setComplainantType(e.target.value as 'STAFF' | 'MEMBER')}><option value="STAFF">איש צוות</option><option value="MEMBER">חבר</option></Select></Field>
            <Field label="תאריך קבלת התלונה" hint="אפשר להזין תאריך מהעבר"><Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
          </div>
          {complainantType === 'STAFF' ? (
            <Field label="איש הצוות המתלונן" required error={errors.complainantName}>
              <Select value={complainantName} onChange={(e) => setComplainantName(e.target.value)}><option value="">בחירה</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
          ) : (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">החבר המתלונן</p>
              <MemberPicker value={complainant} onChange={setComplainant} error={errors.complainantMemberId} />
            </div>
          )}
          <Field label="התלונה" required error={errors.text}><Textarea className="min-h-28" value={text} onChange={(e) => setText(e.target.value)} /></Field>
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>
    </>
  );
}

/** כרטיס תלונה: פרטים, תלונות קודמות על אותו חבר, תיעוד הטיפול, סטטוס ידני ופעולה שננקטה */
export function ComplaintCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['complaint', id], queryFn: () => api.get<ComplaintFull>(`/complaints/${id}`) });
  const [entry, setEntry] = useState({ kind: 'MEETING', date: todayStr(), text: '' });
  const [entryError, setEntryError] = useState('');
  const [action, setAction] = useState({ action: 'NONE', note: '', reason: '', endDate: '', condition: '' });
  const [actionOpen, setActionOpen] = useState(false);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const setStatus = useAction((status: string) => api.post(`/complaints/${id}/status`, { status }), { success: 'הסטטוס עודכן' });
  const addEntry = useAction(() => api.post(`/complaints/${id}/entries`, entry), { success: 'התיעוד נוסף', onSuccess: () => setEntry({ ...entry, text: '' }) });
  const saveAction = useAction(
    () => api.post(`/complaints/${id}/action`, { action: action.action, note: action.note, removal: action.action.startsWith('REMOVAL') ? { reason: action.reason || undefined, endDate: action.endDate, condition: action.condition } : undefined }),
    { success: 'הפעולה נרשמה', silentCodes: ['VALIDATION'], onSuccess: () => setActionOpen(false), onError: (e: ApiError) => setActionErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }) },
  );

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error('התלונה לא נמצאה')} onRetry={() => q.refetch()} />;
  const c = q.data;
  const handled = c.status === 'HANDLED';
  const prevCols: Column<Complaint>[] = [
    { key: 'id', header: 'מספר', cell: (p) => `#${p.id}` },
    { key: 'd', header: 'תאריך', cell: (p) => fmtDate(p.receivedAt) },
    { key: 'w', header: 'המתלונן', cell: (p) => p.complainantName ?? '—' },
    { key: 't', header: 'התלונה', cell: (p) => <span className="line-clamp-2 max-w-md">{p.text}</span> },
    { key: 's', header: 'סטטוס', cell: (p) => <Badge tone={complaintStatusTone(p.status)}>{complaintStatusLabel[p.status]}</Badge> },
    { key: 'a', header: 'פעולה', cell: (p) => <Button size="sm" onClick={() => nav(`/complaints/${p.id}`)}>פתח</Button> },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'דיווחים ותלונות', to: '/complaints' }, { label: `תלונה #${c.id}` }]}
        title={<>תלונה #{c.id} על <Link className="text-teal-700 hover:underline" to={`/members/${c.subjectMemberId}`}>{c.subjectName}</Link></>}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><Badge tone={complaintStatusTone(c.status)}>{complaintStatusLabel[c.status]}</Badge><span>התקבלה {fmtDate(c.receivedAt)}</span><span>נרשמה על ידי {c.createdBy ?? '—'}</span></span>}
        actions={
          <>
            {c.status === 'NEW' && <Button disabled={readOnly} loading={setStatus.isPending} onClick={() => setStatus.mutate('IN_PROGRESS')}>העבר לבטיפול</Button>}
            {c.status === 'IN_PROGRESS' && <Button variant="primary" disabled={readOnly} loading={setStatus.isPending} onClick={() => setStatus.mutate('HANDLED')}>סמן כטופלה</Button>}
            {handled && <Button disabled={readOnly} loading={setStatus.isPending} onClick={() => setStatus.mutate('IN_PROGRESS')}>החזר לטיפול</Button>}
            <Button onClick={() => nav('/complaints')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button>
          </>
        }
      />
      <ReadOnlyBanner />
      <div className="space-y-4">
        {c.repeat && (
          <InlineAlert tone="amber">
            <span className="block">זוהתה תלונה חוזרת: קיימות {c.previous.length} תלונות קודמות על {c.subjectName}. הן מוצגות למטה.</span>
          </InlineAlert>
        )}
        <Card className="space-y-3 p-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs font-medium text-slate-500">המתלונן</dt><dd className="mt-0.5 text-sm">{c.complainantName ?? '—'} ({c.complainantType === 'STAFF' ? 'איש צוות' : 'חבר'})</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">פעולה שננקטה</dt><dd className="mt-0.5 text-sm">{c.actionTaken ? complaintActionLabel[c.actionTaken] : 'טרם נקבעה'}{c.actionNote ? ` · ${c.actionNote}` : ''}</dd></div>
          </dl>
          <div><p className="text-xs font-medium text-slate-500">התלונה</p><p className="mt-0.5 whitespace-pre-line text-sm text-slate-900">{c.text}</p></div>
          {c.removals.map((r) => <p key={r.id} className="text-sm text-slate-700">נרשמה {removalKindLabel[r.kind]} בכרטיס החבר ({fmtDate(r.date)}).</p>)}
          <Button disabled={readOnly} onClick={() => { setActionErrors({}); setAction({ action: c.actionTaken ?? 'NONE', note: c.actionNote ?? '', reason: '', endDate: '', condition: '' }); setActionOpen(true); }}>עדכון הפעולה שננקטה</Button>
        </Card>

        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">תיעוד הטיפול ({c.entries.length})</h2>
          <div className="space-y-3 border-b border-slate-200 p-3">
            {handled ? (
              <p className="text-sm text-slate-600">התלונה סומנה כמטופלת. כדי להוסיף תיעוד יש להחזיר אותה לסטטוס &quot;בטיפול&quot;.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="סוג"><Select value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>{Object.entries(entryKindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                  <Field label="תאריך"><Input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></Field>
                </div>
                <Field label="מה נעשה" error={entryError}><Textarea className="min-h-20" value={entry.text} onChange={(e) => { setEntry({ ...entry, text: e.target.value }); setEntryError(''); }} /></Field>
                <Button variant="primary" disabled={readOnly} loading={addEntry.isPending} onClick={() => (entry.text.trim() ? addEntry.mutate(undefined) : setEntryError('יש להזין תיאור'))}><Plus className="size-4" aria-hidden /> הוסף תיעוד</Button>
              </>
            )}
          </div>
          <DataTable caption="תיעוד הטיפול" columns={[
            { key: 'd', header: 'תאריך', cell: (e) => fmtDate(e.date) },
            { key: 'k', header: 'סוג', cell: (e) => <Badge>{entryKindLabel[e.kind]}</Badge> },
            { key: 't', header: 'תיאור', cell: (e) => <span className="whitespace-pre-line">{e.text}</span> },
            { key: 'a', header: 'נכתב על ידי', cell: (e) => e.author ?? '—' },
          ]} rows={c.entries} rowKey={(e) => e.id} empty={<EmptyState title="אין תיעוד" text="אפשר לתעד פגישה, שיחה והודעות." />} />
        </Card>

        {c.previous.length > 0 && (
          <Card>
            <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">תלונות קודמות על החבר ({c.previous.length})</h2>
            <DataTable caption="תלונות קודמות" columns={prevCols} rows={c.previous} rowKey={(p) => p.id} onRowClick={(p) => nav(`/complaints/${p.id}`)} empty={null} />
          </Card>
        )}
      </div>

      <Dialog open={actionOpen} onOpenChange={(o) => !o && !saveAction.isPending && setActionOpen(false)} title="הפעולה שננקטה בעקבות התלונה" wide
        footer={<><Button variant="primary" loading={saveAction.isPending} onClick={() => saveAction.mutate(undefined)}>שמירה</Button><Button onClick={() => setActionOpen(false)} disabled={saveAction.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="פעולה"><Select value={action.action} onChange={(e) => setAction({ ...action, action: e.target.value })}>{Object.entries(complaintActionLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {action.action.startsWith('REMOVAL') && (
            <>
              <InlineAlert tone="amber"><span className="block">הרחקה תירשם בכרטיס החבר ותשנה את הסטטוס שלו, והוא לא יוכל להירשם לפעילויות.</span></InlineAlert>
              <Field label="סיבת ההרחקה" hint="אם ריק: ייכתב &quot;בעקבות תלונה&quot;"><Input value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} /></Field>
              {action.action === 'REMOVAL_TEMPORARY' && <Field label="תאריך סיום ההרחקה" required error={actionErrors.endDate}><Input type="date" className="max-w-56" value={action.endDate} onChange={(e) => setAction({ ...action, endDate: e.target.value })} /></Field>}
              {action.action === 'REMOVAL_CONDITIONAL' && <Field label="התנאי לחזרה" required error={actionErrors.condition}><Input value={action.condition} onChange={(e) => setAction({ ...action, condition: e.target.value })} /></Field>}
            </>
          )}
          <Field label="הערה"><Textarea className="min-h-16" value={action.note} onChange={(e) => setAction({ ...action, note: e.target.value })} /></Field>
          {actionErrors._ && <InlineAlert tone="red">{actionErrors._}</InlineAlert>}
        </div>
      </Dialog>
    </>
  );
}
