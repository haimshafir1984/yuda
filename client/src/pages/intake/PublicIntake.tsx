import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Checkbox, ErrorBlock, Field, InlineAlert, Input, Select, Spinner, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { maritalLabel } from '../../lib/format';
import {
  challengeLabel, communityOptions, degreeTypeLabel, educationLabel, howHeardOptions, jobPercentLabel, leavingTimeLabel, livesWithLabel, nowDoingLabel, serviceLabel, studyKindLabel, wantsLabel,
} from '../../lib/intake';

/** מעטפת לדפים הציבוריים של תהליך הקבלה: טופס הצטרפות, תגובה להזמנה ושאלון היכרות */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">דף הדגמה (POC): הנתונים נשמרים במערכת ההדגמה בלבד</div>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="mb-4 text-center text-lg font-bold text-teal-700">החצר של יודה</p>
        {children}
      </main>
    </div>
  );
}

const Done = ({ title, text }: { title: string; text: string }) => (
  <div role="status" className="flex flex-col items-center gap-2 py-6 text-center">
    <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
    <p className="text-lg font-semibold text-slate-900">{title}</p>
    <p className="text-sm text-slate-600">{text}</p>
  </div>
);

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>);

// ======================= טופס הצטרפות =======================

const emptyJoin = { firstName: '', lastName: '', nationalId: '', birthDate: '', gender: '', maritalStatus: '', childrenCount: '', phone: '', email: '', preferredChannel: 'SMS', community: '', elementarySchool: '', highSchool: '', howHeard: '', whyJoin: '', anythingElse: '', website: '' };

export function JoinPage() {
  const [f, setF] = useState(emptyJoin);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof emptyJoin, v: string) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: '' })); };
  const send = useMutation({
    mutationFn: () => api.post('/public/join', f),
    onSuccess: () => setDone(true),
    onError: (e) => setErrors(e instanceof ApiError && e.code === 'VALIDATION' ? e.fields : { _: e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב' }),
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = 'שם פרטי הוא שדה חובה';
    if (!f.lastName.trim()) e.lastName = 'שם משפחה הוא שדה חובה';
    if (!f.birthDate) e.birthDate = 'תאריך לידה הוא שדה חובה';
    if (f.phone.replace(/\D/g, '').length < 9) e.phone = 'יש להזין מספר טלפון תקין';
    setErrors(e);
    if (!Object.keys(e).length) send.mutate();
  };

  return (
    <Shell>
      <Card className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">בקשת הצטרפות</h1>
          <p className="mt-1 text-sm text-slate-600">נשמח להכיר. מלאו את הפרטים ונחזור אליכם.</p>
        </div>
        {done ? (
          <Done title="הבקשה התקבלה" text="תודה! נבדוק את הפרטים ונחזור אליך בהודעה." />
        ) : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!send.isPending) submit(); }} className="space-y-4">
            <h2 className="font-semibold text-slate-900">פרטים אישיים</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם פרטי" required error={errors.firstName}><Input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
              <Field label="שם משפחה" required error={errors.lastName}><Input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
              <Field label="תעודת זהות" error={errors.nationalId}><Input ltr inputMode="numeric" value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} /></Field>
              <Field label="תאריך לידה" required error={errors.birthDate}><Input type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
              <Field label="מין"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)}><option value="">בחירה</option><option value="FEMALE">אישה</option><option value="MALE">גבר</option></Select></Field>
              <Field label="סטטוס משפחתי"><Select value={f.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}><option value="">בחירה</option>{opts(maritalLabel)}</Select></Field>
              <Field label="מספר ילדים (אם רלוונטי)" error={errors.childrenCount}><Input ltr type="number" min={0} value={f.childrenCount} onChange={(e) => set('childrenCount', e.target.value)} /></Field>
            </div>
            <h2 className="font-semibold text-slate-900">פרטי התקשרות</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="טלפון" required error={errors.phone}><Input ltr type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" /></Field>
              <Field label="מייל" error={errors.email}><Input ltr type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="איך נוח לך לקבל הודעות מאיתנו?"><Select value={f.preferredChannel} onChange={(e) => set('preferredChannel', e.target.value)}><option value="SMS">הודעת SMS</option><option value="EMAIL">מייל</option></Select></Field>
            </div>
            <h2 className="font-semibold text-slate-900">היציאה</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="באיזו קהילה חרדית גדלת?"><Select value={f.community} onChange={(e) => set('community', e.target.value)}><option value="">בחירה</option>{communityOptions.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
              <Field label="באיזה בית ספר יסודי למדת?"><Input value={f.elementarySchool} onChange={(e) => set('elementarySchool', e.target.value)} /></Field>
              <Field label="באיזה תיכון / ישיבה למדת?"><Input value={f.highSchool} onChange={(e) => set('highSchool', e.target.value)} /></Field>
            </div>
            <h2 className="font-semibold text-slate-900">ההצטרפות</h2>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">איך שמעת עלינו?</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {Object.entries(howHeardOptions).map(([k, l]) => (
                  <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="radio" name="howHeard" className="size-4 accent-teal-600" checked={f.howHeard === k} onChange={() => set('howHeard', k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
            <Field label="מה מביא אותך להצטרף ל'חצר של יודה'?"><Textarea className="min-h-24" value={f.whyJoin} onChange={(e) => set('whyJoin', e.target.value)} /></Field>
            <Field label="האם יש עוד משהו שכדאי שנדע?"><Textarea className="min-h-20" value={f.anythingElse} onChange={(e) => set('anythingElse', e.target.value)} /></Field>
            {/* שדה פיתיון לבוטים: מוסתר מאנשים */}
            <div aria-hidden className="absolute -start-[9999px]"><label>אל תמלאו שדה זה<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} /></label></div>
            {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
            <Button type="submit" variant="primary" loading={send.isPending} className="w-full">שליחת הבקשה</Button>
          </form>
        )}
      </Card>
    </Shell>
  );
}

// ======================= תגובה להזמנה (ראיון קבוצתי / פגישה אישית) =======================

interface InvitationInfo { kind: 'GROUP' | 'PERSONAL'; firstName: string; state: 'OPEN' | 'SIGNED' | 'CLOSED'; options: { value: string; label: string }[]; chosen: string | null }

export function InvitationPage() {
  const token = String(useParams().token);
  const q = useQuery({ queryKey: ['public-invitation', token], queryFn: () => api.get<InvitationInfo>(`/public/invitations/${token}`), retry: false });
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<'signed' | 'note' | null>(null);
  const [error, setError] = useState('');
  const send = useMutation({
    mutationFn: (body: { choice?: string; note?: string }) => api.post<{ signed: boolean }>(`/public/invitations/${token}/respond`, body),
    onSuccess: (r) => { setResult(r.signed ? 'signed' : 'note'); void q.refetch(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב'),
  });

  return (
    <Shell>
      <Card className="space-y-5 p-6">
        {q.isLoading ? <Spinner /> : q.error || !q.data ? <ErrorBlock error={q.error ?? new Error('ההזמנה לא נמצאה')} /> : (() => {
          const i = q.data;
          const what = i.kind === 'GROUP' ? 'מפגש ההיכרות הקבוצתי' : 'הפגישה האישית';
          if (result === 'signed' || i.state === 'SIGNED') return <Done title="נרשמת!" text={`${what} נקבע. שלחנו לך הודעת אישור, ונשלח תזכורת לפני המפגש.`} />;
          if (result === 'note') return <Done title="תודה, קיבלנו" text="ההערה שלך הועברה אלינו, ונחזור אליך." />;
          if (i.state === 'CLOSED') return <InlineAlert tone="amber">ההזמנה כבר אינה בתוקף. אפשר לפנות אלינו ונמצא פתרון.</InlineAlert>;
          return (
            <>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">שלום {i.firstName}</h1>
                <p className="mt-1 text-sm text-slate-600">{i.kind === 'GROUP' ? 'בחר/י את מועד מפגש ההיכרות שנוח לך:' : 'בחר/י את מועד הפגישה האישית שנוח לך:'}</p>
              </div>
              {i.options.length ? (
                <fieldset className="space-y-2">
                  <legend className="sr-only">מועדים</legend>
                  {i.options.map((o) => (
                    <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50">
                      <input type="radio" name="slot" className="size-4 accent-teal-600" checked={choice === o.value} onChange={() => { setChoice(o.value); setError(''); }} /> {o.label}
                    </label>
                  ))}
                  <Button variant="primary" className="w-full" loading={send.isPending} onClick={() => (choice ? send.mutate({ choice }) : setError('יש לבחור מועד'))}>אישור השתבצות</Button>
                </fieldset>
              ) : <InlineAlert tone="amber">אין כרגע מועדים זמינים. אפשר לכתוב לנו הערה.</InlineAlert>}
              <div className="space-y-2 border-t border-slate-200 pt-4">
                <Field label="לא מתאים אף מועד? אפשר לכתוב לנו הערה"><Textarea className="min-h-20" value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} /></Field>
                <Button loading={send.isPending} onClick={() => (note.trim() ? send.mutate({ note }) : setError('יש לכתוב הערה'))}>שליחת הערה</Button>
              </div>
              {error && <InlineAlert tone="red">{error}</InlineAlert>}
            </>
          );
        })()}
      </Card>
    </Shell>
  );
}

// ======================= שאלון היכרות =======================

const blankQ = {
  nowDoing: '', workplace: '', jobPercent: '', jobPercentOther: '', jobRole: '', degreeType: '', studyField: '', institution: '', studyingWhat: '', studyFramework: '', studyKind: '',
  serviceRole: '', nowOther: '', education: '', educationField: '', educationOther: '', service: '', serviceOther: '', address: '', livesWith: [] as string[], grewUpIn: '', siblings: '',
  familyPosition: '', familyRelation: '', leavingTime: '', leavingOther: '', hobbies: '', challenges: [] as string[], challengesOther: '', wants: [] as string[], wantsOther: '', anythingElse: '',
};

function Multi({ legend, labels, value, onChange }: { legend: string; labels: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{Object.entries(labels).map(([k, l]) => <Checkbox key={k} label={l} checked={value.includes(k)} onChange={(c) => onChange(c ? [...value, k] : value.filter((x) => x !== k))} />)}</div>
    </fieldset>
  );
}

export function QuestionnairePage() {
  const token = String(useParams().token);
  const q = useQuery({ queryKey: ['public-questionnaire', token], queryFn: () => api.get<{ firstName: string; fullName: string; filled: boolean; submittedAt: string }>(`/public/questionnaires/${token}`), retry: false });
  const [a, setA] = useState(blankQ);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof blankQ>(k: K, v: (typeof blankQ)[K]) => { setA((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: '' })); };
  const send = useMutation({
    mutationFn: () => api.post(`/public/questionnaires/${token}`, a),
    onSuccess: () => setDone(true),
    onError: (e) => setErrors(e instanceof ApiError && e.code === 'VALIDATION' ? e.fields : { _: e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב' }),
  });
  const working = ['WORKING', 'WORK_AND_STUDY'].includes(a.nowDoing);
  const studyDegree = a.nowDoing === 'STUDYING_DEGREE';
  const studyOther = a.nowDoing === 'STUDYING_OTHER';
  const both = a.nowDoing === 'WORK_AND_STUDY';
  const service = ['SOLDIER', 'NATIONAL_SERVICE'].includes(a.nowDoing);
  const studying = studyDegree || studyOther || both;
  const notStudying = !studying;

  return (
    <Shell>
      <Card className="space-y-5 p-6">
        {q.isLoading ? <Spinner /> : q.error || !q.data ? <ErrorBlock error={q.error ?? new Error('השאלון לא נמצא')} /> : q.data.filled || done ? (
          <Done title="תודה!" text="השאלון התקבל. נשמח להמשך היכרות." />
        ) : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!a.nowDoing) return setErrors({ nowDoing: 'יש לבחור מה את/ה עושה כיום' }); if (!send.isPending) send.mutate(); }} className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">שאלון היכרות</h1>
              <p className="mt-1 text-sm text-slate-600">{q.data.fullName}, תודה שהגעת. השאלון קצר, ואפשר לדלג על שאלות.</p>
            </div>
            <Field label="מה את/ה עושה כיום?" required error={errors.nowDoing}><Select value={a.nowDoing} onChange={(e) => set('nowDoing', e.target.value)}><option value="">בחירה</option>{opts(nowDoingLabel)}</Select></Field>
            {working && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="מקום עבודה"><Input value={a.workplace} onChange={(e) => set('workplace', e.target.value)} /></Field>
                <Field label="תפקיד בעבודה"><Input value={a.jobRole} onChange={(e) => set('jobRole', e.target.value)} /></Field>
                <Field label="אחוז משרה"><Select value={a.jobPercent} onChange={(e) => set('jobPercent', e.target.value)}><option value="">בחירה</option>{opts(jobPercentLabel)}</Select></Field>
                {a.jobPercent === 'OTHER' && <Field label="פירוט"><Input value={a.jobPercentOther} onChange={(e) => set('jobPercentOther', e.target.value)} /></Field>}
              </div>
            )}
            {both && <Field label="איזה סוג לימודים?"><Select value={a.studyKind} onChange={(e) => set('studyKind', e.target.value)}><option value="">בחירה</option>{opts(studyKindLabel)}</Select></Field>}
            {(studyDegree || (both && a.studyKind === 'DEGREE_OR_PREP')) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="סוג התואר"><Select value={a.degreeType} onChange={(e) => set('degreeType', e.target.value)}><option value="">בחירה</option>{opts(degreeTypeLabel)}</Select></Field>
                <Field label="תחום הלימודים"><Input value={a.studyField} onChange={(e) => set('studyField', e.target.value)} /></Field>
                <Field label="מוסד הלימודים"><Input value={a.institution} onChange={(e) => set('institution', e.target.value)} /></Field>
              </div>
            )}
            {(studyOther || (both && a.studyKind === 'CERTIFICATE_OR_OTHER')) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="מה את/ה לומד/ת?"><Input value={a.studyingWhat} onChange={(e) => set('studyingWhat', e.target.value)} /></Field>
                <Field label="מסגרת הלימודים"><Input value={a.studyFramework} onChange={(e) => set('studyFramework', e.target.value)} /></Field>
              </div>
            )}
            {service && <Field label="מה התפקיד שלך בשירות?"><Input value={a.serviceRole} onChange={(e) => set('serviceRole', e.target.value)} /></Field>}
            {a.nowDoing === 'OTHER' && <Field label="פירוט"><Input value={a.nowOther} onChange={(e) => set('nowOther', e.target.value)} /></Field>}
            {notStudying && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="מה ההשכלה הגבוהה ביותר שלך?"><Select value={a.education} onChange={(e) => set('education', e.target.value)}><option value="">בחירה</option>{opts(educationLabel)}</Select></Field>
                {['PROFESSIONAL', 'BACHELOR', 'MASTER_PLUS'].includes(a.education) && <Field label="באיזה תחום?"><Input value={a.educationField} onChange={(e) => set('educationField', e.target.value)} /></Field>}
                {a.education === 'OTHER' && <Field label="פירוט"><Input value={a.educationOther} onChange={(e) => set('educationOther', e.target.value)} /></Field>}
              </div>
            )}
            {!service && (
              <Field label="האם עשית שירות?"><Select value={a.service} onChange={(e) => set('service', e.target.value)}><option value="">בחירה</option>{opts(serviceLabel)}</Select></Field>
            )}
            <h2 className="font-semibold text-slate-900">מגורים ומשפחה</h2>
            <Field label="כתובת מגורים נוכחית"><Input value={a.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Multi legend="עם מי את/ה גר/ה כיום?" labels={livesWithLabel} value={a.livesWith} onChange={(v) => set('livesWith', v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="באיזה יישוב או עיר גדלת?"><Input value={a.grewUpIn} onChange={(e) => set('grewUpIn', e.target.value)} /></Field>
              <Field label="כמה אחים ואחיות אתם?" error={errors.siblings}><Input ltr type="number" min={0} value={a.siblings} onChange={(e) => set('siblings', e.target.value)} /></Field>
              <Field label="מה המיקום שלך במשפחה?"><Input value={a.familyPosition} onChange={(e) => set('familyPosition', e.target.value)} /></Field>
              <Field label="איך הקשר שלך עם המשפחה? (1 אין קשר, 5 קשר טוב)" error={errors.familyRelation}>
                <Select value={a.familyRelation} onChange={(e) => set('familyRelation', e.target.value)}><option value="">בחירה</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
              </Field>
            </div>
            <h2 className="font-semibold text-slate-900">רקע אישי</h2>
            <Field label="כמה זמן את/ה בתהליך היציאה מהחברה החרדית?"><Select value={a.leavingTime} onChange={(e) => set('leavingTime', e.target.value)}><option value="">בחירה</option>{opts(leavingTimeLabel)}</Select></Field>
            {a.leavingTime === 'OTHER' && <Field label="פירוט"><Input value={a.leavingOther} onChange={(e) => set('leavingOther', e.target.value)} /></Field>}
            <Field label="מה את/ה אוהב/ת לעשות בזמנך הפנוי?"><Textarea className="min-h-16" value={a.hobbies} onChange={(e) => set('hobbies', e.target.value)} /></Field>
            <Multi legend="איזה אתגרים עיקריים מעסיקים אותך כיום?" labels={challengeLabel} value={a.challenges} onChange={(v) => set('challenges', v)} />
            {a.challenges.includes('OTHER') && <Field label="פירוט"><Input value={a.challengesOther} onChange={(e) => set('challengesOther', e.target.value)} /></Field>}
            <h2 className="font-semibold text-slate-900">הצטרפות לחצר</h2>
            <Multi legend="מה את/ה רוצה למצוא בחצר של יודה?" labels={wantsLabel} value={a.wants} onChange={(v) => set('wants', v)} />
            {a.wants.includes('OTHER') && <Field label="פירוט"><Input value={a.wantsOther} onChange={(e) => set('wantsOther', e.target.value)} /></Field>}
            <Field label="יש משהו נוסף שתרצה/י להוסיף או לשתף?"><Textarea className="min-h-20" value={a.anythingElse} onChange={(e) => set('anythingElse', e.target.value)} /></Field>
            {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
            <Button type="submit" variant="primary" loading={send.isPending} className="w-full">שליחת השאלון</Button>
          </form>
        )}
      </Card>
    </Shell>
  );
}
