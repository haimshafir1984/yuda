import { z } from 'zod';
import { currentYear } from './lib/dates';
import { normalizePhone } from './lib/phone';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const timeStr = z.preprocess(emptyToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה').nullable().optional());
const optInt = (min: number, max: number, msg: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: msg }).int(msg).min(min, msg).max(max, msg).nullable().optional(),
  );
const optPrice = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number({ invalid_type_error: 'מחיר לא תקין' }).min(0, 'מחיר לא תקין').nullable().optional(),
);

export const GENDERS = ['MALE', 'FEMALE'] as const;
export const MARITAL = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'] as const;
export const CHANNELS = ['SMS', 'EMAIL'] as const;
export const WORKSHOP_STATUSES = ['DRAFT', 'PUBLISHED', 'ONGOING', 'FINISHED', 'CANCELLED'] as const;

export const memberSchema = z.object({
  firstName: z.string({ required_error: 'שם פרטי הוא שדה חובה' }).trim().min(1, 'שם פרטי הוא שדה חובה').max(60),
  lastName: z.string({ required_error: 'שם משפחה הוא שדה חובה' }).trim().min(1, 'שם משפחה הוא שדה חובה').max(60),
  gender: z.preprocess(emptyToNull, z.enum(GENDERS).nullable().optional()),
  phone: z
    .string({ required_error: 'טלפון הוא שדה חובה' })
    .trim()
    .min(1, 'טלפון הוא שדה חובה')
    .refine((v) => normalizePhone(v).length >= 9 && normalizePhone(v).length <= 12, 'מספר טלפון לא תקין'),
  email: z.preprocess(emptyToNull, z.string().trim().email('כתובת מייל לא תקינה').max(120).nullable().optional()),
  nationalId: z.preprocess(
    emptyToNull,
    z.string().trim().regex(/^\d{5,9}$/, 'תעודת זהות חייבת להכיל 5 עד 9 ספרות').nullable().optional(),
  ),
  birthYear: optInt(1900, currentYear(), 'שנת לידה לא תקינה'),
  maritalStatus: z.preprocess(emptyToNull, z.enum(MARITAL).nullable().optional()),
  nationalInsurance: z.boolean().optional(),
  preferredChannel: z.enum(CHANNELS).optional(),
  joinDate: dateStr.optional(),
  /** אישור המשתמש לשמירה למרות טלפון קיים אצל חבר אחר */
  allowDuplicatePhone: z.boolean().optional(),
});
export type MemberInput = z.infer<typeof memberSchema>;

export const workshopCreateSchema = z
  .object({
    kind: z.enum(['WORKSHOP', 'EVENT']),
    name: z.string({ required_error: 'שם הוא שדה חובה' }).trim().min(1, 'שם הוא שדה חובה').max(120),
    subtitle: optStr(200),
    description: optStr(5000),
    facilitator: optStr(120),
    format: z.enum(['SINGLE', 'MULTI']).default('SINGLE'),
    startDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
    startTime: timeStr,
    endTime: timeStr,
    sessionCount: optInt(1, 60, 'מספר מפגשים לא תקין'),
    isPaid: z.boolean().default(false),
    price: optPrice,
    priceType: z.enum(['FIXED', 'MONTHLY']).default('FIXED'),
    registrationMode: z.enum(['REQUIRED', 'NOT_NEEDED', 'RECOMMENDED']).default('REQUIRED'),
    nationalInsurance: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.isPaid && (v.price === null || v.price === undefined || v.price <= 0))
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'יש להזין מחיר לסדנה בתשלום' });
    if (v.startTime && v.endTime && v.endTime <= v.startTime)
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
  });

export const workshopUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'שם הוא שדה חובה').max(120),
    subtitle: optStr(200),
    description: optStr(5000),
    facilitator: optStr(120),
    startDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
    startTime: timeStr,
    endTime: timeStr,
    isPaid: z.boolean(),
    price: optPrice,
    nationalInsurance: z.boolean(),
    status: z.enum(WORKSHOP_STATUSES),
    registrationOpen: z.boolean(),
    registrationMode: z.enum(['REQUIRED', 'NOT_NEEDED', 'RECOMMENDED']),
    autoCloseRegistration: z.boolean(),
    priceType: z.enum(['FIXED', 'MONTHLY']),
    excludeParticipantsOfWorkshopId: z.preprocess((v) => (v === '' ? null : v), z.number().int().nullable().optional()),
    rejectMessage: optStr(500),
    closedMessage: optStr(500),
    completionMessage: optStr(500),
    genderRestriction: z.preprocess(emptyToNull, z.enum(GENDERS).nullable().optional()),
    minAge: optInt(0, 120, 'גיל מינימלי לא תקין'),
    maxAge: optInt(0, 120, 'גיל מקסימלי לא תקין'),
    requireNationalInsurance: z.boolean(),
    summary: optStr(10000),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.isPaid && (v.price === null || v.price === undefined || v.price <= 0))
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'יש להזין מחיר לסדנה בתשלום' });
    if (v.minAge != null && v.maxAge != null && v.minAge > v.maxAge)
      ctx.addIssue({ code: 'custom', path: ['maxAge'], message: 'גיל מקסימלי קטן מהגיל המינימלי' });
    if (v.startTime && v.endTime && v.endTime <= v.startTime)
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });
  });

export const sessionSchema = z.object({
  date: dateStr,
  startTime: timeStr,
  endTime: timeStr,
});

export const questionSchema = z
  .object({
    text: z.string().trim().min(1, 'נוסח השאלה הוא שדה חובה').max(300),
    type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE']),
    required: z.boolean().default(false),
    options: z
      .array(z.object({ id: z.number().int().optional(), label: z.string().trim().min(1, 'אפשרות לא יכולה להיות ריקה').max(120) }))
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'TEXT' && v.options.length < 2)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'שאלת בחירה דורשת לפחות שתי אפשרויות' });
  });

export const answersSchema = z
  .array(z.object({ questionId: z.number().int(), textValue: z.string().max(2000).nullish(), optionId: z.number().int().nullish(), optionIds: z.array(z.number().int()).nullish() }))
  .default([]);

export const registerSchema = z.object({ memberId: z.number().int(), answers: answersSchema });
export const cancelSchema = z.object({ reason: optStr(300) });
export const restrictionSchema = z
  .object({
    workshopId: z.number().int().nullable().optional(),
    kind: z.enum(['WORKSHOP', 'EVENT']).nullable().optional(),
    reason: optStr(300),
  })
  .refine((v) => !(v.workshopId && v.kind), { message: 'ניתן לבחור הגבלה לפי סוג או לפי פעילות ספציפית, לא שניהם' });
export const memberNoteSchema = z.object({
  text: z.string({ required_error: 'יש להזין טקסט' }).trim().min(1, 'יש להזין טקסט').max(5000),
  author: optStr(80),
});
export const attendanceSchema = z.object({
  registrationId: z.number().int(),
  status: z.enum(['PRESENT', 'ABSENT']).nullable(),
});
export const preferencesSchema = z.object({ preferredChannel: z.enum(CHANNELS) });
export const publicPhoneSchema = z.object({ phone: z.string().trim().min(1, 'יש להזין מספר טלפון') });
export const publicRegisterSchema = publicPhoneSchema.extend({ answers: answersSchema });
