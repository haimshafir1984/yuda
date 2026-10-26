import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';
import { priceTypeLabel, registrationModeLabel } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import type { Workshop } from '../../lib/types';

export default function WorkshopCreate() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'EVENT' ? 'EVENT' : 'WORKSHOP';
  const label = kind === 'EVENT' ? 'אירוע' : 'סדנה';

  const [v, setV] = useState({
    name: '', subtitle: '', description: '', facilitator: '', format: 'SINGLE', startDate: '', startTime: '', endTime: '',
    sessionCount: '3', isPaid: false, price: '', priceType: 'FIXED', registrationMode: 'REQUIRED', nationalInsurance: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: '' }));
  };

  const create = useAction(
    (payload: unknown) => api.post<Workshop>('/workshops', payload),
    {
      success: `ה${label} נוצר${kind === 'EVENT' ? '' : 'ה'} בהצלחה`,
      silentCodes: ['VALIDATION'],
      onSuccess: (w) => nav(`/workshops/${w.id}`),
      onError: (e: ApiError) => e.code === 'VALIDATION' && setErrors(e.fields),
    },
  );

  const multi = kind === 'WORKSHOP' && v.format === 'MULTI';
  const submit = () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'שם הוא שדה חובה';
    if (v.isPaid && !(Number(v.price) > 0)) e.price = 'יש להזין מחיר לסדנה בתשלום';
    if (v.startTime && v.endTime && v.endTime <= v.startTime) e.endTime = 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
    if (multi && v.startDate && !(Number(v.sessionCount) >= 1)) e.sessionCount = 'יש להזין מספר מפגשים';
    setErrors(e);
    if (Object.keys(e).length) return;
    create.mutate({
      kind,
      name: v.name,
      subtitle: v.subtitle,
      description: v.description,
      facilitator: v.facilitator,
      format: kind === 'EVENT' ? 'SINGLE' : v.format,
      startDate: v.startDate,
      startTime: v.startTime,
      endTime: v.endTime,
      sessionCount: multi ? Number(v.sessionCount) : 1,
      isPaid: v.isPaid,
      price: v.isPaid ? Number(v.price) : null,
      priceType: v.priceType,
      registrationMode: kind === 'EVENT' ? v.registrationMode : 'REQUIRED',
      nationalInsurance: v.nationalInsurance,
    });
  };

  return (
    <>
      <PageHeader title={`${label} חד${kind === 'EVENT' ? 'ש' : 'שה'}`} subtitle="ניתן ליצור טיוטה גם כשלא כל המועדים ידועים" breadcrumbs={[{ label: 'סדנאות ואירועים', to: '/workshops' }, { label: `${label} חד${kind === 'EVENT' ? 'ש' : 'שה'}` }]} />
      <Card className="p-5">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!create.isPending) submit();
          }}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`שם ה${label}`} required error={errors.name} className="sm:col-span-2">
              <Input value={v.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="כותרת משנה" className="sm:col-span-2">
              <Input value={v.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
            </Field>
            <Field label="תיאור" className="sm:col-span-2">
              <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="מנחה" hint="שם חופשי">
              <Input value={v.facilitator} onChange={(e) => set('facilitator', e.target.value)} />
            </Field>
            {kind === 'WORKSHOP' && (
              <Field label="מבנה הסדנה">
                <Select value={v.format} onChange={(e) => set('format', e.target.value)}>
                  <option value="SINGLE">חד-פעמית</option>
                  <option value="MULTI">מרובת מפגשים</option>
                </Select>
              </Field>
            )}
            <Field label={multi ? 'תאריך המפגש הראשון' : 'תאריך'} hint="אפשר להשאיר ריק ולהשלים מאוחר יותר">
              <Input type="date" value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            {multi && (
              <Field label="מספר מפגשים" error={errors.sessionCount} hint="המפגשים ייווצרו בהפרש שבועי, וניתן לתקן אותם בכרטיס">
                <Input ltr type="number" min={1} max={60} value={v.sessionCount} onChange={(e) => set('sessionCount', e.target.value)} />
              </Field>
            )}
            <Field label="שעת התחלה">
              <Input type="time" value={v.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </Field>
            <Field label="שעת סיום" error={errors.endTime}>
              <Input type="time" value={v.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </Field>
            <Field label="תשלום">
              <Select value={v.isPaid ? 'PAID' : 'FREE'} onChange={(e) => set('isPaid', e.target.value === 'PAID')}>
                <option value="FREE">בחינם</option>
                <option value="PAID">בתשלום</option>
              </Select>
            </Field>
            {v.isPaid && (
              <Field label="מחיר בשקלים" required error={errors.price}>
                <Input ltr type="number" min={0} step="0.01" value={v.price} onChange={(e) => set('price', e.target.value)} />
              </Field>
            )}
            {v.isPaid && multi && (
              <Field label="סוג המחיר"><Select value={v.priceType} onChange={(e) => set('priceType', e.target.value)}>{Object.entries(priceTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            )}
            {kind === 'EVENT' && (
              <Field label="חובת רישום"><Select value={v.registrationMode} onChange={(e) => set('registrationMode', e.target.value)}>{Object.entries(registrationModeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            )}
          </div>
          <Checkbox label={`ה${label} משויך לביטוח לאומי`} checked={v.nationalInsurance} onChange={(c) => set('nationalInsurance', c)} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={create.isPending}>שמירה ומעבר לכרטיס</Button>
            <Button onClick={() => nav('/workshops')} disabled={create.isPending}>ביטול</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
