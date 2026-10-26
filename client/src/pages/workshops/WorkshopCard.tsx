import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, Checkbox, Dialog, ErrorBlock, Field, FutureNotice, InlineAlert, Input, PageHeader, Select, Spinner, Tabs, TabsContent, TabsList, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { fmtDateRange, fmtMoney, genderLabel, kindLabel, priceTypeLabel, registrationModeLabel, statusLabel } from '../../lib/format';
import type { Workshop } from '../../lib/types';
import { statusTone } from './WorkshopsList';
import { AttendanceTab, QuestionsTab, RegistrantsTab, SessionsTab } from './WorkshopTabs';

const save = (id: number, patch: Record<string, unknown>) => api.put<Workshop>(`/workshops/${id}`, patch);

function GeneralTab({ w }: { w: Workshop }) {
  const init = () => ({
    name: w.name, subtitle: w.subtitle ?? '', description: w.description ?? '', facilitator: w.facilitator ?? '',
    startDate: w.format === 'SINGLE' ? w.startDate ?? '' : '', startTime: w.startTime ?? '', endTime: w.endTime ?? '',
    isPaid: w.isPaid, price: w.price == null ? '' : String(w.price), priceType: w.priceType as string, nationalInsurance: w.nationalInsurance,
    status: w.status, registrationOpen: w.registrationOpen,
  });
  const [v, setV] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setV(init()), [JSON.stringify(w)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: '' }));
  };
  const mut = useAction((p: Record<string, unknown>) => save(w.id, p), {
    success: 'הפרטים נשמרו',
    silentCodes: ['VALIDATION'],
    onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'שם הוא שדה חובה';
    if (v.isPaid && !(Number(v.price) > 0)) e.price = 'יש להזין מחיר לסדנה בתשלום';
    if (v.startTime && v.endTime && v.endTime <= v.startTime) e.endTime = 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
    setErrors(e);
    if (Object.keys(e).length) return;
    const { startDate, ...rest } = v;
    mut.mutate({ ...rest, price: v.isPaid ? Number(v.price) : null, ...(w.format === 'SINGLE' && startDate ? { startDate } : {}) });
  };

  return (
    <Card className="p-5">
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!mut.isPending) submit(); }} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="סוג"><Input value={`${kindLabel[w.kind]} ${w.format === 'SINGLE' ? '(חד-פעמי)' : '(מרובה מפגשים)'}`} disabled readOnly /></Field>
          <Field label="שם" required error={errors.name} className="lg:col-span-2"><Input value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="כותרת משנה" className="lg:col-span-3"><Input value={v.subtitle} onChange={(e) => set('subtitle', e.target.value)} /></Field>
          <Field label="תיאור" className="lg:col-span-3"><Textarea value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="מנחה"><Input value={v.facilitator} onChange={(e) => set('facilitator', e.target.value)} /></Field>
          {w.format === 'SINGLE' ? (
            <Field label="תאריך"><Input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          ) : (
            <Field label="תאריכי הסדנה" hint="מנוהלים בטאב מפגשים"><Input disabled readOnly value={fmtDateRange(w.startDate, w.endDate)} /></Field>
          )}
          <div className="hidden lg:block" />
          <Field label="שעת התחלה (ברירת מחדל)"><Input type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
          <Field label="שעת סיום (ברירת מחדל)" error={errors.endTime}><Input type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
          <div className="hidden lg:block" />
          <Field label="תשלום">
            <Select value={v.isPaid ? 'PAID' : 'FREE'} onChange={(e) => set('isPaid', e.target.value === 'PAID')}>
              <option value="FREE">בחינם</option>
              <option value="PAID">בתשלום</option>
            </Select>
          </Field>
          {v.isPaid && <Field label="מחיר בשקלים" required error={errors.price}><Input ltr type="number" min={0} step="0.01" value={v.price} onChange={(e) => set('price', e.target.value)} /></Field>}
          {v.isPaid && w.format === 'MULTI' && (
            <Field label="סוג המחיר"><Select value={v.priceType} onChange={(e) => set('priceType', e.target.value)}>{Object.entries(priceTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          )}
          <div className="hidden lg:block" />
          <Field label="סטטוס">
            <Select value={v.status} onChange={(e) => set('status', e.target.value as Workshop['status'])}>
              {Object.entries(statusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Checkbox label="הרשמה פתוחה" checked={v.registrationOpen} onChange={(c) => set('registrationOpen', c)} />
          <Checkbox label="משויך לביטוח לאומי" checked={v.nationalInsurance} onChange={(c) => set('nationalInsurance', c)} />
        </div>
        <Button type="submit" variant="primary" loading={mut.isPending}>שמירת שינויים</Button>
      </form>
    </Card>
  );
}

function RegistrationSettingsTab({ w }: { w: Workshop }) {
  const all = useQuery({ queryKey: ['workshops', 'all'], queryFn: () => api.get<Workshop[]>('/workshops') });
  const init = () => ({
    registrationOpen: w.registrationOpen, registrationMode: w.registrationMode as string, autoCloseRegistration: w.autoCloseRegistration,
    genderRestriction: w.genderRestriction ?? '', minAge: w.minAge == null ? '' : String(w.minAge), maxAge: w.maxAge == null ? '' : String(w.maxAge),
    requireNationalInsurance: w.requireNationalInsurance, excludeId: w.excludeParticipantsOfWorkshopId == null ? '' : String(w.excludeParticipantsOfWorkshopId),
    rejectMessage: w.rejectMessage ?? '', closedMessage: w.closedMessage ?? '', completionMessage: w.completionMessage ?? '',
  });
  const [v, setV] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setV(init()), [JSON.stringify(w)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => { setV((p) => ({ ...p, [k]: val })); setErrors((p) => ({ ...p, [k]: '' })); };
  const mut = useAction((p: Record<string, unknown>) => save(w.id, p), {
    success: 'הגדרות ההרשמה נשמרו',
    silentCodes: ['VALIDATION'],
    onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (v.minAge && v.maxAge && Number(v.minAge) > Number(v.maxAge)) e.maxAge = 'גיל מקסימלי קטן מהגיל המינימלי';
    setErrors(e);
    if (Object.keys(e).length) return;
    const { excludeId, ...rest } = v;
    mut.mutate({ ...rest, minAge: v.minAge === '' ? null : Number(v.minAge), maxAge: v.maxAge === '' ? null : Number(v.maxAge), excludeParticipantsOfWorkshopId: excludeId === '' ? null : Number(excludeId) });
  };
  const isEvent = w.kind === 'EVENT';
  return (
    <Card className="max-w-3xl p-5">
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!mut.isPending) submit(); }} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="חובת רישום" hint={isEvent ? undefined : 'בסדנאות תמיד חובה להירשם'}>
            {isEvent ? (
              <Select value={v.registrationMode} onChange={(e) => set('registrationMode', e.target.value)}>
                {Object.entries(registrationModeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            ) : (
              <Input disabled readOnly value={registrationModeLabel.REQUIRED} />
            )}
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-2">
            <Checkbox label="הרשמה פתוחה" checked={v.registrationOpen} onChange={(c) => set('registrationOpen', c)} />
            {w.format === 'MULTI' && <Checkbox label="לסגור את הרישום אוטומטית עם תחילת הסדנה" checked={v.autoCloseRegistration} onChange={(c) => set('autoCloseRegistration', c)} />}
          </div>
        </div>
        <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">הגבלת משתתפים לפי קריטריון</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="לפי מגדר">
              <Select value={v.genderRestriction} onChange={(e) => set('genderRestriction', e.target.value)}>
                <option value="">ללא הגבלה</option>
                <option value="FEMALE">{genderLabel.FEMALE} בלבד</option>
                <option value="MALE">{genderLabel.MALE} בלבד</option>
              </Select>
            </Field>
            <Field label="גיל מינימלי" error={errors.minAge}><Input ltr type="number" min={0} max={120} value={v.minAge} onChange={(e) => set('minAge', e.target.value)} /></Field>
            <Field label="גיל מקסימלי" error={errors.maxAge}><Input ltr type="number" min={0} max={120} value={v.maxAge} onChange={(e) => set('maxAge', e.target.value)} /></Field>
          </div>
          <Checkbox label="חובה להשתייך לתכנית ביטוח לאומי" checked={v.requireNationalInsurance} onChange={(c) => set('requireNationalInsurance', c)} />
          <Field label="רק מי שלא השתתף בסדנה" hint="נבדק לפי נוכחות בפועל בסדנה שנבחרה">
            <Select value={v.excludeId} onChange={(e) => set('excludeId', e.target.value)}>
              <option value="">ללא הגבלה</option>
              {(all.data ?? []).filter((x) => x.id !== w.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
        </fieldset>
        <fieldset className="space-y-4 rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">הודעות לנרשמים באתר (אם לא ימולאו, יוצגו ברירות המחדל)</legend>
          <Field label="הודעת דחייה למי שלא מתאים לקריטריון"><Textarea className="min-h-16" value={v.rejectMessage} onChange={(e) => set('rejectMessage', e.target.value)} /></Field>
          <Field label="הודעה בסיום הרישום (שומרים לך מקום)"><Textarea className="min-h-16" value={v.completionMessage} onChange={(e) => set('completionMessage', e.target.value)} /></Field>
          <Field label="הודעה אחרי שהרישום נסגר"><Textarea className="min-h-16" value={v.closedMessage} onChange={(e) => set('closedMessage', e.target.value)} /></Field>
        </fieldset>
        <InlineAlert tone="blue">הגיל מחושב לפי שנה נוכחית פחות שנת לידה, ולא לפי תאריך יום הולדת מדויק. כשחסר נתון שנדרש לבדיקה (שנת לידה או מגדר), ההרשמה נחסמת עד להשלמתו.</InlineAlert>
        <Button type="submit" variant="primary" loading={mut.isPending}>שמירה</Button>
      </form>
    </Card>
  );
}

function SummaryTab({ w }: { w: Workshop }) {
  const [text, setText] = useState(w.summary ?? '');
  useEffect(() => setText(w.summary ?? ''), [w.summary]);
  const mut = useAction(() => save(w.id, { summary: text }), { success: 'הסיכום נשמר' });
  return (
    <Card className="p-5">
      <Field label="סיכום ומסקנות">
        <Textarea className="min-h-48" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button variant="primary" className="mt-4" loading={mut.isPending} disabled={text === (w.summary ?? '')} onClick={() => mut.mutate(undefined)}>
        שמירה
      </Button>
    </Card>
  );
}

export default function WorkshopCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const [tab, setTab] = useState('general');
  const [attendanceSession, setAttendanceSession] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const { data: w, isLoading, error, refetch } = useQuery({ queryKey: ['workshop', id], queryFn: () => api.get<Workshop>(`/workshops/${id}`) });
  const publish = useAction(() => api.post(`/workshops/${id}/publish`), { success: 'הסטטוס עודכן ל"מפורסם באתר"', onSuccess: () => setPublishing(false) });

  if (isLoading) return <Spinner />;
  if (error || !w) return <ErrorBlock error={error ?? new Error('הסדנה לא נמצאה')} onRetry={() => refetch()} />;

  const tabs = [
    { value: 'general', label: 'פרטים כלליים' },
    { value: 'settings', label: 'הגדרות הרשמה' },
    { value: 'questions', label: 'שאלות הרשמה' },
    { value: 'registrants', label: `נרשמים (${w.registrantCount})` },
    { value: 'sessions', label: 'מפגשים' },
    { value: 'attendance', label: 'נוכחות' },
    { value: 'waitlist', label: 'רשימת המתנה', future: true },
    { value: 'reminders', label: 'תזכורות', future: true },
    { value: 'finance', label: 'כספים', future: true },
    { value: 'summary', label: 'סיכום ומסקנות' },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'סדנאות ואירועים', to: '/workshops' }, { label: w.name }]}
        title={w.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone="teal">{kindLabel[w.kind]}</Badge>
            <Badge tone={statusTone(w.status)}>{statusLabel[w.status]}</Badge>
            {w.registrationOpen ? <Badge tone="green">רישום פתוח</Badge> : <Badge>רישום סגור</Badge>}
            <span>{fmtDateRange(w.startDate, w.endDate)}</span>
            {w.facilitator && <span>מנחה: {w.facilitator}</span>}
            <span>{w.isPaid ? fmtMoney(w.price) : 'ללא תשלום'}</span>
          </span>
        }
        actions={
          <>
            {w.status === 'DRAFT' && (
              <Button variant="primary" onClick={() => setPublishing(true)}>
                <Send className="size-4" aria-hidden /> פרסם באתר
              </Button>
            )}
            <Button onClick={() => window.open(`/register/${w.id}`, '_blank')}>
              <ExternalLink className="size-4" aria-hidden /> פתח דף רישום לדוגמה
            </Button>
            <Button onClick={() => nav('/workshops')}>
              <ArrowRight className="size-4" aria-hidden /> חזרה לרשימה
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="general"><GeneralTab w={w} /></TabsContent>
        <TabsContent value="settings"><RegistrationSettingsTab w={w} /></TabsContent>
        <TabsContent value="questions"><QuestionsTab workshop={w} /></TabsContent>
        <TabsContent value="registrants"><RegistrantsTab workshop={w} /></TabsContent>
        <TabsContent value="sessions">
          <SessionsTab workshop={w} onOpenAttendance={(sid) => { setAttendanceSession(sid); setTab('attendance'); }} />
        </TabsContent>
        <TabsContent value="attendance"><AttendanceTab workshop={w} initialSessionId={attendanceSession} /></TabsContent>
        <TabsContent value="waitlist"><FutureNotice title="רשימת המתנה" text="מודול רשימת ההמתנה יפותח בהמשך" /></TabsContent>
        <TabsContent value="reminders"><FutureNotice title="תזכורות" text="בפיתוח עתידי. במערכת זו לא נשלחות הודעות SMS או מייל." /></TabsContent>
        <TabsContent value="finance"><FutureNotice title="כספים" text="בפיתוח עתידי. מחיר הסדנה נשמר בפרטים הכלליים, ללא סליקה או הנהלת חשבונות." /></TabsContent>
        <TabsContent value="summary"><SummaryTab w={w} /></TabsContent>
      </Tabs>

      <Dialog
        open={publishing}
        onOpenChange={setPublishing}
        title="פרסום באתר (הדגמה)"
        description='הפעולה משנה את הסטטוס ל"מפורסם באתר" בתוך המערכת בלבד. מדובר בפרסום מדומה לצורך ה-POC, ולא יפורסם דבר באתר חיצוני.'
        footer={
          <>
            <Button variant="primary" loading={publish.isPending} onClick={() => publish.mutate(undefined)}>פרסם</Button>
            <Button onClick={() => setPublishing(false)} disabled={publish.isPending}>ביטול</Button>
          </>
        }
      />
    </>
  );
}
