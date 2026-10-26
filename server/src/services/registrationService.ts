import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { addDays, ageFromBirthYear, parseDateOnly, todayDateOnly, toDateOnly } from '../lib/dates';

export interface AnswerInput {
  questionId: number;
  textValue?: string | null;
  optionId?: number | null;
  optionIds?: number[] | null;
}

export interface RegisterOptions {
  source: 'ADMIN' | 'PUBLIC';
}

/** חלון הבדיקה של אי-הגעות חוזרות: חצי שנה אחורה */
const NO_SHOW_WINDOW_DAYS = 183;
const NO_SHOW_SINGLE_LIMIT = 3; // סדנאות/אירועים חד-פעמיים שלא הגיע אליהם
const NO_SHOW_MULTI_LIMIT = 4; // מפגשים של סדנאות מתמשכות שלא הגיע אליהם

const kindWord = (kind: string) => (kind === 'EVENT' ? 'אירועים' : 'סדנאות');

/**
 * בדיקות הרשמה בצד השרת, לפי הסדר שהוגדר באפיון:
 * חבר קיים -> לא רשום כבר -> הגבלות -> הרשמה פתוחה -> התאמה לקריטריונים -> (באתר בלבד) אי-הגעות חוזרות -> שאלות חובה.
 * הפונקציה מקבלת client (גם טרנזקציה) ומחזירה AppError עם הסיבה הראשונה שנמצאה.
 */
export async function assertCanRegister(
  db: Prisma.TransactionClient,
  memberId: number,
  workshopId: number,
  answers: AnswerInput[] | null,
  opts: RegisterOptions,
) {
  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'החבר לא נמצא');
  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
    include: { questions: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!workshop) throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'הסדנה לא נמצאה');

  const label = workshop.kind === 'EVENT' ? 'האירוע' : 'הסדנה';

  const active = await db.registration.findFirst({ where: { memberId, workshopId, status: 'ACTIVE' } });
  if (active) throw new AppError(409, 'ALREADY_REGISTERED', `החבר כבר רשום ${workshop.kind === 'EVENT' ? 'לאירוע' : 'לסדנה'} זה`);

  // הגבלות: כללית, לפי סוג פעילות, או לפעילות ספציפית
  const restrictions = await db.memberRestriction.findMany({
    where: { memberId, removedAt: null, OR: [{ workshopId: null, kind: null }, { workshopId }, { kind: workshop.kind }] },
  });
  const general = restrictions.find((r) => r.workshopId === null && r.kind === null);
  if (general) throw new AppError(403, 'RESTRICTED', 'החבר מוגבל מהרשמה לכל הסדנאות והאירועים', { reason: general.reason });
  const byKind = restrictions.find((r) => r.kind === workshop.kind);
  if (byKind) throw new AppError(403, 'RESTRICTED', `החבר מוגבל מהרשמה ל${kindWord(workshop.kind)}`, { reason: byKind.reason });
  const specific = restrictions.find((r) => r.workshopId === workshopId);
  if (specific) throw new AppError(403, 'RESTRICTED', `החבר מוגבל מהרשמה ל${label} זה`, { reason: specific.reason });

  if (workshop.status === 'CANCELLED') throw new AppError(409, 'REGISTRATION_CLOSED', `${label} בוטל ולא ניתן להירשם אליו`);
  if (workshop.status === 'FINISHED') throw new AppError(409, 'REGISTRATION_CLOSED', `${label} הסתיים ולא ניתן להירשם אליו`);
  if (opts.source === 'PUBLIC' && workshop.status === 'DRAFT')
    throw new AppError(409, 'REGISTRATION_CLOSED', `${label} טרם פורסם, ההרשמה אליו אינה זמינה`);
  if (!workshop.registrationOpen) throw new AppError(409, 'REGISTRATION_CLOSED', 'ההרשמה סגורה', { closedByFlag: true, customMessage: workshop.closedMessage });

  const reasons: string[] = [];
  if (workshop.genderRestriction) {
    if (!member.gender) reasons.push('חסר מגדר בכרטיס החבר, והסדנה מוגבלת לפי מגדר. יש להשלים את הנתון לפני ההרשמה');
    else if (member.gender !== workshop.genderRestriction)
      reasons.push(workshop.genderRestriction === 'FEMALE' ? `${label} מיועד לנשים בלבד` : `${label} מיועד לגברים בלבד`);
  }
  if (workshop.minAge != null || workshop.maxAge != null) {
    const age = ageFromBirthYear(member.birthYear);
    if (age === null) reasons.push('חסרה שנת לידה בכרטיס החבר, והסדנה מוגבלת לפי גיל. יש להשלים את הנתון לפני ההרשמה');
    else {
      if (workshop.minAge != null && age < workshop.minAge) reasons.push(`גיל מינימלי להשתתפות: ${workshop.minAge} (גיל החבר לפי שנת לידה: ${age})`);
      if (workshop.maxAge != null && age > workshop.maxAge) reasons.push(`גיל מקסימלי להשתתפות: ${workshop.maxAge} (גיל החבר לפי שנת לידה: ${age})`);
    }
  }
  if (workshop.requireNationalInsurance && !member.nationalInsurance) reasons.push(`${label} מיועד לחברי תכנית ביטוח לאומי בלבד`);
  if (workshop.excludeParticipantsOfWorkshopId) {
    const other = await db.workshop.findUnique({ where: { id: workshop.excludeParticipantsOfWorkshopId } });
    const attended = await db.attendance.count({
      where: { status: 'PRESENT', registration: { memberId }, session: { workshopId: workshop.excludeParticipantsOfWorkshopId } },
    });
    if (attended > 0) reasons.push(`${label} מיועד למי שלא השתתפו ב"${other?.name ?? 'סדנה קודמת'}"`);
  }
  if (reasons.length) throw new AppError(422, 'NOT_ELIGIBLE', reasons.join('. '), { reasons, customMessage: workshop.rejectMessage });

  // אי-הגעות חוזרות ללא ביטול מראש: נבדק רק בהרשמה דרך האתר ורק לפעילות חד-פעמית. הצוות יכול לעקוף בהרשמה ידנית.
  if (opts.source === 'PUBLIC' && workshop.format === 'SINGLE') {
    const since = parseDateOnly(addDays(todayDateOnly(), -NO_SHOW_WINDOW_DAYS));
    const absences = await db.attendance.findMany({
      where: { status: 'ABSENT', registration: { memberId }, session: { date: { gte: since } } },
      include: { session: { include: { workshop: { select: { id: true, format: true } } } } },
    });
    const singles = new Set(absences.filter((a) => a.session.workshop.format === 'SINGLE').map((a) => a.session.workshop.id)).size;
    const multis = absences.filter((a) => a.session.workshop.format === 'MULTI').length;
    if (singles >= NO_SHOW_SINGLE_LIMIT || multis >= NO_SHOW_MULTI_LIMIT)
      throw new AppError(403, 'NO_SHOW_BLOCK', 'החבר לא הגיע ללא ביטול מראש למספר פעילויות בחצי השנה האחרונה', { singles, multis });
  }

  // answers === null: בדיקה מקדימה בלבד, ללא שאלות
  if (answers !== null) {
    const errors: Record<number, string> = {};
    for (const q of workshop.questions) {
      const a = answers.find((x) => x.questionId === q.id);
      if (q.type === 'TEXT') {
        const v = a?.textValue?.trim();
        if (q.required && !v) errors[q.id] = 'שאלת חובה';
      } else if (q.type === 'SINGLE_CHOICE') {
        if (!a?.optionId) {
          if (q.required) errors[q.id] = 'שאלת חובה';
        } else if (!q.options.some((o) => o.id === a.optionId)) errors[q.id] = 'האפשרות שנבחרה אינה תקפה';
      } else {
        const ids = a?.optionIds ?? [];
        if (!ids.length) {
          if (q.required) errors[q.id] = 'שאלת חובה';
        } else if (ids.some((id) => !q.options.some((o) => o.id === id))) errors[q.id] = 'אחת האפשרויות שנבחרו אינה תקפה';
      }
    }
    const unknown = answers.filter((a) => !workshop.questions.some((q) => q.id === a.questionId));
    if (unknown.length) throw new AppError(422, 'ANSWERS_INVALID', 'התקבלו תשובות לשאלות שאינן שייכות לסדנה');
    if (Object.keys(errors).length)
      throw new AppError(422, 'ANSWERS_INVALID', 'יש להשלים את שאלות ההרשמה', { errors });
  }
  return { member, workshop };
}

export async function precheckRegistration(memberId: number, workshopId: number) {
  await prisma.$transaction((tx) => assertCanRegister(tx, memberId, workshopId, null, { source: 'ADMIN' }));
}

export async function registerMember(memberId: number, workshopId: number, answers: AnswerInput[], opts: RegisterOptions) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { workshop } = await assertCanRegister(tx, memberId, workshopId, answers, opts);
      const reg = await tx.registration.create({
        data: { memberId, workshopId, source: opts.source },
      });
      for (const q of workshop.questions) {
        const a = answers.find((x) => x.questionId === q.id);
        const text = a?.textValue?.trim();
        if (q.type === 'TEXT' && text) {
          await tx.registrationAnswer.create({ data: { registrationId: reg.id, questionId: q.id, textValue: text } });
        } else if (q.type === 'SINGLE_CHOICE' && a?.optionId) {
          await tx.registrationAnswer.create({ data: { registrationId: reg.id, questionId: q.id, optionId: a.optionId } });
        } else if (q.type === 'MULTI_CHOICE' && a?.optionIds?.length) {
          // בחירה מרובה: התשובה נשמרת כרשימת תוויות, אחרי שכל אפשרות אומתה מול השאלה
          const labels = q.options.filter((o) => a.optionIds!.includes(o.id)).map((o) => o.label);
          await tx.registrationAnswer.create({ data: { registrationId: reg.id, questionId: q.id, textValue: labels.join(', ') } });
        }
      }
      return reg;
    });
  } catch (e) {
    // הגנה משכבת מסד הנתונים מפני מרוץ בין שתי הרשמות במקביל
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError(409, 'ALREADY_REGISTERED', 'החבר כבר רשום לסדנה זו');
    throw e;
  }
}

export async function cancelRegistration(registrationId: number, reason: string | null | undefined) {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg) throw notFound('ההרשמה');
  if (reg.status === 'CANCELLED') throw new AppError(409, 'ALREADY_CANCELLED', 'ההרשמה כבר בוטלה');
  return prisma.registration.update({
    where: { id: registrationId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null },
  });
}

export async function listWorkshopRegistrations(workshopId: number, includeCancelled: boolean) {
  const w = await prisma.workshop.findUnique({ where: { id: workshopId } });
  if (!w) throw notFound('הסדנה');
  const regs = await prisma.registration.findMany({
    where: { workshopId, ...(includeCancelled ? {} : { status: 'ACTIVE' }) },
    orderBy: { registeredAt: 'asc' },
    include: { member: true, _count: { select: { answers: true } } },
  });
  return regs.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    memberName: `${r.member.firstName} ${r.member.lastName}`,
    phone: r.member.phone,
    status: r.status,
    source: r.source,
    registeredAt: r.registeredAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    answerCount: r._count.answers,
  }));
}

export async function getRegistrationDetails(registrationId: number) {
  const r = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      member: true,
      workshop: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
      answers: { include: { option: true } },
    },
  });
  if (!r) throw notFound('ההרשמה');
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: `${r.member.firstName} ${r.member.lastName}`,
    workshopId: r.workshopId,
    workshopName: r.workshop.name,
    status: r.status,
    registeredAt: r.registeredAt.toISOString(),
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    answers: r.workshop.questions.map((q) => {
      const a = r.answers.find((x) => x.questionId === q.id);
      return {
        questionId: q.id,
        question: q.text,
        required: q.required,
        answer: a ? (a.option ? a.option.label : a.textValue) : null,
      };
    }),
  };
}

// ---------- נוכחות ----------

export async function getSessionAttendance(sessionId: number) {
  const s = await prisma.workshopSession.findUnique({ where: { id: sessionId }, include: { workshop: { include: { sessions: true } } } });
  if (!s) throw notFound('המפגש');
  const ordered = [...s.workshop.sessions].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);
  const regs = await prisma.registration.findMany({
    where: { workshopId: s.workshopId, status: 'ACTIVE' },
    orderBy: { registeredAt: 'asc' },
    include: { member: true, attendance: { where: { sessionId } } },
  });
  const rows = regs.map((r) => ({
    registrationId: r.id,
    memberId: r.memberId,
    memberName: `${r.member.firstName} ${r.member.lastName}`,
    phone: r.member.phone,
    status: (r.attendance[0]?.status ?? 'UNMARKED') as 'PRESENT' | 'ABSENT' | 'UNMARKED',
  }));
  return {
    session: {
      id: s.id,
      number: ordered.findIndex((x) => x.id === s.id) + 1,
      date: toDateOnly(s.date)!,
      startTime: s.startTime,
      endTime: s.endTime,
    },
    summary: {
      registered: rows.length,
      present: rows.filter((r) => r.status === 'PRESENT').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unmarked: rows.filter((r) => r.status === 'UNMARKED').length,
    },
    rows,
  };
}

export async function setAttendance(sessionId: number, registrationId: number, status: 'PRESENT' | 'ABSENT' | null) {
  const s = await prisma.workshopSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound('המפגש');
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.workshopId !== s.workshopId) throw new AppError(400, 'INVALID_REGISTRATION', 'ההרשמה אינה שייכת לסדנה של המפגש');
  if (reg.status !== 'ACTIVE') throw new AppError(409, 'REGISTRATION_CANCELLED', 'לא ניתן לסמן נוכחות להרשמה שבוטלה');

  if (status === null) {
    await prisma.attendance.deleteMany({ where: { registrationId, sessionId } });
  } else {
    await prisma.attendance.upsert({
      where: { registrationId_sessionId: { registrationId, sessionId } },
      create: { registrationId, sessionId, status },
      update: { status, markedAt: new Date() },
    });
  }
  return getSessionAttendance(sessionId);
}
