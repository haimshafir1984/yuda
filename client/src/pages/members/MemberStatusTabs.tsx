import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Select, Spinner, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useCan, useEditState } from '../../lib/auth';
import { complaintStatusLabel, complaintStatusTone, fmtDate, fmtDateTime, isRemoved, memberStatusLabel, memberStatusTone, removalKindLabel, todayStr } from '../../lib/format';
import type { Complaint, Member, MemberNote, Mediation, Removal } from '../../lib/types';

/** סטטוס והרחקות בכרטיס החבר: הרחקה זמנית / על תנאי / לצמיתות, החזרה ידנית, והעברה ל"לא פעיל" */
export function StatusTab({ member }: { member: Member }) {
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['member-removals', member.id], queryFn: () => api.get<Removal[]>(`/members/${member.id}/removals`) });
  const [adding, setAdding] = useState(false);
  const [returning, setReturning] = useState<Removal | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const blank = { kind: 'TEMPORARY', date: todayStr(), reason: '', description: '', endDate: '', condition: '' };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const add = useAction(() => api.post(`/members/${member.id}/removals`, { ...f, endDate: f.kind === 'TEMPORARY' ? f.endDate : '', condition: f.kind === 'CONDITIONAL' ? f.condition : '' }), {
    success: 'ההרחקה נרשמה והחבר הוצא מהרשמה לפעילויות',
    silentCodes: ['VALIDATION'],
    onSuccess: () => { setAdding(false); setF(blank); setErrors({}); },
    onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }),
  });
  const back = useAction(() => api.post(`/members/${member.id}/removals/${returning!.id}/return`, { note: returnNote }), {
    success: 'החבר הוחזר מההרחקה', onSuccess: () => { setReturning(null); setReturnNote(''); },
  });
  const toggleInactive = useAction((status: 'ACTIVE' | 'INACTIVE') => api.patch(`/members/${member.id}/status`, { status }), { success: 'הסטטוס עודכן' });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const removed = isRemoved(member.status);

  const cols: Column<Removal>[] = [
    { key: 'k', header: 'סוג', cell: (r) => <Badge tone={r.kind === 'CONDITIONAL' ? 'amber' : 'red'}>{removalKindLabel[r.kind]}</Badge> },
    { key: 'd', header: 'תאריך', cell: (r) => fmtDate(r.date) },
    { key: 'r', header: 'סיבה', cell: (r) => <span><span className="font-medium">{r.reason}</span>{r.description ? <span className="block whitespace-pre-line text-xs text-slate-600">{r.description}</span> : null}</span> },
    { key: 'h', header: 'טיפל', cell: (r) => r.handledBy ?? '—' },
    { key: 'e', header: 'סיום / תנאי', cell: (r) => (r.kind === 'TEMPORARY' ? `עד ${fmtDate(r.endDate)}` : r.kind === 'CONDITIONAL' ? r.condition : '—') },
    { key: 'c', header: 'תלונה', cell: (r) => (r.complaintId ? <Link className="text-teal-700 hover:underline" to={`/complaints/${r.complaintId}`}>#{r.complaintId}</Link> : '—') },
    {
      key: 's', header: 'מצב',
      cell: (r) => (r.active ? (
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="red">בתוקף</Badge>
          {r.endDatePassed && <Badge tone="amber">תאריך הסיום עבר. החזרה ידנית בלבד</Badge>}
        </span>
      ) : <span className="text-xs text-slate-600">הוחזר {fmtDate(r.returnedAt)}{r.returnedBy ? ` על ידי ${r.returnedBy}` : ''}{r.returnNote ? `: ${r.returnNote}` : ''}</span>),
    },
    { key: 'a', header: 'פעולה', cell: (r) => (r.active ? <Button size="sm" disabled={readOnly} onClick={() => { setReturnNote(''); setReturning(r); }}>החזרה מהרחקה</Button> : null) },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            סטטוס נוכחי: <Badge tone={memberStatusTone(member.status)}>{memberStatusLabel[member.status] ?? member.status}</Badge>
            {removed && <span className="ms-2 text-xs text-slate-600">חבר מורחק אינו יכול להירשם לפעילויות.</span>}
          </p>
          <div className="flex gap-2">
            {!removed && member.status === 'ACTIVE' && <Button disabled={readOnly} loading={toggleInactive.isPending} onClick={() => toggleInactive.mutate('INACTIVE')}>העבר ללא פעיל</Button>}
            {!removed && member.status === 'INACTIVE' && <Button disabled={readOnly} loading={toggleInactive.isPending} onClick={() => toggleInactive.mutate('ACTIVE')}>החזר לפעיל</Button>}
            {!removed && <Button variant="danger" disabled={readOnly} onClick={() => { setErrors({}); setAdding(true); }}><Plus className="size-4" aria-hidden /> הרחק חבר</Button>}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">הסטטוס לא משתנה אוטומטית. גם כשעבר תאריך הסיום של הרחקה זמנית, החזרה נעשית ידנית ביוזמת החבר, לפי החלטת איש צוות.</p>
      </Card>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">היסטוריית הרחקות</h2>
        <DataTable caption="היסטוריית הרחקות" columns={cols} rows={q.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="אין הרחקות" text="החבר לא הורחק." />} />
      </Card>

      <Dialog open={adding} onOpenChange={(o) => !o && !add.isPending && setAdding(false)} title="הרחקת חבר" wide
        footer={<><Button variant="danger" loading={add.isPending} onClick={() => add.mutate(undefined)}>אישור הרחקה</Button><Button onClick={() => setAdding(false)} disabled={add.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="סוג הרחקה" required><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(removalKindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="תאריך ההרחקה" required error={errors.date}><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          {f.kind === 'TEMPORARY' && <Field label="תאריך סיום ההרחקה" required error={errors.endDate}><Input type="date" className="max-w-56" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>}
          {f.kind === 'CONDITIONAL' && <Field label="התנאי לחזרה" required error={errors.condition} hint="למשל: טיפול לפחות X זמן. החזרה תלויה בחבר."><Input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} /></Field>}
          <Field label="הסיבה" required error={errors.reason}><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <Field label="תיאור מהלך ההרחקה" error={errors.description}><Textarea className="min-h-24" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">איש הצוות שמטפל נרשם אוטומטית לפי המשתמש המחובר. החבר לא יוכל להירשם לפעילויות עד שיוחזר.</p>
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>
      <Dialog open={!!returning} onOpenChange={(o) => !o && !back.isPending && setReturning(null)} title="החזרה מהרחקה"
        footer={<><Button variant="primary" loading={back.isPending} onClick={() => back.mutate(undefined)}>החזר את החבר</Button><Button onClick={() => setReturning(null)} disabled={back.isPending}>ביטול</Button></>}>
        <Field label="הערה (למשל: פגישת חזרה, התחייבות)"><Textarea className="min-h-20" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}

/** הערות צוות כלליות בכרטיס החבר: עם תאריך ושם הכותב. נפרדות מהערות העו"סית (שירותים סוציאליים) */
export function StaffNotes({ memberId }: { memberId: number }) {
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['member-staff-notes', memberId], queryFn: () => api.get<MemberNote[]>(`/members/${memberId}/staff-notes`) });
  const [text, setText] = useState('');
  const add = useAction(() => api.post(`/members/${memberId}/staff-notes`, { text }), { success: 'ההערה נשמרה', onSuccess: () => setText('') });
  const cols: Column<MemberNote>[] = [
    { key: 'd', header: 'תאריך', cell: (n) => fmtDateTime(n.createdAt) },
    { key: 'a', header: 'נכתב על ידי', cell: (n) => n.author ?? '—' },
    { key: 't', header: 'הערה', cell: (n) => <span className="whitespace-pre-line">{n.text}</span> },
  ];
  return (
    <Card>
      <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">הערות צוות</h2>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3">
        <div className="min-w-64 flex-1"><Field label="הערה חדשה (רשות)"><Textarea className="min-h-16" value={text} onChange={(e) => setText(e.target.value)} disabled={readOnly} /></Field></div>
        <Button variant="primary" disabled={readOnly || !text.trim()} loading={add.isPending} onClick={() => add.mutate(undefined)}>הוסף הערה</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="הערות צוות" columns={cols} rows={q.data ?? []} rowKey={(n) => n.id} empty={<EmptyState title="אין הערות" text="ההערה מופיעה עם תאריך כתיבתה ושם איש הצוות שכתב אותה." />} />}
    </Card>
  );
}

/** טאב "דיווחים ותלונות": שדיווחו עליו, ושהוא דיווח */
export function ComplaintsTab({ member }: { member: Member }) {
  const nav = useNavigate();
  const canEdit = useCan('socialWork');
  const q = useQuery({ queryKey: ['member-complaints', member.id], queryFn: () => api.get<{ about: Complaint[]; by: Complaint[] }>(`/members/${member.id}/complaints`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const cols = (who: 'about' | 'by'): Column<Complaint>[] => [
    { key: 'id', header: 'מספר', cell: (c) => `#${c.id}` },
    { key: 'd', header: 'תאריך', cell: (c) => fmtDate(c.receivedAt) },
    { key: 'w', header: who === 'about' ? 'המתלונן' : 'על מי', cell: (c) => (who === 'about' ? c.complainantName ?? '—' : c.subjectName) },
    { key: 't', header: 'התלונה', cell: (c) => <span className="line-clamp-2 max-w-md">{c.text}</span> },
    { key: 's', header: 'סטטוס', cell: (c) => <Badge tone={complaintStatusTone(c.status)}>{complaintStatusLabel[c.status]}</Badge> },
    { key: 'o', header: 'פעולה', cell: (c) => <Button size="sm" onClick={(e) => { e.stopPropagation(); nav(`/complaints/${c.id}`); }}>פתח</Button> },
  ];
  const section = (title: string, rows: Complaint[], who: 'about' | 'by', button?: ReactNode) => (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3"><h2 className="font-semibold text-slate-900">{title} ({rows.length})</h2>{button}</div>
      <DataTable caption={title} columns={cols(who)} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => nav(`/complaints/${c.id}`)} empty={<EmptyState title="אין רשומות" />} />
    </Card>
  );
  return (
    <div className="space-y-4">
      {section('דיווחים ותלונות שדיווחו עליו', q.data!.about, 'about', canEdit ? <Button variant="primary" size="sm" onClick={() => nav(`/complaints?new=${member.id}`)}><Plus className="size-4" aria-hidden /> תלונה חדשה על החבר</Button> : undefined)}
      {section('דיווחים ותלונות שהוא דיווח', q.data!.by, 'by')}
    </div>
  );
}

/** גישור משפחתי בכרטיס החבר (תחת "שירותים סוציאליים") */
export function MediationSection({ member }: { member: Member }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['member-mediations', member.id], queryFn: () => api.get<Mediation[]>(`/members/${member.id}/mediations`) });
  const open = (m: Mediation) => nav(`/mediations/${m.id}`);
  const cols: Column<Mediation>[] = [
    { key: 'id', header: 'מזהה', cell: (m) => `#${m.id}` },
    { key: 'm', header: 'מגשר', cell: (m) => m.mediator + (m.mediator2 ? `, ${m.mediator2}` : '') },
    { key: 'sd', header: 'התחלה', cell: (m) => fmtDate(m.startDate) },
    { key: 's', header: 'סטטוס', cell: (m) => <Badge tone={m.status === 'ACTIVE' ? 'green' : 'gray'}>{m.status === 'ACTIVE' ? 'פעיל' : 'הסתיים'}</Badge> },
    { key: 'c', header: 'מגעים', cell: (m) => m.contactCount ?? m.contacts.length },
    { key: 'o', header: 'פעולה', cell: (m) => <Button size="sm" onClick={(e) => { e.stopPropagation(); open(m); }}>פתח כרטיס גישור</Button> },
  ];
  const hasActive = (q.data ?? []).some((m) => m.status === 'ACTIVE');
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">גישור משפחתי (מול ההורים)</h2>
        <Button variant="primary" size="sm" disabled={hasActive} title={hasActive ? 'לחבר כבר קיים כרטיס גישור פעיל' : undefined} onClick={() => nav(`/mediations?new=${member.id}`)}><Plus className="size-4" aria-hidden /> פתח כרטיס גישור</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="כרטיסי גישור" columns={cols} rows={q.data ?? []} rowKey={(m) => m.id} onRowClick={open} empty={<EmptyState title="אין כרטיסי גישור" />} />}
    </Card>
  );
}

