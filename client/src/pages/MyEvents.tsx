import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { fmtDateRange, kindLabel } from '../lib/format';

interface EventRow { registrationId: number; workshopId: number; name: string; kind: 'WORKSHOP' | 'EVENT'; startDate: string | null; endDate: string | null; startTime: string | null; isPaid: boolean }
interface Lookup { name: string; events: EventRow[]; demoCode: string }

/**
 * דף החבר "האירועים והסדנאות שאני רשום אליהם". צפייה בטלפון בלבד, וביטול דורש קוד חד-פעמי.
 * בהדגמה אין שליחת הודעות: הקוד מוצג על המסך.
 */
export default function MyEvents() {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState<Lookup | null>(null);
  const [error, setError] = useState('');
  const [cancelRow, setCancelRow] = useState<EventRow | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [done, setDone] = useState('');

  const lookup = useMutation({
    mutationFn: () => api.post<Lookup>('/me/lookup', { phone }),
    onSuccess: (d) => { setData(d); setError(''); setDone(''); },
    onError: (e) => { setData(null); setError(e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב'); },
  });
  const cancel = useMutation({
    mutationFn: (row: EventRow) => api.post<{ events: EventRow[] }>('/me/cancel', { phone, registrationId: row.registrationId, code }),
    onSuccess: (d, row) => {
      setData((p) => (p ? { ...p, events: d.events } : p));
      setCancelRow(null);
      setCode('');
      setDone(`ההשתתפות ב"${row.name}" בוטלה. תודה שפינית מקום למישהו אחר.`);
    },
    onError: (e) => setCodeError(e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב'),
  });

  const columns: Column<EventRow>[] = [
    { key: 'n', header: 'שם', cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { key: 'k', header: 'סוג', cell: (r) => <Badge tone="teal">{kindLabel[r.kind]}</Badge> },
    { key: 'd', header: 'תאריך', cell: (r) => `${fmtDateRange(r.startDate, r.endDate)}${r.startTime ? ` · ${r.startTime}` : ''}` },
    { key: 'a', header: 'פעולה', cell: (r) => <Button size="sm" variant="danger" onClick={() => { setCodeError(''); setCode(''); setCancelRow(r); }}>ביטול השתתפות</Button> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">דף הדגמה (POC): קוד האימות מוצג על המסך ואינו נשלח בהודעה</div>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="mb-4 text-center text-lg font-bold text-teal-700">החצר של יודה</p>
        <Card className="space-y-4 p-6">
          <h1 className="text-xl font-bold text-slate-900">האירועים והסדנאות שאני רשום/ה אליהם</h1>
          <p className="text-sm text-slate-600">כאן מופיעים כל האירועים והסדנאות שנרשמתם אליהם, וניתן גם לבטל השתתפות.</p>
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!lookup.isPending) lookup.mutate(); }} className="space-y-3">
            <Field label="מספר טלפון" error={error}>
              <Input ltr type="tel" autoFocus value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} placeholder="050-0000000" />
            </Field>
            <Button type="submit" variant="primary" loading={lookup.isPending}>הצגת האירועים שלי</Button>
          </form>
          {lookup.error && !data && !error && <ErrorBlock error={lookup.error} />}
        </Card>
        {data && (
          <Card className="mt-4">
            <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">שלום {data.name}</h2>
            {done && <div className="p-3"><InlineAlert tone="green">{done}</InlineAlert></div>}
            <DataTable caption="האירועים שלי" columns={columns} rows={data.events} rowKey={(r) => r.registrationId} empty={<EmptyState title="אינך רשום/ה לאף אירוע או סדנה כרגע" />} />
          </Card>
        )}
      </main>
      <Dialog
        open={!!cancelRow}
        onOpenChange={(o) => !o && !cancel.isPending && setCancelRow(null)}
        title="ביטול השתתפות"
        description={cancelRow ? `לבטל את ההשתתפות ב"${cancelRow.name}"?${cancelRow.isPaid ? ' לצערנו אין החזר על דמי רישום.' : ''}` : ''}
        footer={<><Button variant="danger" loading={cancel.isPending} onClick={() => (code.trim() ? cancel.mutate(cancelRow!) : setCodeError('יש להזין את קוד האימות'))}>אישור ביטול</Button><Button onClick={() => setCancelRow(null)} disabled={cancel.isPending}>חזרה</Button></>}
      >
        <Field label="קוד אימות" error={codeError} hint={data ? `בהדגמה הקוד הוא ${data.demoCode}` : undefined}>
          <Input ltr inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setCodeError(''); }} />
        </Field>
      </Dialog>
    </div>
  );
}
