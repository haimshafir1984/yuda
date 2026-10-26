import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAction } from '../../components/toast';
import { Badge, Button, Checkbox, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, Input, Ltr, Select, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fmtMoney, trackLabel } from '../../lib/format';
import type { Therapist, Track } from '../../lib/types';

export const useTherapists = (activeOnly = false) =>
  useQuery({ queryKey: ['therapists', activeOnly], queryFn: () => api.get<Therapist[]>('/therapists', { activeOnly }) });

interface Form { id?: number; fullName: string; phone: string; email: string; type: Track; pricePerSession: string; active: boolean }
const empty = (): Form => ({ fullName: '', phone: '', email: '', type: 'PRIVATE', pricePerSession: '', active: true });

/** ניהול מטפלים בסיסי (לא מודול ספקים מלא) */
export default function TherapistsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useTherapists();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useAction(
    (f: Form) => {
      const body = { fullName: f.fullName, phone: f.phone, email: f.email, type: f.type, pricePerSession: f.pricePerSession, active: f.active };
      return f.id ? api.put(`/therapists/${f.id}`, body) : api.post('/therapists', body);
    },
    {
      success: 'המטפל נשמר',
      silentCodes: ['VALIDATION'],
      onSuccess: () => setForm(null),
      onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
    },
  );

  const submit = () => {
    if (!form) return;
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'שם מלא הוא שדה חובה';
    if (form.pricePerSession === '' || Number(form.pricePerSession) < 0) e.pricePerSession = 'יש להזין מחיר לפגישה';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'כתובת מייל לא תקינה';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(form);
  };

  const columns: Column<Therapist>[] = [
    { key: 'n', header: 'שם מלא', cell: (t) => <span className="font-medium">{t.fullName}</span> },
    { key: 't', header: 'סוג', cell: (t) => trackLabel[t.type] },
    { key: 'p', header: 'טלפון', cell: (t) => (t.phone ? <Ltr>{t.phone}</Ltr> : '—') },
    { key: 'e', header: 'מייל', cell: (t) => (t.email ? <Ltr>{t.email}</Ltr> : '—') },
    { key: 'price', header: 'מחיר לפגישה', cell: (t) => fmtMoney(t.pricePerSession) },
    { key: 's', header: 'סטטוס', cell: (t) => (t.active ? <Badge tone="green">פעיל</Badge> : <Badge>לא פעיל</Badge>) },
    {
      key: 'a',
      header: 'פעולה',
      cell: (t) => (
        <Button size="sm" onClick={() => { setErrors({}); setForm({ id: t.id, fullName: t.fullName, phone: t.phone ?? '', email: t.email ?? '', type: t.type, pricePerSession: String(t.pricePerSession), active: t.active }); }}>
          <Pencil className="size-3.5" aria-hidden /> עריכה
        </Button>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setForm(null); }} title="ניהול מטפלים" wide>
      {form ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם מלא" required error={errors.fullName}><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label="סוג">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Track })}>
                <option value="PRIVATE">{trackLabel.PRIVATE}</option>
                <option value="SMAT">{trackLabel.SMAT}</option>
              </Select>
            </Field>
            <Field label="טלפון"><Input ltr type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="מייל" error={errors.email}><Input ltr type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="מחיר לפגישה (ש״ח)" required error={errors.pricePerSession} hint="שינוי מחיר לא ישנה דיווחים קיימים">
              <Input ltr type="number" min={0} step="0.01" value={form.pricePerSession} onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })} />
            </Field>
            <div className="flex items-center pt-5"><Checkbox label="מטפל פעיל" checked={form.active} onChange={(c) => setForm({ ...form, active: c })} /></div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" loading={save.isPending} onClick={submit}>שמירה</Button>
            <Button onClick={() => setForm(null)} disabled={save.isPending}>חזרה לרשימה</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button variant="primary" size="sm" onClick={() => { setErrors({}); setForm(empty()); }}>
            <Plus className="size-4" aria-hidden /> הוסף מטפל
          </Button>
          {q.isLoading ? <Spinner /> : q.error ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} /> : (
            <DataTable caption="מטפלים" columns={columns} rows={q.data ?? []} rowKey={(t) => t.id} empty={<EmptyState title="אין מטפלים" text="הוסיפו מטפל כדי לשייך אותו לתהליכי שפ״ח." />} />
          )}
        </div>
      )}
    </Dialog>
  );
}
