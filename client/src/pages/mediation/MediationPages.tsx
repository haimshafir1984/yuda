import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MemberPicker, { PickedMember } from '../../components/MemberPicker';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Checkbox, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useEditState } from '../../lib/auth';
import { fmtDate, mediationContactLabel, parentLabel, todayStr, withWhomLabel } from '../../lib/format';
import type { Mediation, MediationContact } from '../../lib/types';

const useMediators = () => useQuery({ queryKey: ['service-meta'], queryFn: () => api.get<{ staff: string[] }>('/service-meta') });

export function MediationList() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { readOnly } = useEditState();
  const staff = useMediators();
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['mediations', status], queryFn: () => api.get<Mediation[]>('/mediations', { status }) });

  const preset = Number(params.get('new')) || null;
  const [creating, setCreating] = useState(!!preset);
  const [member, setMember] = useState<PickedMember | null>(null);
  const [f, setF] = useState({ mediator: '', mediator2: '', parents: ['FATHER', 'MOTHER'] as string[], parentsOther: '', initiatedBy: 'MEMBER', need: '', goal: '', startDate: todayStr() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const close = () => { setCreating(false); setParams({}, { replace: true }); };
  const create = useAction(() => api.post<Mediation>('/mediations', { ...f, memberId: member?.id }), {
    success: 'כרטיס הגישור נפתח', silentCodes: ['VALIDATION', 'MEDIATION_EXISTS'],
    onSuccess: (m) => { close(); nav(`/mediations/${m.id}`); },
    onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!member) e.memberId = 'יש לבחור חבר';
    if (!f.mediator) e.mediator = 'יש לבחור מגשר';
    if (!f.parents.length) e.parents = 'יש לבחור לפחות הורה אחד';
    if (f.parents.includes('OTHER') && !f.parentsOther.trim()) e.parentsOther = 'יש לפרט מי נוסף משתתף';
    setErrors(e);
    if (!Object.keys(e).length) create.mutate(undefined);
  };

  const cols: Column<Mediation>[] = [
    { key: 'id', header: 'מזהה', cell: (m) => `#${m.id}` },
    { key: 'n', header: 'החבר', cell: (m) => <Link to={`/members/${m.memberId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-teal-700 hover:underline">{m.memberName}</Link> },
    { key: 'm', header: 'מגשר', cell: (m) => m.mediator + (m.mediator2 ? `, ${m.mediator2}` : '') },
    { key: 'p', header: 'הורים משתתפים', cell: (m) => m.parents.map((p) => parentLabel[p]).join(', ') },
    { key: 'sd', header: 'התחלה', cell: (m) => fmtDate(m.startDate) },
    { key: 's', header: 'סטטוס', cell: (m) => <Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status === 'ACTIVE' ? 'פעיל' : 'הסתיים'}</Badge> },
    { key: 'c', header: 'מגעים', cell: (m) => m.contactCount ?? 0 },
  ];
  return (
    <>
      <PageHeader title="גישור משפחתי" subtitle="גישור מול בני משפחה (הורים)" breadcrumbs={[{ label: 'גישור משפחתי' }]}
        actions={<Button variant="primary" disabled={readOnly} onClick={() => { setErrors({}); setCreating(true); }}><Plus className="size-4" aria-hidden /> כרטיס גישור חדש</Button>} />
      <Card>
        <div className="flex gap-3 border-b border-slate-200 p-3">
          <Select aria-label="סינון לפי סטטוס" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option><option value="ACTIVE">פעיל</option><option value="FINISHED">הסתיים</option>
          </Select>
        </div>
        {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="כרטיסי גישור" columns={cols} rows={q.data ?? []} rowKey={(m) => m.id} onRowClick={(m) => nav(`/mediations/${m.id}`)} empty={<EmptyState title="אין כרטיסי גישור" />} />}
      </Card>

      <Dialog open={creating} onOpenChange={(o) => !o && !create.isPending && close()} title="כרטיס גישור חדש" wide
        footer={<><Button variant="primary" loading={create.isPending} onClick={submit}>פתח כרטיס</Button><Button onClick={close} disabled={create.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <MemberPicker value={member} onChange={setMember} presetId={preset} error={errors.memberId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="המגשר" required error={errors.mediator}><Select value={f.mediator} onChange={(e) => setF({ ...f, mediator: e.target.value })}><option value="">בחירה</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
            <Field label="מגשר נוסף (אפשר שניים)"><Select value={f.mediator2} onChange={(e) => setF({ ...f, mediator2: e.target.value })}><option value="">ללא</option>{(staff.data?.staff ?? []).filter((s) => s !== f.mediator).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">ההורים המשתתפים בגישור <span className="text-red-600" aria-hidden>*</span></legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {Object.entries(parentLabel).map(([k, l]) => <Checkbox key={k} label={l} checked={f.parents.includes(k)} onChange={(c) => setF({ ...f, parents: c ? [...f.parents, k] : f.parents.filter((x) => x !== k) })} />)}
            </div>
            {errors.parents && <p role="alert" className="mt-1 text-xs text-red-700">{errors.parents}</p>}
          </fieldset>
          {f.parents.includes('OTHER') && <Field label="פירוט (אחר)" required error={errors.parentsOther}><Input value={f.parentsOther} onChange={(e) => setF({ ...f, parentsOther: e.target.value })} /></Field>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="הגישור מתחיל בעקבות"><Select value={f.initiatedBy} onChange={(e) => setF({ ...f, initiatedBy: e.target.value })}><option value="MEMBER">יוזמה של חבר</option><option value="STAFF">יוזמה של צוות החצר</option></Select></Field>
            <Field label="תאריך פתיחה"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          </div>
          <Field label="תיאור הצורך בגישור"><Textarea className="min-h-20" value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} /></Field>
          <Field label="יעד הגישור"><Textarea className="min-h-16" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} /></Field>
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>
    </>
  );
}

export function MediationCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['mediation', id], queryFn: () => api.get<Mediation>(`/mediations/${id}`) });
  const [adding, setAdding] = useState<string | null>(null);
  const blank = { date: todayStr(), withWhom: 'MEMBER', summary: '', place: '', effect: '' };
  const [c, setC] = useState(blank);
  const [cErr, setCErr] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [fin, setFin] = useState({ endDate: todayStr(), goalAchieved: 'yes', endSummary: '' });

  const addContact = useAction(() => api.post(`/mediations/${id}/contacts`, { kind: adding, ...c, withWhom: adding === 'EXTERNAL_PARENTS_MEETING' || adding === 'MEETING' || adding === 'FUTURE_MEETING' ? null : c.withWhom }), {
    success: 'התיעוד נוסף', onSuccess: () => { setAdding(null); setC(blank); },
  });
  const finish = useAction(() => api.post(`/mediations/${id}/finish`, { endDate: fin.endDate, goalAchieved: fin.goalAchieved === 'yes', endSummary: fin.endSummary }), { success: 'הגישור הסתיים', onSuccess: () => setFinishing(false) });
  const reopen = useAction(() => api.post(`/mediations/${id}/reopen`), { success: 'הגישור נפתח מחדש' });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error('כרטיס הגישור לא נמצא')} onRetry={() => q.refetch()} />;
  const m = q.data;
  const finished = m.status === 'FINISHED';
  const byKind = (kinds: string[]) => m.contacts.filter((x) => kinds.includes(x.kind));
  const cols = (kind: 'call' | 'meeting' | 'external'): Column<MediationContact>[] => [
    { key: 'd', header: 'תאריך', cell: (x) => fmtDate(x.date) },
    ...(kind === 'call' ? [{ key: 'w', header: 'עם מי', cell: (x: MediationContact) => (x.withWhom ? withWhomLabel[x.withWhom] : '—') }] : []),
    ...(kind === 'meeting' ? [{ key: 'k', header: 'סוג', cell: (x: MediationContact) => <Badge tone={x.kind === 'FUTURE_MEETING' ? 'blue' : 'gray'}>{mediationContactLabel[x.kind]}</Badge> }] : []),
    ...(kind === 'external' ? [{ key: 'p', header: 'מקום', cell: (x: MediationContact) => x.place ?? '—' }, { key: 'e', header: 'איך השפיעה ההשתתפות', cell: (x: MediationContact) => x.effect ?? '—' }] : []),
    { key: 's', header: 'סיכום', cell: (x) => <span className="whitespace-pre-line">{x.summary ?? '—'}</span> },
  ];
  const addBtn = (kind: string, label: string) => <Button variant="primary" size="sm" disabled={readOnly || finished} onClick={() => { setCErr(''); setC(blank); setAdding(kind); }}><Plus className="size-4" aria-hidden /> {label}</Button>;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'גישור משפחתי', to: '/mediations' }, { label: `גישור #${m.id}` }]}
        title={<>גישור משפחתי #{m.id}: <Link className="text-teal-700 hover:underline" to={`/members/${m.memberId}`}>{m.memberName}</Link></>}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><Badge tone={finished ? 'gray' : 'green'}>{finished ? 'הסתיים' : 'פעיל'}</Badge><span>מגשר: {m.mediator}{m.mediator2 ? `, ${m.mediator2}` : ''}</span><span>הורים: {m.parents.map((p) => (p === 'OTHER' && m.parentsOther ? m.parentsOther : parentLabel[p])).join(', ')}</span><span>{m.initiatedBy === 'MEMBER' ? 'ביוזמת החבר' : 'ביוזמת צוות החצר'}</span></span>}
        actions={<>
          {!finished && <Button variant="danger" disabled={readOnly} onClick={() => setFinishing(true)}>סיום הגישור</Button>}
          {finished && <Button disabled={readOnly} loading={reopen.isPending} onClick={() => reopen.mutate(undefined)}>פתח מחדש</Button>}
          <Button onClick={() => nav('/mediations')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button>
        </>}
      />
      <ReadOnlyBanner />
      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <div><p className="text-xs font-medium text-slate-500">תיאור הצורך בגישור</p><p className="mt-0.5 whitespace-pre-line text-sm">{m.need ?? '—'}</p></div>
          <div><p className="text-xs font-medium text-slate-500">יעד הגישור</p><p className="mt-0.5 whitespace-pre-line text-sm">{m.goal ?? '—'}</p></div>
          {finished && <InlineAlert tone={m.goalAchieved ? 'green' : 'amber'}><span className="block">הגישור הסתיים ב-{fmtDate(m.endDate)}. היעד {m.goalAchieved ? 'הושג' : 'לא הושג'}.{m.endSummary ? ` ${m.endSummary}` : ''}</span></InlineAlert>}
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 p-3"><h2 className="font-semibold text-slate-900">שיחות טלפון</h2>{addBtn('CALL', 'הוסף שיחה')}</div>
          <DataTable caption="שיחות טלפון" columns={cols('call')} rows={byKind(['CALL'])} rowKey={(x) => x.id} empty={<EmptyState title="אין שיחות" />} />
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3"><h2 className="font-semibold text-slate-900">פגישות</h2><span className="flex gap-2">{addBtn('MEETING', 'פגישה שהתקיימה')}{addBtn('FUTURE_MEETING', 'פגישה עתידית')}</span></div>
          <DataTable caption="פגישות" columns={cols('meeting')} rows={byKind(['MEETING', 'FUTURE_MEETING'])} rowKey={(x) => x.id} empty={<EmptyState title="אין פגישות" text="פגישות עתידיות שנקבעו אפשר לתעד כאן (לא חובה)." />} />
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 p-3"><h2 className="font-semibold text-slate-900">השתתפות במפגש הורים חיצוני</h2>{addBtn('EXTERNAL_PARENTS_MEETING', 'הוסף השתתפות')}</div>
          <DataTable caption="מפגשי הורים חיצוניים" columns={cols('external')} rows={byKind(['EXTERNAL_PARENTS_MEETING'])} rowKey={(x) => x.id} empty={<EmptyState title="אין השתתפות במפגשי הורים" text="מפגשים שאינם מתקיימים אצלנו, מעין קבוצה טיפולית. מתועדת רק ההשתתפות." />} />
        </Card>
      </div>

      <Dialog open={!!adding} onOpenChange={(o) => !o && !addContact.isPending && setAdding(null)} title={adding ? mediationContactLabel[adding] : ''}
        footer={<><Button variant="primary" loading={addContact.isPending} onClick={() => (c.date ? addContact.mutate(undefined) : setCErr('יש לבחור תאריך'))}>שמירה</Button><Button onClick={() => setAdding(null)} disabled={addContact.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="תאריך" required error={cErr}><Input type="date" className="max-w-56" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} /></Field>
          {adding === 'CALL' && <Field label="עם מי"><Select value={c.withWhom} onChange={(e) => setC({ ...c, withWhom: e.target.value })}>{Object.entries(withWhomLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>}
          {adding === 'EXTERNAL_PARENTS_MEETING' && <>
            <Field label="מקום"><Input value={c.place} onChange={(e) => setC({ ...c, place: e.target.value })} /></Field>
            <Field label="איך השפיעה ההשתתפות במפגש" hint="המגשר כותב"><Textarea className="min-h-16" value={c.effect} onChange={(e) => setC({ ...c, effect: e.target.value })} /></Field>
          </>}
          <Field label="סיכום"><Textarea className="min-h-20" value={c.summary} onChange={(e) => setC({ ...c, summary: e.target.value })} /></Field>
        </div>
      </Dialog>
      <Dialog open={finishing} onOpenChange={(o) => !o && !finish.isPending && setFinishing(false)} title="סיום הגישור"
        footer={<><Button variant="primary" loading={finish.isPending} onClick={() => finish.mutate(undefined)}>סיים גישור</Button><Button onClick={() => setFinishing(false)} disabled={finish.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="תאריך סיום"><Input type="date" className="max-w-56" value={fin.endDate} onChange={(e) => setFin({ ...fin, endDate: e.target.value })} /></Field>
          <Field label="האם היעד הושג?"><Select value={fin.goalAchieved} onChange={(e) => setFin({ ...fin, goalAchieved: e.target.value })}><option value="yes">כן</option><option value="no">לא</option></Select></Field>
          <Field label="תיאור חופשי"><Textarea className="min-h-20" value={fin.endSummary} onChange={(e) => setFin({ ...fin, endSummary: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
