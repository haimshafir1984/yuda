import { randomBytes } from 'crypto';
import { z } from 'zod';
import { currentActorName } from '../auth/context';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { addDays, parseDateOnly, toDateOnly, todayDateOnly } from '../lib/dates';
import { normalizePhone } from '../lib/phone';
import { cancelJob, registerJobHandler, registerTickHook, scheduleJob } from '../messaging/scheduler';
import { createMember } from '../services/memberService';
import { baseUrl, trySend } from './messages';
import { QuestionnaireAnswers, questionnaireSchema } from './questionnaire';
import { getSettings, numSetting } from './settings';

/**
 * קבלת חברים חדשים: טופס הצטרפות -> כרטיס מועמדות -> (סינון, שיחת בירור) -> ראיון קבוצתי -> שאלון היכרות
 * -> (פגישה אישית) -> קבלה (נוצר כרטיס חבר) או דחייה. כל הודעה למועמד יוצאת לפי תבנית.
 */

export const STATUSES = ['NEW', 'AWAITING_CLARIFICATION', 'INVITED_GROUP', 'AWAITING_PERSONAL', 'ACCEPTED', 'REJECTED', 'AIR', 'FADED', 'MAYBE_FUTURE'] as const;
export type CandidateStatus = (typeof STATUSES)[number];
export const OUTCOMES = [
  'PREVIOUS_UNHANDLED', 'REJECT_AGE', 'REJECT_BACKGROUND', 'REJECT_AFTER_CALL', 'INVITED_NOT_SIGNED', 'SIGNED_NOT_ATTENDED',
  'REJECT_AFTER_GROUP', 'PERSONAL_NOT_SCHEDULED', 'PERSONAL_NO_SHOW', 'REJECT_AFTER_PERSONAL', 'TEMP_REJECT',
] as const;

const UNHANDLED = ['NEW', 'AWAITING_CLARIFICATION'];
const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const fmtLocal = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const sessionName = (date: Date) => `${HEBREW_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
/** מועד התחלה (שעה מקומית של השרת). בלי שעה: 18:00 */
const sessionStart = (date: Date, startTime: string | null) => {
  const [h, m] = (startTime ?? '18:00').split(':').map(Number);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h || 0, m || 0);
};
const token = () => randomBytes(16).toString('hex');
const parseLocal = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
};
const ageOf = (birth: Date | null, now = new Date()) => {
  if (!birth) return null;
  let a = now.getFullYear() - birth.getUTCFullYear();
  if (now.getMonth() < birth.getUTCMonth() || (now.getMonth() === birth.getUTCMonth() && now.getDate() < birth.getUTCDate())) a -= 1;
  return a;
};

// ======================= טופס ההצטרפות (ציבורי) =======================

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

export const joinSchema = z.object({
  firstName: z.string({ required_error: 'שם פרטי הוא שדה חובה' }).trim().min(1, 'שם פרטי הוא שדה חובה').max(60),
  lastName: z.string({ required_error: 'שם משפחה הוא שדה חובה' }).trim().min(1, 'שם משפחה הוא שדה חובה').max(60),
  nationalId: z.preprocess(emptyToNull, z.string().trim().regex(/^\d{5,9}$/, 'תעודת זהות חייבת להכיל 5 עד 9 ספרות').nullable().optional()),
  birthDate: z
    .string({ required_error: 'תאריך לידה הוא שדה חובה' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לידה לא תקין')
    .refine((v) => parseDateOnly(v) < new Date() && parseDateOnly(v).getUTCFullYear() > 1920, 'תאריך לידה לא תקין'),
  gender: z.preprocess(emptyToNull, z.enum(['MALE', 'FEMALE']).nullable().optional()),
  maritalStatus: z.preprocess(emptyToNull, z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']).nullable().optional()),
  childrenCount: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).max(30).nullable().optional()),
  phone: z
    .string({ required_error: 'טלפון הוא שדה חובה' })
    .trim()
    .min(1, 'טלפון הוא שדה חובה')
    .refine((v) => normalizePhone(v).length >= 9 && normalizePhone(v).length <= 12, 'מספר טלפון לא תקין'),
  email: z.preprocess(emptyToNull, z.string().trim().email('כתובת מייל לא תקינה').max(120).nullable().optional()),
  preferredChannel: z.enum(['SMS', 'EMAIL']).default('SMS'),
  community: optStr(100),
  elementarySchool: optStr(150),
  highSchool: optStr(150),
  howHeard: optStr(60),
  whyJoin: optStr(3000),
  anythingElse: optStr(3000),
  /** שדה פיתיון נגד בוטים: אדם אמיתי לא ימלא אותו */
  website: z.string().max(200).optional(),
});
export type JoinInput = z.infer<typeof joinSchema>;

const REASON_TEXT: Record<string, string> = {
  NOT_HAREDI: 'הפעילות מיועדת לבוגרי ובוגרות החברה החרדית',
};

type CandidateRow = Awaited<ReturnType<typeof prisma.candidate.findFirstOrThrow>>;

/** system: פעולה של המועמד או של המערכת (טופס ציבורי, סריקה אוטומטית): לא משויכת למשתמש המחובר */
async function addEvent(candidateId: number, type: string, description: string, from?: string | null, to?: string | null, system = false) {
  await prisma.candidateEvent.create({ data: { candidateId, type, description, fromStatus: from ?? null, toStatus: to ?? null, performedBy: system ? null : currentActorName() } });
}

async function move(c: CandidateRow, to: CandidateStatus, opts: { outcome?: string | null; type: string; description: string; extra?: Record<string, unknown>; system?: boolean }) {
  await prisma.candidate.update({
    where: { id: c.id },
    data: { status: to, statusChangedAt: new Date(), ...(opts.outcome !== undefined && { outcomeCode: opts.outcome }), ...(opts.extra ?? {}) },
  });
  await addEvent(c.id, opts.type, opts.description, c.status, to, opts.system);
}

async function load(id: number) {
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) throw notFound('המועמד');
  return c;
}
const requireStatus = (c: CandidateRow, allowed: readonly string[], what: string) => {
  if (!allowed.includes(c.status)) throw new AppError(409, 'INVALID_STATUS', `לא ניתן ${what} כשהסטטוס הוא "${c.status}"`, { status: c.status });
};

/** הגשת טופס ההצטרפות: יוצר כרטיס מועמדות, מזהה בקשה חוזרת, ודוחה אוטומטית לפי גיל */
export async function submitJoin(input: JoinInput) {
  if (input.website) throw new AppError(400, 'VALIDATION', 'הבקשה נדחתה'); // בוט
  const phoneNormalized = normalizePhone(input.phone);
  const email = input.email?.toLowerCase() ?? null;
  const settings = await getSettings();

  // בקשה קודמת של אותו אדם: לפי תעודת זהות, טלפון או מייל
  const same = [{ phoneNormalized }, ...(input.nationalId ? [{ nationalId: input.nationalId }] : []), ...(email ? [{ email }] : [])];
  const previous = await prisma.candidate.findFirst({ where: { OR: same }, orderBy: { id: 'desc' } });
  const member = await prisma.member.findFirst({ where: { OR: [{ phoneNormalized }, ...(input.nationalId ? [{ nationalId: input.nationalId }] : [])] } });

  let repeatReason: string | null = null;
  if (previous) repeatReason = UNHANDLED.includes(previous.status) ? 'PREVIOUS_UNHANDLED' : previous.outcomeCode;

  const birthDate = parseDateOnly(input.birthDate);
  const c = await prisma.candidate.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      nationalId: input.nationalId ?? null,
      birthDate,
      gender: input.gender ?? null,
      maritalStatus: input.maritalStatus ?? null,
      childrenCount: input.childrenCount ?? null,
      phone: input.phone,
      phoneNormalized,
      email,
      preferredChannel: input.preferredChannel,
      community: input.community ?? null,
      elementarySchool: input.elementarySchool ?? null,
      highSchool: input.highSchool ?? null,
      howHeard: input.howHeard ?? null,
      whyJoin: input.whyJoin ?? null,
      anythingElse: input.anythingElse ?? null,
      previousId: previous?.id ?? null,
      repeatReason,
      existingMemberId: member?.id ?? previous?.memberId ?? null,
    },
  });
  await addEvent(c.id, 'SUBMITTED', previous ? `התקבלה בקשת הצטרפות (בקשה חוזרת, קודמת: #${previous.id})` : 'התקבלה בקשת הצטרפות מהאתר', null, 'NEW', true);

  // דחייה ראשונית אוטומטית: צעיר מדי / מבוגר מדי
  const age = ageOf(birthDate)!;
  const young = age < numSetting(settings, 'intake.minAge');
  const old = age > numSetting(settings, 'intake.maxAge');
  if (young || old) {
    await move(c, 'REJECTED', {
      outcome: 'REJECT_AGE',
      type: 'AUTO_REJECTED_AGE',
      description: young ? 'נדחתה אוטומטית: צעיר/ה מדי' : 'נדחתה אוטומטית: מבוגר/ת מדי',
      extra: { rejectionReason: young ? 'AGE_YOUNG' : 'AGE_OLD' },
      system: true,
    });
    await trySend(c.id, 'intake.rejected.age');
  }
  return { id: c.id, autoRejected: young || old };
}

// ======================= רשימה וכרטיס =======================

const dto = (c: CandidateRow) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  fullName: `${c.firstName} ${c.lastName}`,
  nationalId: c.nationalId,
  birthDate: toDateOnly(c.birthDate),
  age: ageOf(c.birthDate),
  gender: c.gender,
  maritalStatus: c.maritalStatus,
  childrenCount: c.childrenCount,
  phone: c.phone,
  email: c.email,
  preferredChannel: c.preferredChannel,
  community: c.community,
  elementarySchool: c.elementarySchool,
  highSchool: c.highSchool,
  howHeard: c.howHeard,
  whyJoin: c.whyJoin,
  anythingElse: c.anythingElse,
  submittedAt: c.submittedAt.toISOString(),
  status: c.status,
  statusChangedAt: c.statusChangedAt.toISOString(),
  outcomeCode: c.outcomeCode,
  rejectionReason: c.rejectionReason,
  rejectionNote: c.rejectionNote,
  coordinator: c.coordinator,
  callDate: toDateOnly(c.callDate),
  callSummary: c.callSummary,
  previousId: c.previousId,
  repeatReason: c.repeatReason,
  isRepeat: c.previousId !== null,
  existingMemberId: c.existingMemberId,
  memberId: c.memberId,
});

export async function listCandidates(f: { status?: string; q?: string; repeat?: boolean }) {
  const q = f.q?.trim();
  const rows = await prisma.candidate.findMany({
    where: {
      ...(f.status && (STATUSES as readonly string[]).includes(f.status) ? { status: f.status } : {}),
      ...(f.repeat ? { previousId: { not: null } } : {}),
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { phone: { contains: q } }, { nationalId: { contains: q } }] } : {}),
    },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
  });
  const now = Date.now();
  return rows.map((c) => ({ ...dto(c), daysSinceSubmitted: Math.floor((now - c.submittedAt.getTime()) / 86_400_000) }));
}

export async function summary() {
  const groups = await prisma.candidate.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>;
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}

export async function getCandidate(id: number) {
  const c = await prisma.candidate.findUnique({
    where: { id },
    include: {
      events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      invitations: { orderBy: { id: 'desc' } },
      signups: { include: { session: true }, orderBy: { id: 'desc' } },
      questionnaires: { orderBy: { id: 'desc' } },
      meetings: { orderBy: { id: 'desc' } },
    },
  });
  if (!c) throw notFound('המועמד');
  const previous = c.previousId ? await prisma.candidate.findUnique({ where: { id: c.previousId } }) : null;
  const sessions = await prisma.interviewSession.findMany({ where: { id: { in: c.invitations.filter((i) => i.kind === 'GROUP').flatMap((i) => i.offered.split(',').map(Number)).filter(Boolean) } } });
  return {
    ...dto(c),
    previous: previous && { id: previous.id, submittedAt: previous.submittedAt.toISOString(), status: previous.status, outcomeCode: previous.outcomeCode },
    events: c.events.map((e) => ({ id: e.id, type: e.type, description: e.description, fromStatus: e.fromStatus, toStatus: e.toStatus, performedBy: e.performedBy, createdAt: e.createdAt.toISOString() })),
    invitations: c.invitations.map((i) => ({
      id: i.id,
      kind: i.kind,
      sentAt: i.sentAt.toISOString(),
      respondedAt: i.respondedAt?.toISOString() ?? null,
      response: i.response,
      note: i.note,
      chosen: i.chosen,
      link: `${baseUrl()}/${i.kind === 'GROUP' ? 'invite' : 'meeting'}/${i.token}`,
      offered:
        i.kind === 'GROUP'
          ? i.offered.split(',').map((sid) => {
              const s = sessions.find((x) => x.id === Number(sid));
              return s ? `${fmtDate(s.date)} ${s.startTime ?? ''} (${sessionName(s.date)})`.trim() : `ראיון #${sid}`;
            })
          : i.offered.split(',').map((x) => { const d = parseLocal(x); return d ? fmtLocal(d) : x; }),
    })),
    signups: c.signups.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      sessionName: sessionName(s.session.date),
      sessionDate: toDateOnly(s.session.date)!,
      startTime: s.session.startTime,
      attended: s.attended,
      decision: s.decision,
    })),
    questionnaires: c.questionnaires.map((q) => ({
      id: q.id,
      sentAt: q.sentAt.toISOString(),
      filledAt: q.filledAt?.toISOString() ?? null,
      link: `${baseUrl()}/questionnaire/${q.token}`,
      answers: q.answers ? (JSON.parse(q.answers) as QuestionnaireAnswers) : null,
    })),
    meetings: c.meetings.map((m) => ({
      id: m.id,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      heldAt: m.heldAt?.toISOString() ?? null,
      noShow: m.noShow,
      decision: m.decision,
      decisionNote: m.decisionNote,
    })),
  };
}

export async function assignCoordinator(id: number, name: string | null) {
  await load(id);
  await prisma.candidate.update({ where: { id }, data: { coordinator: name } });
  await addEvent(id, 'ASSIGNED', name ? `שויך לרכז הקבלה ${name}` : 'בוטל שיוך לרכז');
  return getCandidate(id);
}

// ======================= סינון ושיחת בירור =======================

export const rejectSchema = z.object({
  reason: z.enum(['NOT_HAREDI', 'OTHER'], { required_error: 'יש לבחור סיבה' }),
  note: optStr(500),
  sendMessage: z.boolean().default(true),
});

/** דחייה בסינון הראשוני (או אחרי שיחת בירור). נשלחת הודעה אוטומטית עם הסיבה */
export async function rejectCandidate(id: number, input: z.infer<typeof rejectSchema>) {
  const c = await load(id);
  requireStatus(c, UNHANDLED, 'לדחות בסינון');
  if (input.reason === 'OTHER' && !input.note) throw new AppError(400, 'VALIDATION', 'יש לפרט את הסיבה', { fields: { note: 'יש לפרט את הסיבה' } });
  const afterCall = c.status === 'AWAITING_CLARIFICATION' || !!c.callDate;
  await move(c, 'REJECTED', {
    outcome: afterCall ? 'REJECT_AFTER_CALL' : 'REJECT_BACKGROUND',
    type: 'REJECTED',
    description: `נדחתה${afterCall ? ' אחרי שיחת בירור' : ''}: ${input.reason === 'NOT_HAREDI' ? 'אינו מרקע חרדי' : input.note}`,
    extra: { rejectionReason: input.reason, rejectionNote: input.note ?? null },
  });
  if (input.sendMessage) await trySend(id, 'intake.rejected.screening', { סיבה: input.reason === 'NOT_HAREDI' ? REASON_TEXT.NOT_HAREDI : input.note });
  return getCandidate(id);
}

export async function requestClarification(id: number) {
  const c = await load(id);
  requireStatus(c, ['NEW'], 'לבקש שיחת בירור');
  await move(c, 'AWAITING_CLARIFICATION', { type: 'CLARIFICATION_REQUESTED', description: 'נדרשת שיחת בירור' });
  return getCandidate(id);
}

export const callSchema = z.object({
  date: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין').nullable().optional()),
  summary: z.string({ required_error: 'יש להזין סיכום שיחה' }).trim().min(1, 'יש להזין סיכום שיחה').max(3000),
  result: z.enum(['NONE', 'REJECT', 'INVITE_GROUP']).default('NONE'),
  rejectReason: z.enum(['NOT_HAREDI', 'OTHER']).optional(),
});

/** תיעוד שיחת בירור, ותוצאה: דחייה או הזמנה לראיון קבוצתי */
export async function recordCall(id: number, input: z.infer<typeof callSchema>) {
  const c = await load(id);
  requireStatus(c, UNHANDLED, 'לתעד שיחת בירור');
  await prisma.candidate.update({ where: { id }, data: { callDate: parseDateOnly(input.date ?? todayDateOnly()), callSummary: input.summary } });
  await addEvent(id, 'CALL', `שיחת בירור: ${input.summary}`);
  if (input.result === 'REJECT') return rejectCandidate(id, { reason: input.rejectReason ?? 'OTHER', note: input.rejectReason === 'NOT_HAREDI' ? null : input.summary, sendMessage: true });
  if (input.result === 'INVITE_GROUP') return inviteGroup(id);
  if (c.status === 'NEW') await move({ ...c, callDate: new Date() }, 'AWAITING_CLARIFICATION', { type: 'CLARIFICATION_REQUESTED', description: 'נדרשת שיחת בירור' });
  return getCandidate(id);
}

// ======================= ראיונות קבוצתיים =======================

export const sessionSchema = z.object({
  date: z.string({ required_error: 'יש לבחור תאריך' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
  startTime: z.preprocess(emptyToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה').nullable().optional()),
  coordinator: optStr(80),
});

export async function createSession(input: z.infer<typeof sessionSchema>) {
  if (input.date < todayDateOnly()) throw new AppError(400, 'VALIDATION', 'אי אפשר לקבוע ראיון בתאריך שעבר', { fields: { date: 'אי אפשר לקבוע ראיון בתאריך שעבר' } });
  const s = await prisma.interviewSession.create({ data: { date: parseDateOnly(input.date), startTime: input.startTime ?? '18:00', coordinator: input.coordinator ?? currentActorName() } });
  return sessionDto(s, 0, 0);
}

const sessionDto = (s: { id: number; date: Date; startTime: string | null; coordinator: string | null }, signups: number, attended: number) => ({
  id: s.id,
  name: sessionName(s.date),
  date: toDateOnly(s.date)!,
  startTime: s.startTime,
  coordinator: s.coordinator,
  signups,
  attended,
  past: toDateOnly(s.date)! < todayDateOnly(),
});

export async function listSessions() {
  const rows = await prisma.interviewSession.findMany({ include: { signups: true }, orderBy: { date: 'desc' } });
  return rows.map((s) => sessionDto(s, s.signups.length, s.signups.filter((x) => x.attended === true).length));
}

export async function deleteSession(id: number) {
  const s = await prisma.interviewSession.findUnique({ where: { id }, include: { signups: true } });
  if (!s) throw notFound('הראיון');
  if (s.signups.length) throw new AppError(409, 'HAS_SIGNUPS', 'אי אפשר למחוק ראיון שיש בו נרשמים');
  await prisma.interviewSession.delete({ where: { id } });
}

export async function getSession(id: number) {
  const s = await prisma.interviewSession.findUnique({
    where: { id },
    include: { signups: { include: { candidate: { include: { questionnaires: true } } }, orderBy: { id: 'asc' } } },
  });
  if (!s) throw notFound('הראיון');
  return {
    ...sessionDto(s, s.signups.length, s.signups.filter((x) => x.attended === true).length),
    signupsList: s.signups.map((x) => ({
      id: x.id,
      candidateId: x.candidateId,
      candidateName: `${x.candidate.firstName} ${x.candidate.lastName}`,
      candidateStatus: x.candidate.status,
      phone: x.candidate.phone,
      age: ageOf(x.candidate.birthDate),
      attended: x.attended,
      decision: x.decision,
      questionnaireSent: x.candidate.questionnaires.some((q) => q.signupId === x.id),
      questionnaireFilled: x.candidate.questionnaires.some((q) => q.signupId === x.id && q.filledAt),
    })),
  };
}

/** ההזמנה לראיון קבוצתי: שני המועדים העתידיים הקרובים, וקישור אישי להשתבצות */
export async function inviteGroup(id: number) {
  const c = await load(id);
  requireStatus(c, ['NEW', 'AWAITING_CLARIFICATION', 'AIR', 'MAYBE_FUTURE'], 'להזמין לראיון קבוצתי');
  const now = new Date();
  const upcoming = (await prisma.interviewSession.findMany({ orderBy: [{ date: 'asc' }, { startTime: 'asc' }] })).filter((s) => sessionStart(s.date, s.startTime) > now).slice(0, 2);
  if (!upcoming.length) throw new AppError(409, 'NO_SESSIONS', 'אין ראיונות קבוצתיים עתידיים. יש לקבוע מועדים לפני שליחת הזמנה');
  const inv = await prisma.candidateInvitation.create({ data: { candidateId: id, kind: 'GROUP', token: token(), offered: upcoming.map((s) => s.id).join(',') } });
  await move(c, 'INVITED_GROUP', { outcome: null, type: 'INVITED_GROUP', description: `הוזמן לראיון קבוצתי (${upcoming.map((s) => fmtDate(s.date)).join(', ')})` });
  await trySend(id, 'intake.invite.group', {
    מועדים: upcoming.map((s) => `${fmtDate(s.date)} ב-${s.startTime ?? ''} (${sessionName(s.date)})`).join(' או '),
    קישור: `${baseUrl()}/invite/${inv.token}`,
  });
  return getCandidate(id);
}

// ----- תגובת המועמד להזמנה (דף ציבורי) -----

async function loadInvitation(tok: string) {
  const inv = await prisma.candidateInvitation.findUnique({ where: { token: tok }, include: { candidate: true } });
  if (!inv) throw notFound('ההזמנה');
  return inv;
}

export async function getInvitation(tok: string) {
  const inv = await loadInvitation(tok);
  const waiting = inv.kind === 'GROUP' ? inv.candidate.status === 'INVITED_GROUP' : inv.candidate.status === 'AWAITING_PERSONAL';
  const now = new Date();
  let options: { value: string; label: string }[] = [];
  if (inv.kind === 'GROUP') {
    const sessions = await prisma.interviewSession.findMany({ where: { id: { in: inv.offered.split(',').map(Number) } }, orderBy: { date: 'asc' } });
    options = sessions.filter((s) => sessionStart(s.date, s.startTime) > now).map((s) => ({ value: String(s.id), label: `${fmtDate(s.date)} ${s.startTime ?? ''} (${sessionName(s.date)})`.trim() }));
  } else {
    options = inv.offered.split(',').map((x) => ({ x, d: parseLocal(x) })).filter((o) => o.d && o.d > now).map((o) => ({ value: o.x, label: fmtLocal(o.d!) }));
  }
  return {
    kind: inv.kind,
    firstName: inv.candidate.firstName,
    state: inv.response === 'SIGNED' ? 'SIGNED' : waiting ? 'OPEN' : 'CLOSED',
    options,
    chosen: inv.chosen,
  };
}

export const respondSchema = z
  .object({ choice: z.string().max(40).optional(), note: optStr(1000) })
  .refine((v) => v.choice || v.note, { message: 'יש לבחור מועד או לכתוב הערה' });

export async function respondInvitation(tok: string, input: z.infer<typeof respondSchema>) {
  const inv = await loadInvitation(tok);
  const info = await getInvitation(tok);
  if (info.state === 'SIGNED') throw new AppError(409, 'ALREADY_RESPONDED', 'כבר בחרת מועד. אם צריך לשנות, אפשר לפנות אלינו');
  if (info.state === 'CLOSED') throw new AppError(409, 'INVITATION_CLOSED', 'ההזמנה כבר אינה בתוקף');
  const c = inv.candidate;

  if (!input.choice) {
    await prisma.candidateInvitation.update({ where: { id: inv.id }, data: { respondedAt: new Date(), response: 'NOTE', note: input.note ?? null } });
    await addEvent(c.id, 'INVITATION_NOTE', `המועמד לא השתבץ וכתב: ${input.note}`, null, null, true);
    return { ok: true, signed: false };
  }
  if (!info.options.some((o) => o.value === input.choice)) throw new AppError(400, 'VALIDATION', 'המועד שנבחר אינו זמין', { fields: { choice: 'המועד שנבחר אינו זמין' } });

  if (inv.kind === 'GROUP') {
    const session = await prisma.interviewSession.findUniqueOrThrow({ where: { id: Number(input.choice) } });
    const signup = await prisma.interviewSignup.upsert({
      where: { candidateId_sessionId: { candidateId: c.id, sessionId: session.id } },
      update: {},
      create: { candidateId: c.id, sessionId: session.id },
    });
    await prisma.candidateInvitation.update({ where: { id: inv.id }, data: { respondedAt: new Date(), response: 'SIGNED', chosen: input.choice, note: input.note ?? null } });
    await addEvent(c.id, 'SIGNED_UP', `השתבץ לראיון הקבוצתי ב-${fmtDate(session.date)} (${sessionName(session.date)})`, null, null, true);
    await trySend(c.id, 'intake.signup.confirmed', { מועד: `${fmtDate(session.date)} ב-${session.startTime ?? ''}` });
    await scheduleGroupReminders(signup.id, session);
  } else {
    await scheduleMeeting(c.id, input.choice, inv.id);
  }
  return { ok: true, signed: true };
}

async function scheduleGroupReminders(signupId: number, session: { date: Date; startTime: string | null }) {
  const now = new Date();
  const d = session.date;
  const threeDays = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 3, 9, 0);
  const morning = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0);
  if (threeDays > now) await scheduleJob('intake.reminder', threeDays, { kind: 'group3d', signupId }, `intake:g3d:${signupId}`);
  if (morning > now) await scheduleJob('intake.reminder', morning, { kind: 'groupMorning', signupId }, `intake:gm:${signupId}`);
}

// ----- נוכחות, שאלון והחלטות -----

export async function markAttendance(signupId: number, attended: boolean) {
  const s = await prisma.interviewSignup.findUnique({ where: { id: signupId } });
  if (!s) throw notFound('ההשתבצות');
  await prisma.interviewSignup.update({ where: { id: signupId }, data: { attended } });
  return getSession(s.sessionId);
}

/** שליחת שאלון היכרות לכל מי שסומן שהגיע ועוד לא קיבל. לכל אחד קישור אישי המקושר לכרטיס שלו */
export async function sendQuestionnaires(sessionId: number) {
  const s = await getSession(sessionId);
  let sent = 0;
  for (const x of s.signupsList) {
    if (x.attended !== true || x.questionnaireSent) continue;
    if (x.candidateStatus !== 'INVITED_GROUP') continue;
    const q = await prisma.questionnaire.create({ data: { candidateId: x.candidateId, signupId: x.id, token: token() } });
    await addEvent(x.candidateId, 'QUESTIONNAIRE_SENT', 'נשלח שאלון היכרות');
    await trySend(x.candidateId, 'intake.questionnaire', { קישור: `${baseUrl()}/questionnaire/${q.token}` });
    sent += 1;
  }
  return { sent, session: await getSession(sessionId) };
}

export async function getQuestionnaire(tok: string) {
  const q = await prisma.questionnaire.findUnique({ where: { token: tok }, include: { candidate: true } });
  if (!q) throw notFound('השאלון');
  return { firstName: q.candidate.firstName, fullName: `${q.candidate.firstName} ${q.candidate.lastName}`, filled: !!q.filledAt, submittedAt: q.candidate.submittedAt.toISOString() };
}

export async function submitQuestionnaire(tok: string, answers: QuestionnaireAnswers) {
  const q = await prisma.questionnaire.findUnique({ where: { token: tok } });
  if (!q) throw notFound('השאלון');
  if (q.filledAt) throw new AppError(409, 'ALREADY_FILLED', 'השאלון כבר מולא. תודה!');
  await prisma.questionnaire.update({ where: { id: q.id }, data: { filledAt: new Date(), answers: JSON.stringify(answers) } });
  await addEvent(q.candidateId, 'QUESTIONNAIRE_FILLED', 'המועמד מילא את שאלון ההיכרות', null, null, true);
  return { ok: true };
}

export const decisionSchema = z.object({
  decision: z.enum(['NO_SHOW', 'REJECT', 'ACCEPT', 'PERSONAL']),
  slots: z.array(z.string()).max(5).optional(), // להזמנה לפגישה אישית
});

/** החלטה בעקבות הראיון הקבוצתי, לכל נרשם: לא הגיע / דחייה / קבלה / פגישה אישית */
export async function decideSignup(signupId: number, input: z.infer<typeof decisionSchema>) {
  const s = await prisma.interviewSignup.findUnique({ where: { id: signupId }, include: { candidate: true } });
  if (!s) throw notFound('ההשתבצות');
  const c = s.candidate;
  requireStatus(c, ['INVITED_GROUP'], 'לקבל החלטה בעקבות ראיון');
  if (s.decision) throw new AppError(409, 'ALREADY_DECIDED', 'כבר התקבלה החלטה עבור נרשם זה');
  if (input.decision === 'PERSONAL' && !input.slots?.length) throw new AppError(400, 'VALIDATION', 'יש להציע לפחות מועד אחד לפגישה האישית', { fields: { slots: 'יש להציע לפחות מועד אחד' } });

  await prisma.interviewSignup.update({ where: { id: signupId }, data: { decision: input.decision, decidedAt: new Date(), attended: input.decision === 'NO_SHOW' ? false : s.attended ?? true } });
  if (input.decision === 'NO_SHOW') {
    await move(c, 'AIR', { outcome: 'SIGNED_NOT_ATTENDED', type: 'NO_SHOW', description: 'השתבץ לראיון קבוצתי ולא הגיע' });
  } else if (input.decision === 'REJECT') {
    await move(c, 'REJECTED', { outcome: 'REJECT_AFTER_GROUP', type: 'REJECTED', description: 'נדחה אחרי ראיון קבוצתי', extra: { rejectionReason: 'OTHER' } });
    await trySend(c.id, 'intake.rejected.group');
  } else if (input.decision === 'ACCEPT') {
    await acceptCandidate(c.id, true);
  } else {
    await invitePersonal(c.id, input.slots!, true);
  }
  return getSession(s.sessionId);
}

// ======================= פגישה אישית =======================

export const personalInviteSchema = z.object({ slots: z.array(z.string()).min(1, 'יש להציע לפחות מועד אחד').max(5) });

export async function invitePersonal(id: number, slots: string[], fromGroup = false) {
  const c = await load(id);
  requireStatus(c, ['INVITED_GROUP', 'AIR', 'MAYBE_FUTURE'], 'להזמין לפגישה אישית');
  const now = new Date();
  const parsed = slots.map((x) => ({ x, d: parseLocal(x) }));
  if (parsed.some((p) => !p.d)) throw new AppError(400, 'VALIDATION', 'מועד לא תקין', { fields: { slots: 'מועד לא תקין' } });
  if (parsed.some((p) => p.d! <= now)) throw new AppError(400, 'VALIDATION', 'אפשר להציע רק מועדים עתידיים', { fields: { slots: 'אפשר להציע רק מועדים עתידיים' } });
  const inv = await prisma.candidateInvitation.create({ data: { candidateId: id, kind: 'PERSONAL', token: token(), offered: parsed.map((p) => p.x).join(',') } });
  await move(c, 'AWAITING_PERSONAL', { outcome: null, type: 'INVITED_PERSONAL', description: `הוזמן לפגישה אישית לבירור נוסף${fromGroup ? ' בעקבות הראיון הקבוצתי' : ''}` });
  await trySend(id, 'intake.invite.personal', { מועדים: parsed.map((p) => fmtLocal(p.d!)).join(' או '), קישור: `${baseUrl()}/meeting/${inv.token}` });
  return getCandidate(id);
}

/** קביעת מועד לפגישה האישית (בחירת המועמד או קביעה ידנית של הרכז) + תזכורת באותו יום */
export async function scheduleMeeting(id: number, when: string, invitationId?: number) {
  const c = await load(id);
  requireStatus(c, ['AWAITING_PERSONAL'], 'לקבוע פגישה אישית');
  const d = parseLocal(when);
  if (!d) throw new AppError(400, 'VALIDATION', 'מועד לא תקין', { fields: { scheduledAt: 'מועד לא תקין' } });
  const existing = await prisma.personalMeeting.findFirst({ where: { candidateId: id, decision: null, noShow: false }, orderBy: { id: 'desc' } });
  const m = existing
    ? await prisma.personalMeeting.update({ where: { id: existing.id }, data: { scheduledAt: d } })
    : await prisma.personalMeeting.create({ data: { candidateId: id, scheduledAt: d } });
  if (invitationId) await prisma.candidateInvitation.update({ where: { id: invitationId }, data: { respondedAt: new Date(), response: 'SIGNED', chosen: when } });
  await addEvent(id, 'MEETING_SCHEDULED', `נקבעה פגישה אישית ב-${fmtLocal(d)}`, null, null, !!invitationId);
  await trySend(id, 'intake.meeting.confirmed', { מועד: fmtLocal(d) });
  const morning = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0);
  await cancelJob(`intake:pm:${m.id}`);
  if (morning > new Date()) await scheduleJob('intake.reminder', morning, { kind: 'personal', meetingId: m.id, at: d.toISOString() }, `intake:pm:${m.id}`);
  return getCandidate(id);
}

export async function meetingHeld(id: number, heldAt?: string | null) {
  const c = await load(id);
  requireStatus(c, ['AWAITING_PERSONAL'], 'לסמן שהפגישה התקיימה');
  const m = await prisma.personalMeeting.findFirst({ where: { candidateId: id, decision: null, noShow: false }, orderBy: { id: 'desc' } });
  if (!m?.scheduledAt) throw new AppError(409, 'NO_MEETING', 'לא נקבע מועד לפגישה אישית');
  await prisma.personalMeeting.update({ where: { id: m.id }, data: { heldAt: heldAt ? parseDateOnly(heldAt) : new Date() } });
  await addEvent(id, 'MEETING_HELD', 'הפגישה האישית התקיימה');
  return getCandidate(id);
}

export async function meetingNoShow(id: number) {
  const c = await load(id);
  requireStatus(c, ['AWAITING_PERSONAL'], 'לסמן אי-הגעה');
  const m = await prisma.personalMeeting.findFirst({ where: { candidateId: id, decision: null, noShow: false }, orderBy: { id: 'desc' } });
  if (!m?.scheduledAt) throw new AppError(409, 'NO_MEETING', 'לא נקבע מועד לפגישה אישית');
  await prisma.personalMeeting.update({ where: { id: m.id }, data: { noShow: true } });
  await move(c, 'AIR', { outcome: 'PERSONAL_NO_SHOW', type: 'NO_SHOW', description: 'קבע פגישה אישית ולא הגיע' });
  return getCandidate(id);
}

export const personalDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT', 'NOT_NOW']),
  note: optStr(1000),
  sendMessage: z.boolean().default(false), // הודעות לא נשלחות אוטומטית: הרכז מסמן (לפעמים כבר אמר בעל פה)
});

export async function personalDecision(id: number, input: z.infer<typeof personalDecisionSchema>) {
  const c = await load(id);
  requireStatus(c, ['AWAITING_PERSONAL'], 'לקבל החלטה בעקבות פגישה אישית');
  const m = await prisma.personalMeeting.findFirst({ where: { candidateId: id, decision: null, noShow: false }, orderBy: { id: 'desc' } });
  if (!m?.scheduledAt) throw new AppError(409, 'NO_MEETING', 'לא נקבע מועד לפגישה אישית');
  await prisma.personalMeeting.update({ where: { id: m.id }, data: { decision: input.decision, decisionNote: input.note ?? null, decidedAt: new Date(), heldAt: m.heldAt ?? new Date() } });
  if (input.decision === 'ACCEPT') return acceptCandidate(id, input.sendMessage);
  if (input.decision === 'REJECT') {
    await move(c, 'REJECTED', { outcome: 'REJECT_AFTER_PERSONAL', type: 'REJECTED', description: 'נדחה אחרי פגישה אישית', extra: { rejectionReason: 'OTHER', rejectionNote: input.note ?? null } });
    if (input.sendMessage) await trySend(id, 'intake.rejected.personal');
  } else {
    await move(c, 'MAYBE_FUTURE', { outcome: 'TEMP_REJECT', type: 'NOT_NOW', description: 'כרגע לא מתאים, מוזמן לנסות שוב בעתיד' });
    if (input.sendMessage) await trySend(id, 'intake.notnow');
  }
  return getCandidate(id);
}

// ======================= קבלה: נוצר כרטיס חבר =======================

export async function acceptCandidate(id: number, sendMessage = true) {
  const c = await load(id);
  requireStatus(c, ['INVITED_GROUP', 'AWAITING_PERSONAL', 'MAYBE_FUTURE', 'AIR'], 'לקבל מועמד');
  if (c.memberId) throw new AppError(409, 'ALREADY_MEMBER', 'המועמד כבר התקבל');

  // חבר קיים (למשל חזר להגיש בקשה): לא יוצרים כפילות
  let memberId = c.existingMemberId;
  if (!memberId && c.nationalId) memberId = (await prisma.member.findUnique({ where: { nationalId: c.nationalId } }))?.id ?? null;
  if (!memberId) {
    const m = await createMember({
      firstName: c.firstName,
      lastName: c.lastName,
      gender: (c.gender as 'MALE' | 'FEMALE' | null) ?? null,
      phone: c.phone,
      email: c.email,
      nationalId: c.nationalId,
      birthYear: c.birthDate ? c.birthDate.getUTCFullYear() : null,
      maritalStatus: (c.maritalStatus as 'SINGLE' | null) ?? null,
      preferredChannel: c.preferredChannel === 'EMAIL' ? 'EMAIL' : 'SMS',
      joinDate: todayDateOnly(),
      allowDuplicatePhone: true,
    });
    memberId = m.id;
  }
  await move(c, 'ACCEPTED', { outcome: null, type: 'ACCEPTED', description: 'התקבל לחצר. נוצר כרטיס חבר', extra: { memberId } });
  if (sendMessage) {
    const s = await getSettings();
    await trySend(id, 'intake.accepted', { 'קוד כניסה': s['intake.entryCode'] || 'יימסר בנפרד', 'קישור וואטסאפ': s['intake.whatsappLink'] || 'יימסר בנפרד' });
  }
  return getCandidate(id);
}

// ======================= תזכורות לרכז, סריקה אוטומטית ומעקב =======================

/** תזכורות לרכז הקבלה: בקשה שלא טופלה 10 ימים, החלטות שלא סומנו 7 ימים אחרי ראיון, פחות משני ראיונות עתידיים */
export async function alerts() {
  const now = new Date();
  const unhandled = await prisma.candidate.findMany({ where: { status: { in: UNHANDLED }, submittedAt: { lte: new Date(now.getTime() - 10 * 86_400_000) } }, orderBy: { submittedAt: 'asc' } });
  const weekAgo = parseDateOnly(addDays(todayDateOnly(), -7));
  const stale = await prisma.interviewSession.findMany({
    where: { date: { lte: weekAgo }, signups: { some: { decision: null, candidate: { status: 'INVITED_GROUP' } } } },
    include: { signups: { where: { decision: null, candidate: { status: 'INVITED_GROUP' } } } },
    orderBy: { date: 'asc' },
  });
  const future = (await prisma.interviewSession.findMany()).filter((s) => sessionStart(s.date, s.startTime) > now).length;
  return {
    unhandled: unhandled.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, days: Math.floor((now.getTime() - c.submittedAt.getTime()) / 86_400_000) })),
    undecidedSessions: stale.map((s) => ({ id: s.id, name: sessionName(s.date), date: toDateOnly(s.date)!, pending: s.signups.length })),
    futureSessions: future,
    needMoreSessions: future < 2,
  };
}

/** סריקה תקופתית: אין תגובה להזמנה -> באוויר. שבועיים באוויר -> התנדף */
export async function intakeSweep(now: Date = new Date()) {
  const s = await getSettings();
  const noReply = new Date(now.getTime() - numSetting(s, 'intake.noReplyDays') * 86_400_000);
  const fade = new Date(now.getTime() - numSetting(s, 'intake.fadeDays') * 86_400_000);
  let toAir = 0;
  let toFaded = 0;

  const groups = await prisma.candidate.findMany({ where: { status: 'INVITED_GROUP' }, include: { invitations: { where: { kind: 'GROUP' }, orderBy: { id: 'desc' }, take: 1 }, signups: true } });
  for (const c of groups) {
    const inv = c.invitations[0];
    if (inv && inv.sentAt <= noReply && inv.response !== 'SIGNED' && !c.signups.length) {
      await move(c, 'AIR', { outcome: 'INVITED_NOT_SIGNED', type: 'AUTO_AIR', description: 'הוזמן לראיון קבוצתי ולא השתבץ ולא הגיב', system: true });
      toAir += 1;
    }
  }
  const personals = await prisma.candidate.findMany({ where: { status: 'AWAITING_PERSONAL' }, include: { invitations: { where: { kind: 'PERSONAL' }, orderBy: { id: 'desc' }, take: 1 }, meetings: true } });
  for (const c of personals) {
    const inv = c.invitations[0];
    if (inv && inv.sentAt <= noReply && !c.meetings.some((m) => m.scheduledAt)) {
      await move(c, 'AIR', { outcome: 'PERSONAL_NOT_SCHEDULED', type: 'AUTO_AIR', description: 'הוזמן לפגישה אישית ולא קבע מועד', system: true });
      toAir += 1;
    }
  }
  const air = await prisma.candidate.findMany({ where: { status: 'AIR', statusChangedAt: { lte: fade } } });
  for (const c of air) {
    await move(c, 'FADED', { type: 'AUTO_FADED', description: 'שבועיים ב"באוויר" ללא התקדמות: עבר ל"התנדף"', system: true });
    toFaded += 1;
  }
  return { toAir, toFaded };
}

registerJobHandler('intake.reminder', async (p: { kind: string; signupId?: number; meetingId?: number; at?: string }) => {
  if (p.kind === 'personal') {
    const m = await prisma.personalMeeting.findUnique({ where: { id: p.meetingId! }, include: { candidate: true } });
    if (!m || m.noShow || m.decision || !m.scheduledAt || m.scheduledAt.toISOString() !== p.at || m.candidate.status !== 'AWAITING_PERSONAL') return;
    await trySend(m.candidateId, 'intake.reminder.personal', { שעה: `${pad(m.scheduledAt.getHours())}:${pad(m.scheduledAt.getMinutes())}` });
    return;
  }
  const s = await prisma.interviewSignup.findUnique({ where: { id: p.signupId! }, include: { session: true, candidate: true } });
  if (!s || s.candidate.status !== 'INVITED_GROUP') return;
  const when = `${fmtDate(s.session.date)} ב-${s.session.startTime ?? ''}`;
  await trySend(s.candidateId, p.kind === 'group3d' ? 'intake.reminder.group3d' : 'intake.reminder.groupMorning', { מועד: when, שעה: s.session.startTime ?? '' });
});

/** מעקב פעילות חברים חדשים (הצטרפו בחודשיים האחרונים): מי השתתף ומי כמעט לא */
export async function newMembersReport() {
  const since = parseDateOnly(addDays(todayDateOnly(), -61));
  const members = await prisma.member.findMany({
    where: { joinDate: { gte: since } },
    include: { registrations: { include: { attendance: true } } },
    orderBy: { joinDate: 'desc' },
  });
  return members.map((m) => {
    const registered = m.registrations.filter((r) => r.status === 'ACTIVE').length;
    const present = m.registrations.reduce((n, r) => n + r.attendance.filter((a) => a.status === 'PRESENT').length, 0);
    return {
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      phone: m.phone,
      joinDate: toDateOnly(m.joinDate)!,
      registered,
      present,
      level: present === 0 ? 'NONE' : present === 1 ? 'LOW' : 'OK',
    };
  });
}

/** כרטיס הקבלה של חבר (לטאב "פרטי קבלה" בכרטיס החבר) */
export async function memberIntake(memberId: number) {
  const c = await prisma.candidate.findFirst({ where: { memberId }, orderBy: { id: 'desc' } });
  if (!c) return null;
  return getCandidate(c.id);
}

registerTickHook((now) => intakeSweep(now));
