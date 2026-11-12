import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Column, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Ltr, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useEditState } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { InterviewSessionFull, candidateStatusLabel, candidateStatusTone, signupDecisionLabel } from '../../lib/intake';

type Row = InterviewSessionFull['signupsList'][number];

/** ראיון קבוצתי: נוכחות, שליחת שאלון היכרות והחלטה לכל נרשם */
export default function SessionPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['intake-session', id], queryFn: () => api.get<InterviewSessionFull>(`/intake/sessions/${id}`) });
  const [deciding, setDeciding] = useState<{ row: Row; decision: 'NO_SHOW' | 'REJECT' | 'ACCEPT' | 'PERSONAL' } | null>(null);
  const [slots, setSlots] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  const attendance = useAction((v: { row: Row; attended: boolean }) => api.post(`/intake/signups/${v.row.id}/attendance`, { attended: v.attended }));
  const sendQ = useAction(() => api.post<{ sent: number }>(`/intake/sessions/${id}/send-questionnaires`), { success: (r) => (r.sent ? `נשלחו ${r.sent} שאלוני היכרות` : 'אין למי לשלוח: יש לסמן קודם מי הגיע') });
  const decide = useAction(() => api.post(`/intake/signups/${deciding!.row.id}/decision`, { decision: deciding!.decision, slots: slots.filter(Boolean) }), {
    success: 'ההחלטה נרשמה', silentCodes: ['VALIDATION'], onSuccess: () => { setDeciding(null); setError(''); },
    onError: (e: ApiError) => setError(e.code === 'VALIDATION' ? e.fields.slots ?? e.message : e.message),
  });
  const del = useAction(() => api.del(`/intake/sessions/${id}`), { success: 'הראיון נמחק', onSuccess: () => nav('/intake') });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error('הראיון לא נמצא')} onRetry={() => q.refetch()} />;
  const s = q.data;

  const cols: Column<Row>[] = [
    { key: 'n', header: 'שם', cell: (r) => <Link className="font-medium text-teal-700 hover:underline" to={`/intake/candidates/${r.candidateId}`}>{r.candidateName}</Link> },
    { key: 'a', header: 'גיל', cell: (r) => r.age ?? '—' },
    { key: 'p', header: 'טלפון', cell: (r) => <Ltr>{r.phone}</Ltr> },
    { key: 's', header: 'סטטוס', cell: (r) => <Badge tone={candidateStatusTone(r.candidateStatus)}>{candidateStatusLabel[r.candidateStatus]}</Badge> },
    {
      key: 'at', header: 'נוכחות',
      cell: (r) => (
        <span className="flex gap-1">
          <Button size="sm" variant={r.attended === true ? 'primary' : 'secondary'} aria-pressed={r.attended === true} disabled={readOnly || !!r.decision} onClick={() => attendance.mutate({ row: r, attended: true })}>הגיע</Button>
          <Button size="sm" variant={r.attended === false ? 'danger' : 'secondary'} aria-pressed={r.attended === false} disabled={readOnly || !!r.decision} onClick={() => attendance.mutate({ row: r, attended: false })}>לא הגיע</Button>
        </span>
      ),
    },
    { key: 'q', header: 'שאלון', cell: (r) => (r.questionnaireFilled ? <Badge tone="green">מולא</Badge> : r.questionnaireSent ? <Badge tone="amber">נשלח</Badge> : '—') },
    {
      key: 'd', header: 'החלטה',
      cell: (r) => r.decision ? <Badge>{signupDecisionLabel[r.decision]}</Badge> : r.candidateStatus !== 'INVITED_GROUP' ? '—' : (
        <span className="flex flex-wrap gap-1">
          <Button size="sm" variant="primary" disabled={readOnly} onClick={() => { setError(''); setDeciding({ row: r, decision: 'ACCEPT' }); }}>קבלה</Button>
          <Button size="sm" disabled={readOnly} onClick={() => { setError(''); setSlots(['', '', '']); setDeciding({ row: r, decision: 'PERSONAL' }); }}>פגישה אישית</Button>
          <Button size="sm" variant="danger" disabled={readOnly} onClick={() => { setError(''); setDeciding({ row: r, decision: 'REJECT' }); }}>דחייה</Button>
          <Button size="sm" disabled={readOnly} onClick={() => { setError(''); setDeciding({ row: r, decision: 'NO_SHOW' }); }}>לא הגיע</Button>
        </span>
      ),
    },
  ];
  const label = deciding && ({ ACCEPT: 'קבלה: ייווצר כרטיס חבר ותישלח הודעת קבלה.', REJECT: 'דחייה: תישלח הודעת דחייה קבועה.', NO_SHOW: 'לא הגיע: הכרטיס יעבור ל"באוויר".', PERSONAL: 'הזמנה לפגישה אישית: המועמד יקבל מועדים לבחירה.' })[deciding.decision];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'קבלת חברים', to: '/intake' }, { label: `ראיון ${s.name}` }]}
        title={`ראיון קבוצתי: ${s.name}`}
        subtitle={<span className="flex flex-wrap items-center gap-x-3"><span>{fmtDate(s.date)} {s.startTime}</span><span>רכז: {s.coordinator ?? '—'}</span><span>{s.signups} נרשמו, {s.attended} הגיעו</span></span>}
        actions={
          <>
            <Button variant="primary" disabled={readOnly} loading={sendQ.isPending} onClick={() => sendQ.mutate(undefined)}><Send className="size-4" aria-hidden /> שלח שאלון היכרות למשתתפים</Button>
            {!s.signups && <Button variant="danger" disabled={readOnly} onClick={() => setRemoving(true)}>מחק ראיון</Button>}
            <Button onClick={() => nav('/intake')}><ArrowRight className="size-4" aria-hidden /> חזרה</Button>
          </>
        }
      />
      <ReadOnlyBanner />
      <Card>
        <p className="border-b border-slate-200 p-3 text-sm text-slate-600">יש לסמן נוכחות לפני שליחת השאלון, כדי לא לשלוח למי שנרשם ולא הגיע. אחרי הראיון מסמנים החלטה לכל נרשם.</p>
        <DataTable caption="נרשמים לראיון" columns={cols} rows={s.signupsList} rowKey={(r) => r.id} empty={<EmptyState title="אין נרשמים עדיין" text="מועמדים משתבצים דרך הקישור שבהזמנה." />} />
      </Card>

      <Dialog open={!!deciding} onOpenChange={(o) => !o && !decide.isPending && setDeciding(null)} title={deciding ? `החלטה: ${deciding.row.candidateName}` : ''}
        footer={<><Button variant="primary" loading={decide.isPending} onClick={() => decide.mutate(undefined)}>אישור</Button><Button onClick={() => setDeciding(null)} disabled={decide.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-700">{label}</p>
          {deciding?.decision === 'PERSONAL' && slots.map((v, i) => <Field key={i} label={`מועד ${i + 1}${i === 0 ? ' *' : ''}`}><Input type="datetime-local" value={v} onChange={(e) => setSlots(slots.map((x, j) => (j === i ? e.target.value : x)))} /></Field>)}
          {error && <InlineAlert tone="red">{error}</InlineAlert>}
        </div>
      </Dialog>
      <ConfirmDialog open={removing} onOpenChange={setRemoving} title="מחיקת ראיון" description="הראיון ללא נרשמים יימחק. פעולה זו אינה הפיכה." confirmLabel="מחק" loading={del.isPending} onConfirm={() => del.mutate(undefined)} />
    </>
  );
}
