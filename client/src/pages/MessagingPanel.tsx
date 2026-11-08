import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAction } from '../components/toast';
import { Badge, Button, Card, Checkbox, Column, DataTable, Dialog, ErrorBlock, Field, Select, Spinner, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { useCan } from '../lib/auth';
import { fmtDateTime } from '../lib/format';

interface Template { id: number; key: string; name: string; subject: string | null; body: string; active: boolean }
interface OutboxRow { id: number; memberName: string | null; channel: string; toAddress: string | null; templateKey: string | null; body: string; status: string; error: string | null; attempts: number; createdAt: string }
interface JobRow { id: number; type: string; runAt: string; status: string; attempts: number; lastError: string | null }

const STATUS_LABEL: Record<string, string> = { QUEUED: 'בתור', SENT: 'נשלחה', FAILED: 'נכשלה', SKIPPED: 'דולגה', PENDING: 'ממתינה', DONE: 'בוצעה', CANCELLED: 'בוטלה' };
const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'gray' | 'blue'> = { SENT: 'green', DONE: 'green', FAILED: 'red', SKIPPED: 'amber', QUEUED: 'blue', PENDING: 'blue', CANCELLED: 'gray' };
const JOB_LABEL: Record<string, string> = { 'workshop.reminder': 'תזכורת לפני פעילות' };

const VARS = ['שם', 'שם מלא', 'פעילות', 'תאריך', 'שעה'];

function TemplateDialog({ t, onClose }: { t: Template; onClose: () => void }) {
  const [subject, setSubject] = useState(t.subject ?? '');
  const [body, setBody] = useState(t.body);
  const [active, setActive] = useState(t.active);
  const save = useAction(() => api.put(`/messages/templates/${t.id}`, { subject: subject || null, body, active }), { success: 'התבנית נשמרה', onSuccess: onClose, silentCodes: ['VALIDATION'] });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`עריכת תבנית: ${t.name}`}
      description={`משתנים אפשריים: ${VARS.map((v) => `{{${v}}}`).join('  ')}`}
      footer={
        <>
          <Button variant="primary" loading={save.isPending} disabled={!body.trim()} onClick={() => save.mutate(undefined)}>שמירה</Button>
          <Button onClick={onClose} disabled={save.isPending}>ביטול</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="נושא (למייל בלבד)"><input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="נוסח ההודעה"><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Checkbox label="תבנית פעילה (כבויה: ההודעה לא תישלח)" checked={active} onChange={setActive} />
      </div>
    </Dialog>
  );
}

export default function MessagingPanel() {
  const canEdit = useCan('settings');
  const [editing, setEditing] = useState<Template | null>(null);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<OutboxRow | null>(null);
  const tpl = useQuery({ queryKey: ['msg-templates'], queryFn: () => api.get<Template[]>('/messages/templates') });
  const outbox = useQuery({ queryKey: ['msg-outbox', status], queryFn: () => api.get<OutboxRow[]>('/messages/outbox', status ? { status } : undefined) });
  const jobs = useQuery({ queryKey: ['msg-jobs'], queryFn: () => api.get<JobRow[]>('/messages/jobs') });
  const resend = useAction((id: number) => api.post(`/messages/outbox/${id}/resend`), { success: 'ההודעה נשלחה' });
  const runNow = useAction(() => api.post('/messages/run-now'), { success: 'מחזור הרקע הורץ' });

  const tplCols: Column<Template>[] = [
    { key: 'n', header: 'תבנית', cell: (t) => <span className="font-medium">{t.name}</span> },
    { key: 'b', header: 'נוסח', cell: (t) => <span className="text-slate-600">{t.body}</span> },
    { key: 'a', header: 'מצב', cell: (t) => (t.active ? <Badge tone="green">פעילה</Badge> : <Badge>כבויה</Badge>) },
    { key: 'e', header: 'פעולה', cell: (t) => <Button size="sm" disabled={!canEdit} onClick={() => setEditing(t)}>עריכה</Button> },
  ];
  const outCols: Column<OutboxRow>[] = [
    { key: 'd', header: 'זמן', cell: (m) => fmtDateTime(m.createdAt) },
    { key: 'm', header: 'חבר', cell: (m) => m.memberName ?? '—' },
    { key: 'c', header: 'ערוץ', cell: (m) => (m.channel === 'EMAIL' ? 'מייל' : 'SMS') },
    { key: 's', header: 'סטטוס', cell: (m) => <span><Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>{m.error && <span className="ms-2 text-xs text-red-700">{m.error}</span>}</span> },
    { key: 'v', header: 'פעולה', cell: (m) => (
      <span className="flex gap-2">
        <Button size="sm" onClick={() => setOpen(m)}>הצגה</Button>
        {(m.status === 'FAILED') && <Button size="sm" disabled={!canEdit} loading={resend.isPending && resend.variables === m.id} onClick={() => resend.mutate(m.id)}>שליחה חוזרת</Button>}
      </span>
    ) },
  ];
  const jobCols: Column<JobRow>[] = [
    { key: 't', header: 'משימה', cell: (j) => JOB_LABEL[j.type] ?? j.type },
    { key: 'r', header: 'מועד הרצה', cell: (j) => fmtDateTime(j.runAt) },
    { key: 's', header: 'סטטוס', cell: (j) => <span><Badge tone={STATUS_TONE[j.status]}>{STATUS_LABEL[j.status]}</Badge>{j.lastError && <span className="ms-2 text-xs text-red-700">{j.lastError}</span>}</span> },
    { key: 'a', header: 'ניסיונות', cell: (j) => j.attempts },
  ];

  return (
    <>
      <Card>
        <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">תבניות הודעות</h2>
        {tpl.isLoading ? <Spinner /> : tpl.error ? <ErrorBlock error={tpl.error} onRetry={() => tpl.refetch()} /> : <DataTable caption="תבניות הודעות" columns={tplCols} rows={tpl.data!} rowKey={(t) => t.id} />}
        <p className="border-t border-slate-100 p-3 text-xs text-slate-600">ההודעות נשלחות בערוץ המועדף של החבר (ברירת מחדל SMS). בהדגמה אין שליחה אמיתית: ההודעות נשמרות בתיבת היוצאות למטה.</p>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">תיבת הודעות יוצאות</h2>
          <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="סינון לפי סטטוס">
            <option value="">כל הסטטוסים</option>
            <option value="SENT">נשלחה</option>
            <option value="FAILED">נכשלה</option>
            <option value="SKIPPED">דולגה</option>
          </Select>
        </div>
        {outbox.isLoading ? <Spinner /> : outbox.error ? <ErrorBlock error={outbox.error} onRetry={() => outbox.refetch()} /> : outbox.data!.length ? <DataTable caption="הודעות יוצאות" columns={outCols} rows={outbox.data!} rowKey={(m) => m.id} /> : <p className="p-4 text-sm text-slate-600">עדיין לא נשלחו הודעות. הרשמה לפעילות תיצור אישור הרשמה.</p>}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <h2 className="font-semibold text-slate-900">משימות מתוזמנות</h2>
          <Button size="sm" disabled={!canEdit} loading={runNow.isPending} onClick={() => runNow.mutate(undefined)}>הרצה עכשיו</Button>
        </div>
        {jobs.isLoading ? <Spinner /> : jobs.error ? <ErrorBlock error={jobs.error} onRetry={() => jobs.refetch()} /> : jobs.data!.length ? <DataTable caption="משימות מתוזמנות" columns={jobCols} rows={jobs.data!} rowKey={(j) => j.id} /> : <p className="p-4 text-sm text-slate-600">אין משימות מתוזמנות. תזכורת נוצרת בהרשמה לפעילות שמתקיימת בעוד יותר מיממה.</p>}
        <p className="border-t border-slate-100 p-3 text-xs text-slate-600">המתזמן רץ בשרת אחת לדקה. תזכורת נשלחת 24 שעות לפני המפגש הקרוב. משימה שנכשלת תיבדק שוב, ואחרי 3 ניסיונות תסומן כנכשלה.</p>
      </Card>
      {editing && <TemplateDialog t={editing} onClose={() => setEditing(null)} />}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)} title="תוכן ההודעה" description={`${open.memberName ?? ''} · ${open.toAddress ?? 'ללא כתובת'}`} footer={<Button onClick={() => setOpen(null)}>סגירה</Button>}>
          <p className="whitespace-pre-wrap text-sm text-slate-900">{open.body}</p>
        </Dialog>
      )}
    </>
  );
}
