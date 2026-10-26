import { z } from 'zod';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max = 1000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const optDate = z.preprocess(emptyToNull, dateStr.nullable().optional());
const money = (msg = 'סכום לא תקין') => z.coerce.number({ invalid_type_error: msg }).min(0, msg).max(100000, msg);
const posInt = (msg: string, max = 500) => z.coerce.number({ invalid_type_error: msg }).int(msg).min(1, msg).max(max, msg);

export const TRACKS = ['PRIVATE', 'SMAT'] as const;

export const therapistSchema = z.object({
  fullName: z.string({ required_error: 'שם מלא הוא שדה חובה' }).trim().min(1, 'שם מלא הוא שדה חובה').max(80),
  phone: optStr(30),
  email: z.preprocess(emptyToNull, z.string().trim().email('כתובת מייל לא תקינה').nullable().optional()),
  type: z.enum(TRACKS, { required_error: 'יש לבחור סוג' }),
  pricePerSession: money('יש להזין מחיר לפגישה'),
  active: z.boolean().optional(),
});

export const treatmentCreateSchema = z.object({
  memberId: z.number({ required_error: 'יש לבחור חבר' }).int(),
  approvedSessions: posInt('יש להזין מספר פגישות מאושרות'),
  copayPerSession: money('גובה ההשתתפות העצמית לא תקין'),
  socialWorker: z.string({ required_error: 'יש לבחור עו"סית אחראית' }).trim().min(1, 'יש לבחור עו"סית אחראית').max(80),
  yehudaApproval: z.boolean(),
  track: z.enum(TRACKS, { required_error: 'יש לבחור מסלול' }),
  therapistId: z.number().int().nullable().optional(),
  intakeRef: optStr(300),
});

export const treatmentUpdateSchema = z.object({
  socialWorker: z.string().trim().min(1, 'יש לבחור עו"סית אחראית').max(80).optional(),
  sessionCost: z.preprocess((v) => (v === '' ? null : v), money().nullable().optional()),
  copayPerSession: money().optional(),
  approvedSessions: posInt('מספר פגישות לא תקין').optional(),
  startDate: dateStr.optional(),
  intakeRef: optStr(300),
});

export const assignSchema = z.object({ therapistId: z.number().int(), date: optDate });
export const changeTherapistSchema = z.object({
  newTherapistId: z.number({ required_error: 'יש לבחור מטפל חדש' }).int(),
  date: optDate,
  reason: z.string({ required_error: 'יש להזין סיבת החלפה' }).trim().min(1, 'יש להזין סיבת החלפה').max(300),
  note: optStr(1000),
});

// סיבות השהיה לפי מסמך הדרישות (השהיה היא סנקציה)
export const PAUSE_REASONS = {
  NON_PAYMENT: 'אי תשלום השתתפות עצמית',
  EXCESS_CANCELLATIONS: 'ביטולים מוגזמים',
  NO_FEEDBACK: 'אי מילוי משוב',
  OTHER_VIOLATION: 'הפרה אחרת',
} as const;
export const FREEZE_REASONS = { PERSONAL: 'סיבה אישית', HEALTH: 'מצב בריאותי', TRAVEL: 'נסיעה או מעבר זמני', OTHER: 'אחר' } as const;
export const FINISH_REASONS = {
  QUOTA: 'הסתיים מספר הפגישות המאושר',
  GOAL: 'מטרת הטיפול הושגה',
  DROPOUT: 'נשירה',
  HMO: 'מעבר לסבסוד קופת חולים',
  RELOCATION: 'מעבר דירה',
  TRAVEL: 'טיול לחו"ל',
  PERSONAL: 'אילוץ אישי',
  OTHER: 'אחר',
} as const;

export const pauseSchema = z.object({ reason: z.enum(['NON_PAYMENT', 'EXCESS_CANCELLATIONS', 'NO_FEEDBACK', 'OTHER_VIOLATION']), note: optStr(1000) });
export const freezeSchema = z.object({ reason: z.enum(['PERSONAL', 'HEALTH', 'TRAVEL', 'OTHER']), note: optStr(1000) });
export const finishSchema = z.object({
  reason: z.enum(['QUOTA', 'GOAL', 'DROPOUT', 'HMO', 'RELOCATION', 'TRAVEL', 'PERSONAL', 'OTHER']),
  date: optDate,
  note: optStr(1000),
});
export const noteSchema = z.object({
  date: optDate,
  description: z.string({ required_error: 'יש להזין תיאור' }).trim().min(1, 'יש להזין תיאור').max(1000),
});
export const exceptionSchema = z.object({
  kind: z.enum(['LATE_PAYMENT', 'MANUAL']),
  date: optDate,
  description: z.string({ required_error: 'יש להזין תיאור' }).trim().min(1, 'יש להזין תיאור').max(1000),
});
export const extensionSchema = z.object({
  additionalSessions: posInt('יש להזין מספר פגישות נוספות', 200),
  copayPerSession: money('גובה ההשתתפות העצמית לא תקין'),
  yehudaApproval: z.boolean(),
  date: optDate,
  idempotencyKey: z.string().max(80).nullish(),
});

const reportBase = {
  therapistId: z.number({ required_error: 'יש לבחור מטפל' }).int(),
  year: z.coerce.number().int().min(2000, 'שנה לא תקינה').max(2100, 'שנה לא תקינה'),
  month: z.coerce.number().int().min(1, 'חודש לא תקין').max(12, 'חודש לא תקין'),
  sessionsHeld: z.coerce.number({ invalid_type_error: 'מספר פגישות לא תקין' }).int('מספר פגישות לא תקין').min(0, 'מספר פגישות לא תקין').max(100, 'מספר פגישות לא תקין'),
  paidCancellations: z.coerce.number({ invalid_type_error: 'מספר ביטולים לא תקין' }).int('מספר ביטולים לא תקין').min(0, 'מספר ביטולים לא תקין').max(100, 'מספר ביטולים לא תקין').default(0),
  notes: optStr(2000),
  ratePerSession: z.preprocess((v) => (v === '' ? undefined : v), money('תעריף לא תקין').optional()),
  copayPerSession: z.preprocess((v) => (v === '' ? undefined : v), money('סכום השתתפות עצמית לא תקין').optional()),
};
export const reportSchema = z.object(reportBase);
export const paymentSchema = z.object({
  therapistPaymentStatus: z.enum(['PENDING', 'ACCOUNTING', 'PAID']).optional(),
  copayPaymentStatus: z.enum(['PENDING', 'PAID']).optional(),
});

export const REPORT_TYPES = ['PSYCHOSOCIAL', 'FIRST_SESSION_SUMMARY', 'THERAPIST_FOLLOWUP', 'GENERAL'] as const;
export const socialReportSchema = z.object({
  date: dateStr,
  type: z.enum(REPORT_TYPES),
  title: z.string({ required_error: 'יש להזין כותרת' }).trim().min(1, 'יש להזין כותרת').max(200),
  content: z.string().max(20000).default(''),
});

export const MEETING_SUBJECTS = {
  FIT: 'מידת ההתאמה של המטפל',
  EARLY_END: 'בקשה לסיים לפני תום החוזה',
  CONSULT: 'התייעצות',
  EXTENSION_REQUEST: 'בקשת הארכת טיפול',
  OTHER: 'אחר',
} as const;
export const treatmentMeetingSchema = z.object({
  date: dateStr,
  subject: z.enum(['FIT', 'EARLY_END', 'CONSULT', 'EXTENSION_REQUEST', 'OTHER']),
  summary: optStr(5000),
});
export const taskSchema = z.object({
  title: z.string({ required_error: 'יש להזין כותרת למשימה' }).trim().min(1, 'יש להזין כותרת למשימה').max(300),
  dueDate: optDate,
});
export const taskDoneSchema = z.object({ done: z.boolean() });
