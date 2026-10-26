import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import {
  Badge, Button, Card, Checkbox, Column, ConfirmDialog, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Ltr, Select, Spinner,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fmtDate, fmtDateTime, fmtTimeRange } from '../../lib/format';
import QuestionInput, { AnswerValue, QuestionDef, isMissing, toAnswerInput } from '../../components/QuestionInput';
import { questionTypeLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { AnswerInput, AttendanceStatus, MemberRow, Paged, Question, RegistrantRow, RegistrationDetails, SessionAttendance, SessionRow, Workshop } from '../../lib/types';

// ======================= שאלות הרשמה =======================

interface QForm { id?: number; text: string; type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE'; required: boolean; options: { id?: number; label: string }[]; answerCount: number }
const emptyQ = (): QForm => ({ text: '', type: 'TEXT', required: false, options: [{ label: '' }, { label: '' }], answerCount: 0 });

export function QuestionsTab({ workshop }: { workshop: Workshop }) {
  const q = useQuery({ queryKey: ['questions', workshop.id], queryFn: () => api.get<Question[]>(`/workshops/${workshop.id}/questions`) });
  const [form, setForm] = useState<QForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Question | null>(null);

  const saveQ = useAction(
    (f: QForm) => {
      const body = { text: f.text, type: f.type, required: f.required, options: f.type !== 'TEXT' ? f.options : [] };
      return f.id ? api.put(`/questions/${f.id}`, body) : api.post(`/workshops/${workshop.id}/questions`, body);
    },
    {
      success: 'השאלה נשמרה',
      silentCodes: ['VALIDATION'],
      onSuccess: () => setForm(null),
      onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
    },
  );
  const del = useAction((qq: Question) => api.del(`/questions/${qq.id}`), { success: 'השאלה נמחקה', onSuccess: () => setDeleting(null), onError: () => setDeleting(null) });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const submit = () => {
    if (!form) return;
    const e: Record<string, string> = {};
    if (!form.text.trim()) e.text = 'נוסח השאלה הוא שדה חובה';
    if (form.type !== 'TEXT') {
      const labels = form.options.map((o) => o.label.trim()).filter(Boolean);
      if (labels.length < 2) e.options = 'שאלת בחירה דורשת לפחות שתי אפשרויות';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    saveQ.mutate({ ...form, options: form.options.filter((o) => o.label.trim()) });
  };

  const columns: Column<Question>[] = [
    { key: 'text', header: 'נוסח השאלה', cell: (r) => <span className="font-medium">{r.text}</span> },
    { key: 'type', header: 'סוג', cell: (r) => questionTypeLabel[r.type] },
    { key: 'req', header: 'חובה', cell: (r) => (r.required ? <Badge tone="amber">חובה</Badge> : 'לא') },
    { key: 'opts', header: 'אפשרויות', cell: (r) => (r.options.length ? r.options.map((o) => o.label).join(' | ') : '—') },
    { key: 'ans', header: 'תשובות שנמסרו', cell: (r) => r.answerCount },
    {
      key: 'act',
      header: 'פעולות',
      cell: (r) => (
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => { setErrors({}); setForm({ id: r.id, text: r.text, type: r.type, required: r.required, options: r.options.map((o) => ({ id: o.id, label: o.label })), answerCount: r.answerCount }); }}>
            <Pencil className="size-3.5" aria-hidden /> עריכה
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDeleting(r)} aria-label={`מחיקת השאלה ${r.text}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">שאלות הרשמה ייחודיות לסדנה</h2>
        <Button variant="primary" size="sm" onClick={() => { setErrors({}); setForm(emptyQ()); }}>
          <Plus className="size-4" aria-hidden /> הוסף שאלה
        </Button>
      </div>
      <DataTable caption="שאלות הרשמה" columns={columns} rows={q.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="אין שאלות הרשמה" text="ניתן להוסיף שאלות טקסט חופשי או בחירה יחידה, שיוצגו בעת ההרשמה." />} />

      <Dialog
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.id ? 'עריכת שאלה' : 'שאלה חדשה'}
        wide
        footer={
          <>
            <Button variant="primary" loading={saveQ.isPending} onClick={submit}>שמירה</Button>
            <Button onClick={() => setForm(null)} disabled={saveQ.isPending}>ביטול</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="נוסח השאלה" required error={errors.text}>
              <Input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="סוג השדה" hint={form.answerCount > 0 ? 'לא ניתן לשנות סוג לאחר שנמסרו תשובות' : undefined}>
                <Select value={form.type} disabled={form.answerCount > 0} onChange={(e) => setForm({ ...form, type: e.target.value as QForm['type'] })}>
                  <option value="TEXT">טקסט חופשי</option>
                  <option value="SINGLE_CHOICE">{questionTypeLabel.SINGLE_CHOICE}</option>
                  <option value="MULTI_CHOICE">{questionTypeLabel.MULTI_CHOICE}</option>
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox label="שאלת חובה" checked={form.required} onChange={(c) => setForm({ ...form, required: c })} />
              </div>
            </div>
            {form.type !== 'TEXT' && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-slate-700">אפשרויות תשובה</legend>
                <div className="space-y-2">
                  {form.options.map((o, i) => (
                    <div key={i} className="flex gap-2">
                      <Input aria-label={`אפשרות ${i + 1}`} value={o.label} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                      <Button size="sm" variant="ghost" aria-label={`הסרת אפשרות ${i + 1}`} onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}>
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
                {errors.options && <p role="alert" className="mt-1 text-xs text-red-700">{errors.options}</p>}
                <Button size="sm" className="mt-2" onClick={() => setForm({ ...form, options: [...form.options, { label: '' }] })}>
                  <Plus className="size-3.5" aria-hidden /> הוסף אפשרות
                </Button>
              </fieldset>
            )}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="מחיקת שאלה"
        description={deleting ? `האם למחוק את השאלה "${deleting.text}"? לא ניתן למחוק שאלה שנמסרו עליה תשובות.` : ''}
        confirmLabel="מחק שאלה"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </Card>
  );
}

// ======================= נרשמים =======================

function AddRegistrantDialog({ workshop, open, onClose }: { workshop: Workshop; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [qErrors, setQErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const members = useQuery({ queryKey: ['members', 'picker', dq], queryFn: () => api.get<Paged<MemberRow>>('/members', { q: dq, pageSize: 8 }), enabled: open && !member });
  const questions = useQuery({ queryKey: ['questions', workshop.id], queryFn: () => api.get<Question[]>(`/workshops/${workshop.id}/questions`), enabled: open });

  useEffect(() => {
    if (!open) {
      setQ(''); setMember(null); setBlocked(null); setAnswers({}); setQErrors({}); setSubmitError(null);
    }
  }, [open]);

  const register = useAction(
    () => {
      const payload: AnswerInput[] = (questions.data ?? []).map((qq) => toAnswerInput(qq as QuestionDef, answers[qq.id]));
      return api.post(`/workshops/${workshop.id}/registrations`, { memberId: member!.id, answers: payload });
    },
    {
      success: () => `${member?.fullName} נרשם בהצלחה`,
      silentCodes: ['ANSWERS_INVALID', 'RESTRICTED', 'NOT_ELIGIBLE', 'ALREADY_REGISTERED', 'REGISTRATION_CLOSED'],
      onSuccess: onClose,
      onError: (e: ApiError) => {
        if (e.code === 'ANSWERS_INVALID') setQErrors(e.details?.errors ?? {});
        else setSubmitError(e.message);
      },
    },
  );

  const choose = async (m: MemberRow) => {
    setChecking(true);
    setBlocked(null);
    try {
      await api.post(`/workshops/${workshop.id}/registrations/check`, { memberId: m.id });
      setMember(m);
    } catch (e) {
      setBlocked(e instanceof ApiError ? `לא ניתן לרשום את ${m.fullName}: ${e.message}` : 'אירעה שגיאה בבדיקת ההרשמה');
    } finally {
      setChecking(false);
    }
  };

  const confirm = () => {
    const errs: Record<number, string> = {};
    for (const qq of questions.data ?? []) {
      const a = answers[qq.id];
      if (isMissing(qq as QuestionDef, a)) errs[qq.id] = 'שאלת חובה';
    }
    setQErrors(errs);
    setSubmitError(null);
    if (Object.keys(errs).length) return;
    register.mutate(undefined);
  };

  const cols: Column<MemberRow>[] = [
    { key: 'n', header: 'שם', cell: (m) => <span className="font-medium">{m.fullName}</span> },
    { key: 'p', header: 'טלפון', cell: (m) => <Ltr>{m.phone}</Ltr> },
    { key: 'a', header: 'גיל', cell: (m) => m.age ?? '—' },
    { key: 'c', header: '', cell: (m) => <Button size="sm" variant="primary" loading={checking} onClick={() => void choose(m)} aria-label={`בחירת ${m.fullName}`}>בחר</Button> },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !register.isPending && onClose()} title="הוספת נרשם" wide>
      {!member ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input autoFocus type="search" aria-label="חיפוש חבר לפי שם או טלפון" placeholder="חיפוש חבר לפי שם או טלפון" className="ps-9" value={q} onChange={(e) => { setQ(e.target.value); setBlocked(null); }} />
          </div>
          {blocked && <InlineAlert tone="red">{blocked}</InlineAlert>}
          {members.error ? <ErrorBlock error={members.error} /> : !members.data ? <Spinner /> : (
            <DataTable caption="תוצאות חיפוש חברים" columns={cols} rows={members.data.items} rowKey={(m) => m.id} empty={<EmptyState title="לא נמצאו חברים" text="נסו חיפוש אחר." />} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <InlineAlert tone="green">
            {member.fullName} עומד/ת בהגבלות ובקריטריונים של {workshop.kind === 'EVENT' ? 'האירוע' : 'הסדנה'}.
          </InlineAlert>
          {(questions.data ?? []).length > 0 && <h3 className="font-semibold text-slate-900">שאלות הרשמה</h3>}
          {(questions.data ?? []).map((qq) => (
            <QuestionInput key={qq.id} q={qq as QuestionDef} value={answers[qq.id]} error={qErrors[qq.id]} onChange={(v) => { setAnswers({ ...answers, [qq.id]: v }); setQErrors({ ...qErrors, [qq.id]: '' }); }} />
          ))}
          {submitError && <InlineAlert tone="red">{submitError}</InlineAlert>}
          <div className="flex gap-2">
            <Button variant="primary" loading={register.isPending} onClick={confirm}>אישור הרשמה</Button>
            <Button disabled={register.isPending} onClick={() => { setMember(null); setSubmitError(null); }}>חזרה לחיפוש</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function RegistrantsTab({ workshop }: { workshop: Workshop }) {
  const nav = useNavigate();
  const [showCancelled, setShowCancelled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<RegistrantRow | null>(null);
  const [cancelling, setCancelling] = useState<RegistrantRow | null>(null);
  const [reason, setReason] = useState('');
  const regs = useQuery({ queryKey: ['registrations', workshop.id, showCancelled], queryFn: () => api.get<RegistrantRow[]>(`/workshops/${workshop.id}/registrations`, { includeCancelled: showCancelled }) });
  const details = useQuery({ queryKey: ['registration', viewing?.id], queryFn: () => api.get<RegistrationDetails>(`/registrations/${viewing!.id}`), enabled: !!viewing });
  const cancel = useAction((r: RegistrantRow) => api.post(`/registrations/${r.id}/cancel`, { reason }), {
    success: 'ההרשמה בוטלה',
    onSuccess: () => { setCancelling(null); setReason(''); },
  });

  const columns: Column<RegistrantRow>[] = [
    { key: 'n', header: 'שם חבר', cell: (r) => <span className="font-medium">{r.memberName}</span> },
    { key: 'p', header: 'טלפון', cell: (r) => <Ltr>{r.phone}</Ltr> },
    { key: 'd', header: 'תאריך ושעת הרשמה', cell: (r) => fmtDateTime(r.registeredAt) },
    {
      key: 's',
      header: 'סטטוס הרשמה',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.status === 'ACTIVE' ? <Badge tone="green">פעילה</Badge> : <Badge tone="red">בוטלה {fmtDate(r.cancelledAt)}</Badge>}
          {r.source === 'PUBLIC' && <Badge tone="blue">דף הרישום</Badge>}
        </div>
      ),
    },
    {
      key: 'a',
      header: 'פעולות',
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setViewing(r)}>תשובות</Button>
          <Button size="sm" onClick={() => nav(`/members/${r.memberId}`)}>כרטיס חבר</Button>
          {r.status === 'ACTIVE' && <Button size="sm" variant="danger" onClick={() => { setReason(''); setCancelling(r); }}>בטל הרשמה</Button>}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> הוסף נרשם
        </Button>
        <Checkbox label="הצג גם הרשמות שבוטלו" checked={showCancelled} onChange={setShowCancelled} />
      </div>
      {regs.isLoading ? <Spinner /> : regs.error ? <ErrorBlock error={regs.error} onRetry={() => regs.refetch()} /> : (
        <DataTable caption="נרשמים" columns={columns} rows={regs.data!} rowKey={(r) => r.id} empty={<EmptyState title="אין נרשמים עדיין" text="לחצו על 'הוסף נרשם' כדי לרשום חבר." />} />
      )}

      <AddRegistrantDialog workshop={workshop} open={adding} onClose={() => setAdding(false)} />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing ? `תשובות הרשמה: ${viewing.memberName}` : ''} wide>
        {details.isLoading ? <Spinner /> : details.error ? <ErrorBlock error={details.error} /> : (
          <DataTable
            caption="תשובות להרשמה"
            columns={[
              { key: 'q', header: 'שאלה', cell: (a: RegistrationDetails['answers'][number]) => a.question },
              { key: 'a', header: 'תשובה', cell: (a) => a.answer ?? <span className="text-slate-400">לא נענתה</span> },
            ]}
            rows={details.data?.answers ?? []}
            rowKey={(a) => a.questionId}
            empty={<EmptyState title="אין שאלות הרשמה לסדנה זו" />}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="ביטול הרשמה"
        description={cancelling ? `האם לבטל את הרשמת ${cancelling.memberName}? הרשומה לא תימחק, אלא תסומן כמבוטלת ותופיע בחריגות החבר.` : ''}
        confirmLabel="בטל הרשמה"
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
      >
        <Field label="סיבת הביטול (אופציונלי)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

// ======================= מפגשים =======================

export function SessionsTab({ workshop, onOpenAttendance }: { workshop: Workshop; onOpenAttendance: (sessionId: number) => void }) {
  const q = useQuery({ queryKey: ['sessions', workshop.id], queryFn: () => api.get<SessionRow[]>(`/workshops/${workshop.id}/sessions`) });
  const [form, setForm] = useState<{ id?: number; date: string; startTime: string; endTime: string } | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<SessionRow | null>(null);

  const saveS = useAction(
    (f: NonNullable<typeof form>) => {
      const body = { date: f.date, startTime: f.startTime, endTime: f.endTime };
      return f.id ? api.put(`/sessions/${f.id}`, body) : api.post(`/workshops/${workshop.id}/sessions`, body);
    },
    { success: 'המפגש נשמר', silentCodes: ['VALIDATION'], onSuccess: () => setForm(null), onError: (e: ApiError) => e.code === 'VALIDATION' && setError(Object.values(e.fields)[0] ?? e.message) },
  );
  const del = useAction((s: SessionRow) => api.del(`/sessions/${s.id}`), { success: 'המפגש הוסר', onSuccess: () => setDeleting(null), onError: () => setDeleting(null) });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;

  const submit = () => {
    if (!form) return;
    if (!form.date) return setError('יש לבחור תאריך');
    if (form.startTime && form.endTime && form.endTime <= form.startTime) return setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    setError('');
    saveS.mutate(form);
  };
  const multi = workshop.format === 'MULTI';

  const columns: Column<SessionRow>[] = [
    { key: 'n', header: 'מספר מפגש', cell: (s) => s.number },
    { key: 'd', header: 'תאריך', cell: (s) => fmtDate(s.date) },
    { key: 'st', header: 'שעת התחלה', cell: (s) => s.startTime ?? '—' },
    { key: 'en', header: 'שעת סיום', cell: (s) => s.endTime ?? '—' },
    { key: 'status', header: 'סטטוס המפגש', cell: (s) => (s.attendanceRecorded ? <Badge tone="green">נוכחות תועדה</Badge> : <Badge>טרם תועדה נוכחות</Badge>) },
    { key: 'p', header: 'משתתפים שהגיעו', cell: (s) => (s.attendanceRecorded ? s.presentCount : '—') },
    {
      key: 'a',
      header: 'פעולות',
      cell: (s) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => onOpenAttendance(s.id)}>נוכחות</Button>
          <Button size="sm" onClick={() => { setError(''); setForm({ id: s.id, date: s.date, startTime: s.startTime ?? '', endTime: s.endTime ?? '' }); }}>
            <Pencil className="size-3.5" aria-hidden /> שינוי מועד
          </Button>
          {multi && (
            <Button size="sm" variant="danger" disabled={s.attendanceRecorded} title={s.attendanceRecorded ? 'לא ניתן להסיר מפגש שתועדה בו נוכחות' : undefined} onClick={() => setDeleting(s)} aria-label={`הסרת מפגש ${s.number}`}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h2 className="font-semibold text-slate-900">מפגשי {workshop.kind === 'EVENT' ? 'האירוע' : 'הסדנה'}</h2>
        {multi && (
          <Button variant="primary" size="sm" onClick={() => { setError(''); setForm({ date: '', startTime: workshop.startTime ?? '', endTime: workshop.endTime ?? '' }); }}>
            <Plus className="size-4" aria-hidden /> הוסף מפגש
          </Button>
        )}
      </div>
      <DataTable caption="מפגשים" columns={columns} rows={q.data ?? []} rowKey={(s) => s.id} empty={<EmptyState title="טרם נקבעו מפגשים" text={multi ? 'הוסיפו מפגש כדי לקבוע מועד.' : 'הגדירו תאריך בפרטים הכלליים.'} />} />

      <Dialog
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.id ? 'שינוי מועד מפגש' : 'מפגש חדש'}
        footer={
          <>
            <Button variant="primary" loading={saveS.isPending} onClick={submit}>שמירה</Button>
            <Button onClick={() => setForm(null)} disabled={saveS.isPending}>ביטול</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3">
            <Field label="תאריך" required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שעת התחלה"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
              <Field label="שעת סיום"><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
            </div>
            {error && <InlineAlert tone="red">{error}</InlineAlert>}
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="הסרת מפגש"
        description={deleting ? `האם להסיר את מפגש ${deleting.number} מתאריך ${fmtDate(deleting.date)}?` : ''}
        confirmLabel="הסר מפגש"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </Card>
  );
}

// ======================= נוכחות =======================

const STATUS_OPTIONS: { value: Exclude<AttendanceStatus, 'UNMARKED'> | 'UNMARKED'; label: string }[] = [
  { value: 'PRESENT', label: 'הגיע' },
  { value: 'ABSENT', label: 'לא הגיע' },
  { value: 'UNMARKED', label: 'טרם סומן' },
];

export function AttendanceTab({ workshop, initialSessionId }: { workshop: Workshop; initialSessionId: number | null }) {
  const sessions = useQuery({ queryKey: ['sessions', workshop.id], queryFn: () => api.get<SessionRow[]>(`/workshops/${workshop.id}/sessions`) });
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => { if (initialSessionId) setSessionId(initialSessionId); }, [initialSessionId]);
  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId(sessions.data[0].id);
  }, [sessions.data, sessionId]);

  const att = useQuery({ queryKey: ['session-attendance', sessionId], queryFn: () => api.get<SessionAttendance>(`/sessions/${sessionId}/attendance`), enabled: !!sessionId });
  const mark = useAction(
    (v: { registrationId: number; status: AttendanceStatus }) => {
      setPending(v.registrationId);
      return api.put(`/sessions/${sessionId}/attendance`, { registrationId: v.registrationId, status: v.status === 'UNMARKED' ? null : v.status });
    },
    { success: 'הנוכחות נשמרה', onSuccess: () => setPending(null), onError: () => setPending(null) },
  );

  if (sessions.isLoading) return <Spinner />;
  if (sessions.error) return <ErrorBlock error={sessions.error} onRetry={() => sessions.refetch()} />;
  if (!sessions.data?.length) return <Card><EmptyState title="אין מפגשים" text="יש להגדיר מפגשים בטאב 'מפגשים' לפני סימון נוכחות." /></Card>;

  const columns: Column<SessionAttendance['rows'][number]>[] = [
    { key: 'n', header: 'שם חבר', cell: (r) => <span className="font-medium">{r.memberName}</span> },
    { key: 'p', header: 'טלפון', cell: (r) => <Ltr>{r.phone}</Ltr> },
    {
      key: 's',
      header: 'נוכחות',
      cell: (r) => (
        <div role="radiogroup" aria-label={`נוכחות של ${r.memberName}`} className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={r.status === o.value}
              disabled={pending === r.registrationId}
              onClick={() => r.status !== o.value && mark.mutate({ registrationId: r.registrationId, status: o.value })}
              className={`px-3 py-1.5 text-sm disabled:opacity-60 ${
                r.status === o.value
                  ? o.value === 'PRESENT' ? 'bg-emerald-600 text-white' : o.value === 'ABSENT' ? 'bg-red-600 text-white' : 'bg-slate-600 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-3">
        <Field label="מפגש" className="w-72 max-w-full">
          <Select value={sessionId ?? ''} onChange={(e) => setSessionId(Number(e.target.value))}>
            {sessions.data.map((s) => (
              <option key={s.id} value={s.id}>
                מפגש {s.number} · {fmtDate(s.date)} {fmtTimeRange(s.startTime, s.endTime) !== '—' ? `· ${fmtTimeRange(s.startTime, s.endTime)}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {att.data && (
          <div className="flex flex-wrap gap-2" aria-label="סיכום נוכחות">
            <Badge tone="gray">נרשמים: {att.data.summary.registered}</Badge>
            <Badge tone="green">נוכחים: {att.data.summary.present}</Badge>
            <Badge tone="red">נעדרים: {att.data.summary.absent}</Badge>
            <Badge tone="amber">טרם סומנו: {att.data.summary.unmarked}</Badge>
          </div>
        )}
      </div>
      {att.error ? <ErrorBlock error={att.error} onRetry={() => att.refetch()} /> : !att.data ? <Spinner /> : (
        <DataTable caption="נוכחות במפגש" columns={columns} rows={att.data.rows} rowKey={(r) => r.registrationId} empty={<EmptyState title="אין נרשמים פעילים" text="יש לרשום חברים בטאב 'נרשמים' כדי לסמן נוכחות." />} />
      )}
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">"לא הגיע" ו"טרם סומן" הם מצבים נפרדים: רק סימון מפורש של "לא הגיע" נספר כאי-הגעה בחריגות החבר.</p>
    </Card>
  );
}
