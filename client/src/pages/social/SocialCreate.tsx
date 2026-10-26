import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import KindsField from '../../components/KindsField';
import MemberPicker, { PickedMember } from '../../components/MemberPicker';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Field, InlineAlert, Input, PageHeader, Select, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { processTypeLabel, requestStatusLabel, requestTypeLabel, todayStr } from '../../lib/format';
import type { Member, ServiceRequest, SocialProcess } from '../../lib/types';
import { useStaff } from '../requests/RequestsList';

export default function SocialCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const presetMember = Number(params.get('memberId')) || null;
  const presetRequest = Number(params.get('requestId')) || null;
  const staff = useStaff();
  const request = useQuery({ queryKey: ['service-request', presetRequest], queryFn: () => api.get<ServiceRequest>(`/service-requests/${presetRequest}`), enabled: !!presetRequest });
  const [member, setMember] = useState<PickedMember | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [v, setV] = useState({ socialWorker: '', type: 'AUTO', goal: '', startDate: todayStr() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [already, setAlready] = useState<number | null>(null);
  const [allowAnother, setAllowAnother] = useState(false);
  const set = (k: keyof typeof v, val: string) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };

  // חבר נגזר מהפנייה כשהיא קיימת
  const memberId = request.data?.memberId ?? presetMember;
  const memberInfo = useQuery({ queryKey: ['member', memberId], queryFn: () => api.get<Member>(`/members/${memberId}`), enabled: !!memberId });

  const create = useAction(
    () => api.post<SocialProcess>('/social-work/processes', { memberId: member!.id, requestId: presetRequest, ...v, kinds, allowAnother }),
    {
      success: 'תהליך הליווי נפתח',
      silentCodes: ['VALIDATION', 'REQUEST_ALREADY_LINKED', 'CROSS_MEMBER'],
      onSuccess: (p) => nav(`/social-work/${p.id}`),
      onError: (e: ApiError) => {
        if (e.code === 'REQUEST_ALREADY_LINKED') setAlready(e.details?.processId ?? null);
        setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message });
      },
    },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!member) e.member = 'יש לבחור חבר מתוך רשימת החברים';
    if (!kinds.length) e.kinds = 'יש לבחור לפחות מהות ליווי אחת';
    setErrors(e);
    if (!Object.keys(e).length) create.mutate(undefined);
  };

  return (
    <>
      <PageHeader title="פתיחת תהליך ליווי עו״ס" breadcrumbs={[{ label: 'ליווי עו״ס', to: '/social-work' }, { label: 'תהליך חדש' }]} />
      <Card className="p-5">
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (!create.isPending) submit(); }} className="space-y-5">
          <MemberPicker value={member} onChange={setMember} presetId={memberId} error={errors.member ?? errors.memberId} />
          {memberInfo.data && <p className="text-sm text-slate-600">ביטוח לאומי (מכרטיס החבר): <Badge tone={memberInfo.data.nationalInsurance ? 'teal' : 'gray'}>{memberInfo.data.nationalInsurance ? 'משויך' : 'לא משויך'}</Badge></p>}
          {request.data && (
            <InlineAlert tone="blue">
              התהליך ייפתח מפנייה <Link className="font-medium underline" to={`/requests/${request.data.id}`}>#{request.data.id}</Link>: {request.data.subject} ({requestTypeLabel[request.data.type]}, {requestStatusLabel[request.data.status]}). הקישור לפנייה יישמר.
            </InlineAlert>
          )}
          <KindsField value={kinds} onChange={(k) => { setKinds(k); setErrors((p) => ({ ...p, kinds: '' })); }} error={errors.kinds} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="עו״סית אחראית"><Select value={v.socialWorker} onChange={(e) => set('socialWorker', e.target.value)}><option value="">לא שויכה</option>{(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
            <Field label="סוג התהליך" hint="אוטומטי: חד-פעמי עד 2 פגישות, מתמשך מ-3 פגישות. אפשר להגדיר ידנית מראש"><Select value={v.type} onChange={(e) => set('type', e.target.value)}><option value="AUTO">אוטומטי לפי מספר הפגישות</option><option value="ONE_TIME">{processTypeLabel.ONE_TIME}</option><option value="ONGOING">{processTypeLabel.ONGOING}</option></Select></Field>
            <Field label="תאריך התחלה"><Input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          </div>
          <Field label="תיאור קצר של מטרת הליווי"><Textarea className="min-h-20" value={v.goal} onChange={(e) => set('goal', e.target.value)} /></Field>
          {already && (
            <InlineAlert tone="amber">
              <p>מהפנייה הזו כבר נפתח תהליך ליווי <Link className="font-medium underline" to={`/social-work/${already}`}>#{already}</Link>.</p>
              <label className="mt-2 inline-flex items-center gap-2"><input type="checkbox" className="size-4 accent-teal-600" checked={allowAnother} onChange={(e) => setAllowAnother(e.target.checked)} /> פתח תהליך נוסף בכל זאת</label>
            </InlineAlert>
          )}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={create.isPending}>פתח תהליך</Button>
            <Button onClick={() => nav('/social-work')} disabled={create.isPending}>ביטול</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
