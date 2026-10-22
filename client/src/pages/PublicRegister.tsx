import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorBlock, Field, InlineAlert, Input, Select, Spinner, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { fmtDateRange, fmtMoney, fmtTimeRange, kindLabel } from '../lib/format';
import type { PublicWorkshop } from '../lib/types';

/**
 * דף רישום ציבורי להדגמה בלבד. הזדהות לפי מספר טלפון אינה אימות זהות מאובטח,
 * ולכן הדף אינו מציג פרטי חבר, ואינו מאפשר ביטול, צפייה או עריכה.
 */
export default function PublicRegister() {
  const id = Number(useParams().id);
  const w = useQuery({ queryKey: ['public-workshop', id], queryFn: () => api.get<PublicWorkshop>(`/public/workshops/${id}`) });
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'questions' | 'done'>('phone');
  const [answers, setAnswers] = useState<Record<number, { text: string; optionId: number | null }>>({});
  const [qErrors, setQErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState('');

  const check = useMutation({
    mutationFn: () => api.post(`/public/workshops/${id}/check`, { phone }),
    onSuccess: () => {
      setError(null);
      if (w.data?.questions.length) setStep('questions');
      else void submit.mutate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב'),
  });
  const submit = useMutation({
    mutationFn: () =>
      api.post(`/public/workshops/${id}/register`, {
        phone,
        answers: (w.data?.questions ?? []).map((q) => ({ questionId: q.id, textValue: answers[q.id]?.text ?? '', optionId: answers[q.id]?.optionId ?? null })),
      }),
    onSuccess: () => setStep('done'),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ANSWERS_INVALID') setQErrors(e.details?.errors ?? {});
      else {
        setError(e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב');
        setStep('phone');
      }
    },
  });

  const onPhone = () => {
    if (phone.replace(/\D/g, '').length < 9) return setPhoneError('יש להזין מספר טלפון תקין');
    setPhoneError('');
    setError(null);
    check.mutate();
  };
  const onConfirm = () => {
    const errs: Record<number, string> = {};
    for (const q of w.data?.questions ?? []) {
      const a = answers[q.id];
      if (q.required && (q.type === 'TEXT' ? !a?.text.trim() : !a?.optionId)) errs[q.id] = 'שאלת חובה';
    }
    setQErrors(errs);
    if (!Object.keys(errs).length) submit.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
        דף הדגמה (POC): אינו אתר אמיתי, ללא אימות זהות מאובטח וללא תשלום
      </div>
      <main className="mx-auto max-w-xl px-4 py-8">
        <p className="mb-4 text-center text-lg font-bold text-teal-700">החצר של יודה</p>
        {w.isLoading ? <Spinner /> : w.error || !w.data ? <ErrorBlock error={w.error ?? new Error('הדף לא נמצא')} /> : (
          <Card className="space-y-5 p-6">
            <div>
              <Badge tone="teal">{kindLabel[w.data.kind]}</Badge>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{w.data.name}</h1>
              {w.data.subtitle && <p className="text-slate-600">{w.data.subtitle}</p>}
            </div>
            {w.data.description && <p className="whitespace-pre-line text-sm text-slate-700">{w.data.description}</p>}
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm">
              <div><dt className="text-xs text-slate-500">תאריך</dt><dd>{fmtDateRange(w.data.startDate, w.data.endDate)}</dd></div>
              <div><dt className="text-xs text-slate-500">שעה</dt><dd>{fmtTimeRange(w.data.startTime, w.data.endTime)}</dd></div>
              {w.data.sessionCount > 1 && <div><dt className="text-xs text-slate-500">מספר מפגשים</dt><dd>{w.data.sessionCount}</dd></div>}
              <div><dt className="text-xs text-slate-500">מחיר</dt><dd>{w.data.isPaid ? fmtMoney(w.data.price) : 'ללא תשלום'}</dd></div>
              <div><dt className="text-xs text-slate-500">מצב הרשמה</dt><dd>{w.data.registrationOpen ? <Badge tone="green">ההרשמה פתוחה</Badge> : <Badge tone="red">{w.data.closedReason}</Badge>}</dd></div>
            </dl>
            {w.data.isPaid && <InlineAlert tone="blue">תשלום יתווסף בשלב הבא. ההרשמה בדף זה היא לצורך הדגמה בלבד, ולא מתבצע בה חיוב ואינה מסומנת כמשולמת.</InlineAlert>}

            {step === 'done' ? (
              <div role="status" className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
                <p className="text-lg font-semibold text-slate-900">ההרשמה התקבלה בהצלחה</p>
                <p className="text-sm text-slate-600">ההרשמה נקלטה במערכת ה-CRM (הדגמת POC בלבד).</p>
              </div>
            ) : !w.data.registrationRequired ? (
              <InlineAlert tone="blue">אין צורך בהרשמה מראש לפעילות זו.</InlineAlert>
            ) : !w.data.registrationOpen ? (
              <InlineAlert tone="amber">לא ניתן להירשם כרגע: {w.data.closedReason}.</InlineAlert>
            ) : step === 'phone' ? (
              <form noValidate onSubmit={(e) => { e.preventDefault(); if (!check.isPending) onPhone(); }} className="space-y-3">
                <Field label="מספר טלפון של חבר/ה" error={phoneError} hint="ההרשמה מיועדת לחברי הארגון בלבד">
                  <Input ltr type="tel" autoFocus value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }} placeholder="050-0000000" />
                </Field>
                {error && <InlineAlert tone="red">{error}</InlineAlert>}
                <Button type="submit" variant="primary" loading={check.isPending || submit.isPending} className="w-full">המשך להרשמה</Button>
              </form>
            ) : (
              <div className="space-y-4">
                <h2 className="font-semibold text-slate-900">שאלות הרשמה</h2>
                {w.data.questions.map((q) => (
                  <Field key={q.id} label={q.text} required={q.required} error={qErrors[q.id]}>
                    {q.type === 'TEXT' ? (
                      <Textarea className="min-h-16" value={answers[q.id]?.text ?? ''} onChange={(e) => { setAnswers({ ...answers, [q.id]: { text: e.target.value, optionId: null } }); setQErrors({ ...qErrors, [q.id]: '' }); }} />
                    ) : (
                      <Select value={answers[q.id]?.optionId ?? ''} onChange={(e) => { setAnswers({ ...answers, [q.id]: { text: '', optionId: e.target.value ? Number(e.target.value) : null } }); setQErrors({ ...qErrors, [q.id]: '' }); }}>
                        <option value="">בחירה...</option>
                        {q.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </Select>
                    )}
                  </Field>
                ))}
                <div className="flex gap-2">
                  <Button variant="primary" loading={submit.isPending} onClick={onConfirm}>אישור הרשמה</Button>
                  <Button disabled={submit.isPending} onClick={() => setStep('phone')}>חזרה</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
