import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MemberPicker, { PickedMember } from '../../components/MemberPicker';
import { useAction } from '../../components/toast';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { priorityLabel, requestSourceLabel, requestTypeLabel, todayStr } from '../../lib/format';
import type { ServiceRequest } from '../../lib/types';
import { useStaff } from './RequestsList';

export default function RequestCreate() {
  const nav = useNavigate();
  const presetId = Number(useSearchParams()[0].get('memberId')) || null;
  const staff = useStaff();
  const [member, setMember] = useState<PickedMember | null>(null);
  const [v, setV] = useState({ type: '', subject: '', description: '', openedAt: todayStr(), source: 'MANUAL', assignee: '', priority: 'NORMAL', internalNote: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  const create = useAction(() => api.post<ServiceRequest>('/service-requests', { memberId: member!.id, ...v }), {
    success: 'הפנייה נפתחה',
    silentCodes: ['VALIDATION'],
    onSuccess: (r) => nav(`/requests/${r.id}`),
    onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!member) e.member = 'יש לבחור חבר מתוך רשימת החברים';
    if (!v.type) e.type = 'יש לבחור סוג פנייה';
    if (!v.subject.trim()) e.subject = 'נושא הוא שדה חובה';
    setErrors(e);
    if (!Object.keys(e).length) create.mutate(undefined);
  };

  return (
    <>
      <PageHeader title="פנייה חדשה" breadcrumbs={[{ label: 'פניות ובקשות סיוע', to: '/requests' }, { label: 'פנייה חדשה' }]} />
      <Card className="p-5">
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (!create.isPending) submit(); }} className="space-y-5">
          <MemberPicker value={member} onChange={setMember} presetId={presetId} error={errors.member ?? errors.memberId} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="סוג פנייה" required error={errors.type}>
              <Select value={v.type} onChange={(e) => set('type', e.target.value)}>
                <option value="">בחירה...</option>
                {Object.entries(requestTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="נושא קצר" required error={errors.subject} className="lg:col-span-2"><Input value={v.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
            <Field label="תיאור הבקשה" className="sm:col-span-2 lg:col-span-3"><Textarea value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="תאריך פתיחה"><Input type="date" value={v.openedAt} onChange={(e) => set('openedAt', e.target.value)} /></Field>
            <Field label="מקור הפנייה">
              <Select value={v.source} onChange={(e) => set('source', e.target.value)}>{Object.entries(requestSourceLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Field>
            <Field label="עדיפות">
              <Select value={v.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(priorityLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Field>
            <Field label="גורם אחראי">
              <Select value={v.assignee} onChange={(e) => set('assignee', e.target.value)}>
                <option value="">לא שויך</option>
                {(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="הערה פנימית" className="sm:col-span-2"><Input value={v.internalNote} onChange={(e) => set('internalNote', e.target.value)} /></Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={create.isPending}>שמירה ומעבר לכרטיס הפנייה</Button>
            <Button onClick={() => nav('/requests')} disabled={create.isPending}>ביטול</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
