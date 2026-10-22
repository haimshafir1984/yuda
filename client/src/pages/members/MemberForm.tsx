import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Field, InlineAlert, Input, Select } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { maritalLabel, todayStr } from '../../lib/format';
import type { Member } from '../../lib/types';

export interface MemberFormValues {
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  email: string;
  nationalId: string;
  birthYear: string;
  maritalStatus: string;
  nationalInsurance: boolean;
  preferredChannel: string;
  joinDate: string;
}

export const emptyMember = (): MemberFormValues => ({
  firstName: '',
  lastName: '',
  gender: '',
  phone: '',
  email: '',
  nationalId: '',
  birthYear: '',
  maritalStatus: '',
  nationalInsurance: false,
  preferredChannel: 'SMS',
  joinDate: todayStr(),
});

export const fromMember = (m: Member): MemberFormValues => ({
  firstName: m.firstName,
  lastName: m.lastName,
  gender: m.gender ?? '',
  phone: m.phone,
  email: m.email ?? '',
  nationalId: m.nationalId ?? '',
  birthYear: m.birthYear ? String(m.birthYear) : '',
  maritalStatus: m.maritalStatus ?? '',
  nationalInsurance: m.nationalInsurance,
  preferredChannel: m.preferredChannel,
  joinDate: m.joinDate,
});

function validate(v: MemberFormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.firstName.trim()) e.firstName = 'שם פרטי הוא שדה חובה';
  if (!v.lastName.trim()) e.lastName = 'שם משפחה הוא שדה חובה';
  if (!v.phone.trim()) e.phone = 'טלפון הוא שדה חובה';
  else if (v.phone.replace(/\D/g, '').length < 9) e.phone = 'מספר טלפון לא תקין';
  if (v.email.trim() && !/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = 'כתובת מייל לא תקינה';
  if (v.nationalId.trim() && !/^\d{5,9}$/.test(v.nationalId.trim())) e.nationalId = 'תעודת זהות חייבת להכיל 5 עד 9 ספרות';
  if (v.birthYear.trim()) {
    const y = Number(v.birthYear);
    if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) e.birthYear = 'שנת לידה לא תקינה';
  }
  return e;
}

const toPayload = (v: MemberFormValues, allowDuplicatePhone: boolean) => ({
  ...v,
  birthYear: v.birthYear.trim() ? Number(v.birthYear) : null,
  allowDuplicatePhone,
});

export default function MemberForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial: MemberFormValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (payload: ReturnType<typeof toPayload>) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<{ id: number; fullName: string } | null>(null);
  const set = <K extends keyof MemberFormValues>(k: K, val: MemberFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: '' }));
    if (k === 'phone') setDup(null);
  };

  const submit = async (allowDup: boolean) => {
    const errs = validate(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await onSubmit(toPayload(v, allowDup));
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'DUPLICATE_PHONE') setDup(e.details.existing);
        else if (e.code === 'DUPLICATE_NATIONAL_ID') setErrors((p) => ({ ...p, nationalId: e.message }));
        else if (e.code === 'VALIDATION') setErrors((p) => ({ ...p, ...e.fields }));
      }
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void submit(false);
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="שם פרטי" required error={errors.firstName}>
          <Input value={v.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="שם משפחה" required error={errors.lastName}>
          <Input value={v.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="מגדר">
          <Select value={v.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">לא צוין</option>
            <option value="MALE">גבר</option>
            <option value="FEMALE">אישה</option>
          </Select>
        </Field>
        <Field label="טלפון" required error={errors.phone}>
          <Input ltr type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </Field>
        <Field label="מייל" error={errors.email}>
          <Input ltr type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="תעודת זהות" error={errors.nationalId}>
          <Input ltr inputMode="numeric" value={v.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
        </Field>
        <Field label="שנת לידה" error={errors.birthYear}>
          <Input ltr inputMode="numeric" value={v.birthYear} onChange={(e) => set('birthYear', e.target.value)} placeholder="לדוגמה 1955" />
        </Field>
        <Field label="מצב משפחתי">
          <Select value={v.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}>
            <option value="">לא צוין</option>
            {Object.entries(maritalLabel).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="ערוץ תקשורת מועדף">
          <Select value={v.preferredChannel} onChange={(e) => set('preferredChannel', e.target.value)}>
            <option value="SMS">SMS</option>
            <option value="EMAIL">מייל</option>
          </Select>
        </Field>
        <Field label="תאריך הצטרפות">
          <Input type="date" value={v.joinDate} onChange={(e) => set('joinDate', e.target.value)} />
        </Field>
      </div>
      <Checkbox label="שייך לתכנית ביטוח לאומי" checked={v.nationalInsurance} onChange={(c) => set('nationalInsurance', c)} />

      {dup && (
        <InlineAlert tone="amber">
          <p>
            מספר הטלפון כבר קיים במערכת אצל{' '}
            <Link className="font-medium underline" to={`/members/${dup.id}`} target="_blank">
              {dup.fullName}
            </Link>
            . הרשומות לא ימוזגו אוטומטית.
          </p>
          <Button size="sm" className="mt-2" onClick={() => void submit(true)} loading={saving}>
            שמור בכל זאת כחבר נפרד
          </Button>
        </InlineAlert>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={saving}>
            ביטול
          </Button>
        )}
      </div>
    </form>
  );
}
