import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { parseDateOnly, toDateOnly, todayDateOnly } from '../lib/dates';

/** גישור משפחתי מול בני משפחה (הורים): כרטיס נפרד מתהליך ליווי עו"ס */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max = 2000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string({ required_error: 'יש לבחור תאריך' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');

export const PARENTS = ['FATHER', 'MOTHER', 'OTHER'] as const;
export const CONTACT_KINDS = ['CALL', 'MEETING', 'FUTURE_MEETING', 'EXTERNAL_PARENTS_MEETING'] as const;
export const WITH_WHOM = ['MEMBER', 'FATHER', 'MOTHER', 'OTHER'] as const;

export const mediationCreateSchema = z
  .object({
    memberId: z.number({ required_error: 'יש לבחור חבר' }).int(),
    mediator: z.string({ required_error: 'יש לבחור מגשר' }).trim().min(1, 'יש לבחור מגשר').max(80),
    mediator2: optStr(80),
    parents: z.array(z.enum(PARENTS)).min(1, 'יש לבחור לפחות הורה אחד'),
    parentsOther: optStr(200),
    initiatedBy: z.enum(['MEMBER', 'STAFF'], { required_error: 'יש לבחור על יוזמת מי' }),
    need: optStr(3000),
    goal: optStr(3000),
    startDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  })
  .superRefine((v, ctx) => {
    if (v.parents.includes('OTHER') && !v.parentsOther) ctx.addIssue({ code: 'custom', path: ['parentsOther'], message: 'יש לפרט מי נוסף משתתף' });
  });
export const mediationUpdateSchema = z.object({
  mediator: z.string().trim().min(1, 'יש לבחור מגשר').max(80).optional(),
  mediator2: optStr(80),
  parents: z.array(z.enum(PARENTS)).min(1, 'יש לבחור לפחות הורה אחד').optional(),
  parentsOther: optStr(200),
  need: optStr(3000),
  goal: optStr(3000),
});
export const contactSchema = z.object({
  kind: z.enum(CONTACT_KINDS),
  date: dateStr,
  withWhom: z.enum(WITH_WHOM).nullish(),
  summary: optStr(3000),
  place: optStr(200),
  effect: optStr(2000),
});
export const finishMediationSchema = z.object({
  endDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  goalAchieved: z.boolean({ required_error: 'יש לסמן אם היעד הושג' }),
  endSummary: optStr(5000),
});

type Row = Awaited<ReturnType<typeof load>>;

async function load(id: number) {
  const c = await prisma.mediationCase.findUnique({ where: { id }, include: { member: true, contacts: { orderBy: [{ date: 'desc' }, { id: 'desc' }] } } });
  if (!c) throw notFound('כרטיס הגישור');
  return c;
}

const dto = (c: Row) => ({
  id: c.id,
  memberId: c.memberId,
  memberName: `${c.member.firstName} ${c.member.lastName}`,
  mediator: c.mediator,
  mediator2: c.mediator2,
  parents: c.parents.split(',').filter(Boolean),
  parentsOther: c.parentsOther,
  initiatedBy: c.initiatedBy,
  need: c.need,
  goal: c.goal,
  status: c.status,
  startDate: toDateOnly(c.startDate)!,
  endDate: toDateOnly(c.endDate),
  goalAchieved: c.goalAchieved,
  endSummary: c.endSummary,
  contacts: c.contacts.map((k) => ({ id: k.id, kind: k.kind, date: toDateOnly(k.date)!, withWhom: k.withWhom, summary: k.summary, place: k.place, effect: k.effect })),
});

export async function listMediations(filter: { status?: string; memberId?: number }) {
  const rows = await prisma.mediationCase.findMany({
    where: { ...(filter.status ? { status: filter.status } : {}), ...(filter.memberId ? { memberId: filter.memberId } : {}) },
    include: { member: true, contacts: true },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
  return rows.map((c) => ({ ...dto(c), contactCount: c.contacts.length }));
}

export const getMediation = async (id: number) => dto(await load(id));

export async function createMediation(input: z.infer<typeof mediationCreateSchema>) {
  const m = await prisma.member.findUnique({ where: { id: input.memberId } });
  if (!m) throw notFound('החבר');
  const open = await prisma.mediationCase.count({ where: { memberId: input.memberId, status: 'ACTIVE' } });
  if (open) throw new AppError(409, 'MEDIATION_EXISTS', 'לחבר כבר קיים כרטיס גישור פעיל');
  const c = await prisma.mediationCase.create({
    data: {
      memberId: input.memberId,
      mediator: input.mediator,
      mediator2: input.mediator2 ?? null,
      parents: input.parents.join(','),
      parentsOther: input.parents.includes('OTHER') ? input.parentsOther ?? null : null,
      initiatedBy: input.initiatedBy,
      need: input.need ?? null,
      goal: input.goal ?? null,
      startDate: parseDateOnly(input.startDate ?? todayDateOnly()),
    },
  });
  return getMediation(c.id);
}

export async function updateMediation(id: number, input: z.infer<typeof mediationUpdateSchema>) {
  await load(id);
  await prisma.mediationCase.update({
    where: { id },
    data: {
      ...(input.mediator && { mediator: input.mediator }),
      ...(input.mediator2 !== undefined && { mediator2: input.mediator2 }),
      ...(input.parents && { parents: input.parents.join(',') }),
      ...(input.parentsOther !== undefined && { parentsOther: input.parentsOther }),
      ...(input.need !== undefined && { need: input.need }),
      ...(input.goal !== undefined && { goal: input.goal }),
    },
  });
  return getMediation(id);
}

export async function addContact(id: number, input: z.infer<typeof contactSchema>) {
  const c = await load(id);
  if (c.status === 'FINISHED') throw new AppError(409, 'MEDIATION_CLOSED', 'הגישור הסתיים. יש לפתוח אותו מחדש כדי להוסיף תיעוד');
  await prisma.mediationContact.create({
    data: {
      caseId: id,
      kind: input.kind,
      date: parseDateOnly(input.date),
      withWhom: input.withWhom ?? null,
      summary: input.summary ?? null,
      place: input.place ?? null,
      effect: input.effect ?? null,
    },
  });
  return getMediation(id);
}

export async function finishMediation(id: number, input: z.infer<typeof finishMediationSchema>) {
  const c = await load(id);
  if (c.status === 'FINISHED') throw new AppError(409, 'MEDIATION_CLOSED', 'הגישור כבר הסתיים');
  await prisma.mediationCase.update({
    where: { id },
    data: { status: 'FINISHED', endDate: parseDateOnly(input.endDate ?? todayDateOnly()), goalAchieved: input.goalAchieved, endSummary: input.endSummary ?? null },
  });
  return getMediation(id);
}

export async function reopenMediation(id: number) {
  const c = await load(id);
  if (c.status !== 'FINISHED') throw new AppError(409, 'INVALID_STATUS', 'הגישור פעיל');
  await prisma.mediationCase.update({ where: { id }, data: { status: 'ACTIVE', endDate: null, goalAchieved: null } });
  return getMediation(id);
}
