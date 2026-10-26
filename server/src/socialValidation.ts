import { z } from 'zod';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max = 2000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string({ required_error: 'יש לבחור תאריך' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');
const optDate = z.preprocess(emptyToNull, dateStr.nullable().optional());
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה');
const optInt = (min: number, max: number, msg: string) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number({ invalid_type_error: msg }).int(msg).min(min, msg).max(max, msg).nullable().optional());

export const REQUEST_TYPES = ['SUPPORT', 'RIGHTS', 'PSYCH_EXTERNAL', 'HEALTH', 'FAMILY_MEDIATION', 'BUREAUCRATIC', 'OTHER'] as const;
export const REQUEST_SOURCES = ['WEBSITE', 'PHONE', 'MEETING', 'MANUAL', 'OTHER'] as const;
export const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'] as const;
export const REQUEST_STATUSES = ['NEW', 'REVIEW', 'WAITING_INFO', 'IN_PROGRESS', 'HANDLED', 'REJECTED', 'CLOSED'] as const;
export const DECISIONS = ['SOCIAL_WORK_NEEDED', 'PSYCH_REFERRAL', 'EXTERNAL_REFERRAL', 'ANSWERED', 'REJECTED', 'MORE_INFO'] as const;
export const MODES = ['FACE', 'PHONE', 'ONLINE', 'OTHER'] as const;

export const requestCreateSchema = z.object({
  memberId: z.number({ required_error: 'יש לבחור חבר' }).int(),
  type: z.enum(REQUEST_TYPES, { required_error: 'יש לבחור סוג פנייה' }),
  subject: z.string({ required_error: 'נושא הוא שדה חובה' }).trim().min(1, 'נושא הוא שדה חובה').max(200),
  description: optStr(5000),
  openedAt: optDate,
  source: z.enum(REQUEST_SOURCES).default('MANUAL'),
  assignee: optStr(80),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  internalNote: optStr(5000),
});

export const requestUpdateSchema = z.object({
  type: z.enum(REQUEST_TYPES).optional(),
  subject: z.string().trim().min(1, 'נושא הוא שדה חובה').max(200).optional(),
  description: optStr(5000),
  openedAt: dateStr.optional(),
  source: z.enum(REQUEST_SOURCES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  internalNote: optStr(5000),
});

export const assignSchema = z.object({ assignee: z.string({ required_error: 'יש לבחור גורם אחראי' }).trim().min(1, 'יש לבחור גורם אחראי').max(80) });
export const requestStatusSchema = z.object({ status: z.enum(REQUEST_STATUSES), reason: optStr(1000) });
export const requestNoteSchema = z.object({ text: z.string({ required_error: 'יש להזין טקסט' }).trim().min(1, 'יש להזין טקסט').max(3000) });
export const contactSchema = z.object({
  text: z.string({ required_error: 'יש להזין תיאור' }).trim().min(1, 'יש להזין תיאור').max(3000),
  mode: z.enum(MODES).default('PHONE'),
  date: optDate,
});
export const decisionSchema = z.object({ decision: z.enum(DECISIONS), note: optStr(2000) });

export const KINDS = ['RIGHTS', 'SUPPORT', 'PARENT_MEDIATION', 'FAMILY', 'EMOTIONAL', 'BUREAUCRATIC', 'OTHER'] as const;
export const PROCESS_TYPES = ['ONE_TIME', 'ONGOING'] as const;
export const kindsSchema = z.array(z.enum(KINDS)).min(1, 'יש לבחור לפחות מהות ליווי אחת').max(KINDS.length);

export const TYPE_CHOICES = ['AUTO', 'ONE_TIME', 'ONGOING'] as const; // AUTO: נקבע לפי מספר הפגישות בפועל

export const processCreateSchema = z.object({
  memberId: z.number({ required_error: 'יש לבחור חבר' }).int(),
  requestId: z.number().int().nullish(),
  socialWorker: optStr(80),
  kinds: kindsSchema,
  type: z.enum(TYPE_CHOICES).default('AUTO'),
  goal: optStr(2000),
  startDate: optDate,
  allowAnother: z.boolean().optional(),
});
export const openFromRequestSchema = processCreateSchema.omit({ memberId: true, requestId: true });

export const processUpdateSchema = z.object({
  socialWorker: optStr(80),
  kinds: kindsSchema.optional(),
  type: z.enum(TYPE_CHOICES).optional(),
  goal: optStr(2000),
  startDate: dateStr.optional(),
});

export const END_REASONS = ['COMPLETED', 'GOAL_ACHIEVED', 'DROPOUT', 'TRANSFERRED', 'MEMBER_REQUEST', 'OTHER'] as const;
export const finishSocialSchema = z.object({
  endDate: optDate,
  reason: z.enum(END_REASONS, { required_error: 'יש לבחור סיבת סיום' }),
  summary: z.string({ required_error: 'יש להזין סיכום קצר' }).trim().min(1, 'יש להזין סיכום קצר').max(5000),
});
export const noteOptSchema = z.object({ note: optStr(1000) });
export const linkTreatmentSchema = z.object({ treatmentId: z.number({ required_error: 'יש לבחור תהליך שפ"ח' }).int() });

export const TOPICS = ['WORK', 'RESERVE_DUTY', 'STUDIES', 'FAMILY', 'NATIONAL_INSURANCE', 'RELATIONSHIP'] as const;
export const MEETING_ACTIONS = ['NI_PROGRAM', 'PSYCH_PROGRAM', 'SCHOLARSHIPS', 'EMPLOYMENT', 'EXTERNAL_PARTNER'] as const;

export const meetingSchema = z
  .object({
    date: dateStr,
    time: timeStr,
    subject: optStr(200), // אם ריק: ברירת מחדל לפי מהות התהליך
    mode: z.enum(MODES).default('FACE'),
    durationMinutes: optInt(1, 600, 'משך לא תקין (1 עד 600 דקות)'),
    summary: optStr(5000),
    followUpNotes: optStr(3000),
    followUpRequired: z.boolean().default(false),
    status: z.enum(['HELD', 'CANCELLED']).default('HELD'),
    cancelReason: optStr(500),
    topics: z.array(z.enum(TOPICS)).default([]),
    meetingActions: z.array(z.enum(MEETING_ACTIONS)).default([]),
    externalPartner: optStr(200),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'CANCELLED' && !v.cancelReason) ctx.addIssue({ code: 'custom', path: ['cancelReason'], message: 'בפגישה שבוטלה יש להזין סיבה' });
    if (v.meetingActions.includes('EXTERNAL_PARTNER') && !v.externalPartner)
      ctx.addIssue({ code: 'custom', path: ['externalPartner'], message: 'יש להזין את שם גורם השת"פ החיצוני' });
  });

export const INTERVENTION_TYPES = ['EXTERNAL_CONTACT', 'RIGHTS_ASSIST', 'REFERRAL', 'FAMILY_TALK', 'BUREAUCRATIC', 'OTHER'] as const;
export const INTERVENTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'] as const;
export const interventionSchema = z.object({
  date: dateStr,
  type: z.enum(INTERVENTION_TYPES, { required_error: 'יש לבחור סוג פעולה' }),
  description: z.string({ required_error: 'תיאור הוא שדה חובה' }).trim().min(1, 'תיאור הוא שדה חובה').max(3000),
  involved: optStr(200),
  status: z.enum(INTERVENTION_STATUSES).default('OPEN'),
  treatmentId: z.number().int().nullish(),
  meetingId: z.number().int().nullish(),
});

export const REPORT_KINDS = ['PERIODIC', 'GENERAL', 'CLOSING'] as const;
export const swReportSchema = z.object({
  type: z.enum(REPORT_KINDS),
  date: dateStr,
  title: z.string({ required_error: 'יש להזין כותרת' }).trim().min(1, 'יש להזין כותרת').max(200),
  content: z.string().max(20000).default(''),
});
