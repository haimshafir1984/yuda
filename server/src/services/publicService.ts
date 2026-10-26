import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { toDateOnly } from '../lib/dates';
import { normalizePhone } from '../lib/phone';
import { AnswerInput, assertCanRegister, registerMember } from './registrationService';

/**
 * דף הרישום הציבורי הוא הדגמה בלבד: הזדהות לפי טלפון אינה אימות זהות.
 * לפי מסמך הדרישות מוצגת הודעה ייעודית לכל סיבת דחייה, אך ללא פרטים אישיים:
 * ההודעה אינה כוללת גיל, נתוני כרטיס או הסיבה הפנימית של הגבלה.
 */
export const DEFAULT_MESSAGES = {
  NOT_A_MEMBER: 'ההרשמה בדף זה מיועדת לחברי הארגון בלבד. ניתן לפנות למשרד להצטרפות.',
  ALREADY_REGISTERED: 'את/ה כבר רשום/ה לפעילות זו, ואין צורך להירשם שוב.',
  NOT_ELIGIBLE: 'לצערנו הפעילות אינה מתאימה לך לפי הקריטריונים שהוגדרו. לשאלות ניתן לפנות למשרד.',
  RESTRICTED: 'קיימת הגבלת רישום על חשבונך, ולכן לא ניתן להירשם דרך האתר. אנא פנו למשרד הארגון.',
  NO_SHOW_BLOCK: 'לא ניתן להירשם כעת עקב אי-הגעה ללא ביטול מראש למספר פעילויות בחצי השנה האחרונה. אנא פנו למשרד הארגון.',
  AMBIGUOUS: 'לא ניתן להשלים את ההרשמה באמצעות דף זה. אנא פנו למשרד הארגון.',
  COMPLETED: 'ההרשמה התקבלה בהצלחה. אנחנו שומרים לך מקום (הדגמת POC בלבד).',
  CLOSED: 'ההרשמה סגורה.',
};

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
      : w.closedMessage ?? DEFAULT_MESSAGES.CLOSED;
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
    priceType: w.priceType,
    registrationRequired: w.registrationMode === 'REQUIRED',
    registrationMode: w.registrationMode,
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
  if (members.length === 0) throw new AppError(404, 'NOT_A_MEMBER', DEFAULT_MESSAGES.NOT_A_MEMBER);
  if (members.length > 1) throw new AppError(409, 'BLOCKED', DEFAULT_MESSAGES.AMBIGUOUS);
  return members[0].id;
}

/** ממפה כל סיבת דחייה להודעה ייעודית, בלי לחשוף פרטים אישיים */
const sanitize = (e: unknown): never => {
  if (!(e instanceof AppError)) throw e;
  switch (e.code) {
    case 'ANSWERS_INVALID':
    case 'WORKSHOP_NOT_FOUND':
      throw e;
    case 'REGISTRATION_CLOSED': {
      const custom = (e.details as { customMessage?: string | null } | undefined)?.customMessage;
      throw new AppError(e.status, e.code, custom ?? e.message);
    }
    case 'ALREADY_REGISTERED':
      throw new AppError(409, 'ALREADY_REGISTERED', DEFAULT_MESSAGES.ALREADY_REGISTERED);
    case 'NOT_ELIGIBLE': {
      const custom = (e.details as { customMessage?: string | null } | undefined)?.customMessage;
      throw new AppError(422, 'NOT_ELIGIBLE', custom ?? DEFAULT_MESSAGES.NOT_ELIGIBLE);
    }
    case 'RESTRICTED':
      throw new AppError(403, 'RESTRICTED', DEFAULT_MESSAGES.RESTRICTED);
    case 'NO_SHOW_BLOCK':
      throw new AppError(403, 'NO_SHOW_BLOCK', DEFAULT_MESSAGES.NO_SHOW_BLOCK);
    default:
      throw new AppError(409, 'BLOCKED', DEFAULT_MESSAGES.AMBIGUOUS);
  }
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
  const w = await prisma.workshop.findUnique({ where: { id: workshopId }, select: { completionMessage: true } });
  return { ok: true, message: w?.completionMessage ?? DEFAULT_MESSAGES.COMPLETED };
}
