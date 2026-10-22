import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { toDateOnly } from '../lib/dates';
import { normalizePhone } from '../lib/phone';
import { AnswerInput, assertCanRegister, registerMember } from './registrationService';

/**
 * דף הרישום הציבורי הוא הדגמה בלבד: הזדהות לפי טלפון אינה אימות זהות.
 * לכן אף תשובה כאן אינה חושפת פרטים אישיים של חבר, ואין בו ביטול או עריכה.
 */
const GENERIC_BLOCK = 'לא ניתן להשלים את ההרשמה באמצעות דף זה. אנא פנו למשרד הארגון.';

export async function getPublicWorkshop(id: number) {
  const w = await prisma.workshop.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { date: 'asc' } },
      questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!w) throw notFound('הסדנה');
  const open = w.registrationOpen && (w.status === 'PUBLISHED' || w.status === 'ONGOING');
  let closedReason: string | null = null;
  if (!open) {
    closedReason =
      w.status === 'CANCELLED' ? 'הפעילות בוטלה'
      : w.status === 'FINISHED' ? 'הפעילות הסתיימה'
      : w.status === 'DRAFT' ? 'הפעילות טרם פורסמה'
      : 'ההרשמה סגורה';
  }
  return {
    id: w.id,
    kind: w.kind,
    name: w.name,
    subtitle: w.subtitle,
    description: w.description,
    startDate: toDateOnly(w.sessions[0]?.date),
    endDate: toDateOnly(w.sessions[w.sessions.length - 1]?.date),
    startTime: w.startTime,
    endTime: w.endTime,
    sessionCount: w.sessions.length,
    isPaid: w.isPaid,
    price: w.price,
    registrationRequired: w.registrationRequired,
    registrationOpen: open,
    closedReason,
    questions: w.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      required: q.required,
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
  };
}

async function findMemberByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 9) throw new AppError(400, 'VALIDATION', 'מספר טלפון לא תקין');
  const members = await prisma.member.findMany({ where: { phoneNormalized: normalized }, select: { id: true } });
  if (members.length === 0) throw new AppError(404, 'NOT_A_MEMBER', 'ההרשמה בדף זה מיועדת לחברי הארגון בלבד. ניתן לפנות למשרד להצטרפות.');
  if (members.length > 1) throw new AppError(409, 'BLOCKED', GENERIC_BLOCK);
  return members[0].id;
}

/** מסתיר פרטים אישיים: רק שגיאות ברמת הסדנה או שאלות מוצגות כפי שהן */
const sanitize = (e: unknown): never => {
  if (e instanceof AppError) {
    if (e.code === 'REGISTRATION_CLOSED' || e.code === 'ANSWERS_INVALID' || e.code === 'WORKSHOP_NOT_FOUND') throw e;
    throw new AppError(409, 'BLOCKED', GENERIC_BLOCK);
  }
  throw e;
};

export async function publicCheck(workshopId: number, phone: string) {
  const memberId = await findMemberByPhone(phone);
  try {
    await prisma.$transaction((tx) => assertCanRegister(tx, memberId, workshopId, null, { source: 'PUBLIC' }));
  } catch (e) {
    sanitize(e);
  }
  return { ok: true };
}

export async function publicRegister(workshopId: number, phone: string, answers: AnswerInput[]) {
  const memberId = await findMemberByPhone(phone);
  try {
    await registerMember(memberId, workshopId, answers, { source: 'PUBLIC' });
  } catch (e) {
    sanitize(e);
  }
  return { ok: true, message: 'ההרשמה התקבלה בהצלחה (הדגמת POC בלבד)' };
}
