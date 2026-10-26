import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Button, Card, Checkbox, Column, DataTable, EmptyState, Field, InlineAlert, Input, Ltr, PageHeader, Select, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fmtMoney, trackLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { Member, MemberRow, Paged, Track, Treatment } from '../../lib/types';
import { useTherapists } from './TherapistsDialog';

const STEPS = ['פרטים בסיסיים', 'התאמת מטפל', 'אישור ויצירה'];

export default function TreatmentCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const presetId = Number(params.get('memberId')) || null;
  const requestId = Number(params.get('requestId')) || null;
  const [step, setStep] = useState(0);
  const [member, setMember] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const dq = useDebounced(search);
  const [v, setV] = useState({ approvedSessions: '30', copay: '', socialWorker: '', approval: false, track: 'PRIVATE' as Track, therapistId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // חבר שנבחר מכרטיס החבר משויך אוטומטית
  useQuery({
    queryKey: ['member', presetId],
    queryFn: async () => {
      const m = await api.get<Member>(`/members/${presetId}`);
      setMember({ id: m.id, name: m.fullName });
      return m;
    },
    enabled: !!presetId && !member,
  });
  const results = useQuery({ queryKey: ['members', 'treatment-picker', dq], queryFn: () => api.get<Paged<MemberRow>>('/members', { q: dq, pageSize: 6 }), enabled: !member });
  const meta = useQuery({ queryKey: ['treatment-meta'], queryFn: () => api.get<{ socialWorkers: string[] }>('/treatment-meta') });
  const therapists = useTherapists(true);

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); setServerError(null); };
  const therapistOptions = (therapists.data ?? []).filter((t) => t.type === v.track);
  const therapist = therapistOptions.find((t) => String(t.id) === v.therapistId);

  const create = useAction(
    () => api.post<Treatment>('/treatments', {
      memberId: member!.id, approvedSessions: Number(v.approvedSessions), copayPerSession: Number(v.copay), socialWorker: v.socialWorker,
      yehudaApproval: v.approval, track: v.track, therapistId: v.therapistId ? Number(v.therapistId) : null,
    }),
    {
      success: 'תהליך השפ״ח נפתח',
      silentCodes: ['OPEN_TREATMENT_EXISTS', 'APPROVAL_REQUIRED', 'VALIDATION', 'TRACK_MISMATCH', 'THERAPIST_INACTIVE'],
      onSuccess: async (t) => {
        // פנייה שממנה נפתח התהליך: הקישור נשמר רק לאחר שהשפ"ח נוצר בכללי הפתיחה הרגילים
        if (requestId) await api.post(`/service-requests/${requestId}/link-treatment`, { treatmentId: t.id }).catch(() => undefined);
        nav(`/treatments/${t.id}`);
      },
      onError: (e: ApiError) => setServerError(e.message),
    },
  );

  const next1 = () => {
    const e: Record<string, string> = {};
    if (!member) e.member = 'יש לבחור חבר קיים';
    if (!(Number(v.approvedSessions) >= 1)) e.approvedSessions = 'יש להזין מספר פגישות מאושרות';
    if (v.copay === '' || Number(v.copay) < 0) e.copay = 'יש להזין גובה השתתפות עצמית (0 אם אין)';
    if (!v.socialWorker) e.socialWorker = 'יש לבחור עו״סית אחראית';
    if (!v.approval) e.approval = 'לא ניתן לפתוח תהליך ללא אישור מיהודה';
    setErrors(e);
    if (!Object.keys(e).length) setStep(1);
  };

  const cols: Column<MemberRow>[] = [
    { key: 'n', header: 'שם', cell: (m) => <span className="font-medium">{m.fullName}</span> },
    { key: 'p', header: 'טלפון', cell: (m) => <Ltr>{m.phone}</Ltr> },
    { key: 'a', header: 'גיל', cell: (m) => m.age ?? '—' },
    { key: 'c', header: '', cell: (m) => <Button size="sm" variant="primary" aria-label={`בחירת ${m.fullName}`} onClick={() => { setMember({ id: m.id, name: m.fullName }); setErrors((p) => ({ ...p, member: '' })); }}>בחר</Button> },
  ];

  return (
    <>
      <PageHeader title="פתיחת תהליך שפ״ח חדש" breadcrumbs={[{ label: 'שפ״ח', to: '/treatments' }, { label: 'תהליך חדש' }]} />
      <ol className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="שלבי הפתיחה">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={`rounded-full px-3 py-1 ${i === step ? 'bg-teal-600 text-white' : i < step ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Card className="p-5">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">חבר <span className="text-red-600" aria-hidden>*</span></p>
              {member ? (
                <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium">{member.name}</span>
                  {!presetId && <Button size="sm" onClick={() => setMember(null)}>שינוי חבר</Button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                    <Input type="search" aria-label="חיפוש חבר קיים" placeholder="חיפוש חבר קיים לפי שם, טלפון או תעודת זהות" className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  {results.data ? <DataTable caption="תוצאות חיפוש חברים" columns={cols} rows={results.data.items} rowKey={(m) => m.id} empty={<EmptyState title="לא נמצאו חברים" />} /> : <Spinner />}
                </div>
              )}
              {errors.member && <p role="alert" className="mt-1 text-xs text-red-700">{errors.member}</p>}
              <p className="mt-1 text-xs text-slate-500">לא ניתן ליצור חבר חדש מכאן. יש לבחור חבר מתוך מערכת החברים.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="מספר פגישות מאושרות" required error={errors.approvedSessions}><Input ltr type="number" min={1} value={v.approvedSessions} onChange={(e) => set('approvedSessions', e.target.value)} /></Field>
              <Field label="השתתפות עצמית לפגישה (ש״ח)" required error={errors.copay}><Input ltr type="number" min={0} step="0.01" value={v.copay} onChange={(e) => set('copay', e.target.value)} /></Field>
              <Field label="עו״סית אחראית" required error={errors.socialWorker}>
                <Select value={v.socialWorker} onChange={(e) => set('socialWorker', e.target.value)}>
                  <option value="">בחירה...</option>
                  {(meta.data?.socialWorkers ?? []).map((w) => <option key={w} value={w}>{w}</option>)}
                </Select>
              </Field>
              <Field label="קישור לכרטיס אינטייק" hint="יתווסף כשמודול האינטייק ייבנה" className="sm:col-span-2 lg:col-span-3">
                <Input disabled placeholder="בפיתוח עתידי" />
              </Field>
            </div>
            <div>
              <Checkbox label="יש אישור מיהודה (חובה לפתיחת תהליך)" checked={v.approval} onChange={(c) => set('approval', c)} />
              {errors.approval && <p role="alert" className="mt-1 text-xs text-red-700">{errors.approval}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={next1}>המשך להתאמת מטפל</Button>
              <Button onClick={() => nav('/treatments')}>ביטול</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">מסלול טיפול</legend>
              <div className="flex gap-6">
                {(['PRIVATE', 'SMAT'] as Track[]).map((t) => (
                  <label key={t} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="track" className="size-4 accent-teal-600" checked={v.track === t} onChange={() => { set('track', t); set('therapistId', ''); }} />
                    {trackLabel[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="מטפל" hint={v.track === 'SMAT' ? 'במסלול סמט אפשר לפתוח את התהליך לפני שנבחר מטפל ספציפי' : 'אפשר להשאיר ללא מטפל ולשייך מאוחר יותר: התהליך יישמר כ"ממתין להתאמת מטפל"'}>
              <Select value={v.therapistId} onChange={(e) => set('therapistId', e.target.value)}>
                <option value="">ללא מטפל כרגע (ממתין להתאמת מטפל)</option>
                {therapistOptions.map((t) => <option key={t.id} value={t.id}>{t.fullName} · {fmtMoney(t.pricePerSession)} לפגישה</option>)}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setStep(2)}>המשך לסיכום</Button>
              <Button onClick={() => setStep(0)}>חזרה</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['חבר', member?.name],
                ['עו״סית אחראית', v.socialWorker],
                ['מסלול', trackLabel[v.track]],
                ['מטפל', therapist?.fullName ?? 'טרם נבחר'],
                ['פגישות מאושרות', v.approvedSessions],
                ['השתתפות עצמית לפגישה', fmtMoney(Number(v.copay))],
                ['עלות פגישה', therapist ? fmtMoney(therapist.pricePerSession) : 'תיקבע עם שיוך מטפל'],
                ['אישור מיהודה', 'קיים'],
                ['סטטוס פתיחה', therapist ? 'ממתין לחתימת מטופל על חוזה' : 'ממתין להתאמת מטפל'],
              ].map(([k, val]) => (
                <div key={k as string}><dt className="text-xs font-medium text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-900">{val}</dd></div>
              ))}
            </dl>
            {serverError && <InlineAlert tone="red">{serverError}</InlineAlert>}
            <div className="flex gap-2">
              <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(undefined)}>פתח תהליך</Button>
              <Button disabled={create.isPending} onClick={() => setStep(1)}>חזרה</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
