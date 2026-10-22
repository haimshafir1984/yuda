import { Prisma, Workshop, WorkshopSession } from '@prisma/client';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { addDays, parseDateOnly, toDateOnly } from '../lib/dates';
import { z } from 'zod';
import { questionSchema, sessionSchema, workshopCreateSchema, workshopUpdateSchema } from '../validation';

type WorkshopWithSessions = Workshop & { sessions: WorkshopSession[]; _count?: { registrations: number } };

const sortSessions = <T extends WorkshopSession>(s: T[]) =>
  [...s].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id - b.id);

export const workshopDto = (w: WorkshopWithSessions) => {
  const sessions = sortSessions(w.sessions);
  return {
    id: w.id,
    kind: w.kind,
    name: w.name,
    subtitle: w.subtitle,
    description: w.description,
    facilitator: w.facilitator,
    format: w.format,
    startTime: w.startTime,
    endTime: w.endTime,
    isPaid: w.isPaid,
    price: w.price,
    nationalInsurance: w.nationalInsurance,
    status: w.status,
    registrationOpen: w.registrationOpen,
    registrationRequired: w.registrationRequired,
    genderRestriction: w.genderRestriction,
    minAge: w.minAge,
    maxAge: w.maxAge,
    requireNationalInsurance: w.requireNationalInsurance,
    summary: w.summary,
    startDate: toDateOnly(sessions[0]?.date),
    endDate: toDateOnly(sessions[sessions.length - 1]?.date),
    sessionCount: sessions.length,
    registrantCount: w._count?.registrations ?? 0,
  };
};

const withCounts = {
  sessions: true,
  _count: { select: { registrations: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.WorkshopInclude;

export interface WorkshopListQuery {
  q?: string;
  status?: string;
  kind?: string;
  sort?: string;
  order?: string;
}

export async function listWorkshops(query: WorkshopListQuery) {
  const where: Prisma.WorkshopWhereInput = {};
  if (query.q?.trim()) {
    where.OR = [{ name: { contains: query.q.trim() } }, { facilitator: { contains: query.q.trim() } }, { subtitle: { contains: query.q.trim() } }];
  }
  if (query.status) where.status = query.status;
  if (query.kind) where.kind = query.kind;
  const rows = (await prisma.workshop.findMany({ where, include: withCounts })).map(workshopDto);

  const dir = query.order === 'desc' ? -1 : 1;
  const sort = query.sort ?? 'startDate';
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]): number => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'he');
      case 'registrantCount':
        return a.registrantCount - b.registrantCount;
      case 'price':
        return (a.price ?? 0) - (b.price ?? 0);
      case 'status':
        return a.status.localeCompare(b.status);
      default: // תאריכים חסרים (טיוטות) בסוף
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return dir; // מוכפל ב-dir בהמשך ולכן תמיד "אחרי"
        if (!b.startDate) return -dir;
        return a.startDate.localeCompare(b.startDate);
    }
  };
  return rows.sort((a, b) => cmp(a, b) * dir);
}

export async function getWorkshop(id: number) {
  const w = await prisma.workshop.findUnique({ where: { id }, include: withCounts });
  if (!w) throw notFound('הסדנה');
  return workshopDto(w);
}

export async function createWorkshop(input: z.infer<typeof workshopCreateSchema>) {
  const format = input.kind === 'EVENT' ? 'SINGLE' : input.format;
  const count = format === 'MULTI' ? (input.sessionCount ?? 1) : 1;
  const created = await prisma.$transaction(async (tx) => {
    const w = await tx.workshop.create({
      data: {
        kind: input.kind,
        name: input.name,
        subtitle: input.subtitle ?? null,
        description: input.description ?? null,
        facilitator: input.facilitator ?? null,
        format,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        isPaid: input.isPaid,
        price: input.isPaid ? input.price ?? null : null,
        nationalInsurance: input.nationalInsurance,
      },
    });
    if (input.startDate) {
      const data = Array.from({ length: count }, (_, i) => ({
        workshopId: w.id,
        date: parseDateOnly(addDays(input.startDate!, i * 7)),
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      }));
      await tx.workshopSession.createMany({ data });
    }
    return w;
  });
  return getWorkshop(created.id);
}

export async function updateWorkshop(id: number, input: z.infer<typeof workshopUpdateSchema>) {
  const existing = await prisma.workshop.findUnique({ where: { id }, include: { sessions: true } });
  if (!existing) throw notFound('הסדנה');

  const isPaid = input.isPaid ?? existing.isPaid;
  await prisma.$transaction(async (tx) => {
    await tx.workshop.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.facilitator !== undefined && { facilitator: input.facilitator }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.isPaid !== undefined && { isPaid }),
        ...((input.price !== undefined || input.isPaid !== undefined) && {
          price: isPaid ? input.price ?? existing.price : null,
        }),
        ...(input.nationalInsurance !== undefined && { nationalInsurance: input.nationalInsurance }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.registrationOpen !== undefined && { registrationOpen: input.registrationOpen }),
        ...(input.registrationRequired !== undefined && { registrationRequired: input.registrationRequired }),
        ...(input.genderRestriction !== undefined && { genderRestriction: input.genderRestriction }),
        ...(input.minAge !== undefined && { minAge: input.minAge }),
        ...(input.maxAge !== undefined && { maxAge: input.maxAge }),
        ...(input.requireNationalInsurance !== undefined && { requireNationalInsurance: input.requireNationalInsurance }),
        ...(input.summary !== undefined && { summary: input.summary }),
      },
    });

    // בסדנה/אירוע חד-פעמי, תאריך ושעות הכרטיס משקפים את המפגש היחיד
    if (existing.format === 'SINGLE' && (input.startDate !== undefined || input.startTime !== undefined || input.endTime !== undefined)) {
      const single = sortSessions(existing.sessions)[0];
      if (single) {
        await tx.workshopSession.update({
          where: { id: single.id },
          data: {
            ...(input.startDate && { date: parseDateOnly(input.startDate) }),
            ...(input.startTime !== undefined && { startTime: input.startTime }),
            ...(input.endTime !== undefined && { endTime: input.endTime }),
          },
        });
      } else if (input.startDate) {
        await tx.workshopSession.create({
          data: {
            workshopId: id,
            date: parseDateOnly(input.startDate),
            startTime: input.startTime ?? existing.startTime,
            endTime: input.endTime ?? existing.endTime,
          },
        });
      }
    }
  });
  return getWorkshop(id);
}

// ---------- מפגשים ----------

export async function listSessions(workshopId: number) {
  await getWorkshop(workshopId);
  const sessions = await prisma.workshopSession.findMany({
    where: { workshopId },
    include: { attendance: { where: { registration: { status: 'ACTIVE' } } } },
  });
  return sortSessions(sessions).map((s, i) => ({
    id: s.id,
    number: i + 1,
    date: toDateOnly(s.date)!,
    startTime: s.startTime,
    endTime: s.endTime,
    attendanceRecorded: s.attendance.length > 0,
    presentCount: s.attendance.filter((a) => a.status === 'PRESENT').length,
    absentCount: s.attendance.filter((a) => a.status === 'ABSENT').length,
  }));
}

export async function addSession(workshopId: number, input: z.infer<typeof sessionSchema>) {
  const w = await prisma.workshop.findUnique({ where: { id: workshopId }, include: { sessions: true } });
  if (!w) throw notFound('הסדנה');
  if (w.format === 'SINGLE' && w.sessions.length > 0)
    throw new AppError(409, 'SINGLE_SESSION_ONLY', 'סדנה או אירוע חד-פעמיים כוללים מפגש אחד בלבד');
  return prisma.workshopSession.create({
    data: {
      workshopId,
      date: parseDateOnly(input.date),
      startTime: input.startTime ?? w.startTime,
      endTime: input.endTime ?? w.endTime,
    },
  });
}

export async function updateSession(sessionId: number, input: z.infer<typeof sessionSchema>) {
  const s = await prisma.workshopSession.findUnique({ where: { id: sessionId } });
  if (!s) throw notFound('המפגש');
  if (input.startTime && input.endTime && input.endTime <= input.startTime)
    throw new AppError(400, 'VALIDATION', 'שעת הסיום חייבת להיות אחרי שעת ההתחלה');
  return prisma.workshopSession.update({
    where: { id: sessionId },
    data: { date: parseDateOnly(input.date), startTime: input.startTime ?? null, endTime: input.endTime ?? null },
  });
}

export async function deleteSession(sessionId: number) {
  const s = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    include: { workshop: true, _count: { select: { attendance: true } } },
  });
  if (!s) throw notFound('המפגש');
  if (s._count.attendance > 0) throw new AppError(409, 'HAS_ATTENDANCE', 'לא ניתן להסיר מפגש שתועדה בו נוכחות');
  if (s.workshop.format === 'SINGLE') throw new AppError(409, 'SINGLE_SESSION_ONLY', 'לא ניתן להסיר את המפגש היחיד של סדנה או אירוע חד-פעמיים');
  await prisma.workshopSession.delete({ where: { id: sessionId } });
}

// ---------- שאלות הרשמה ----------

const questionInclude = { options: { orderBy: { sortOrder: 'asc' as const } } };

export async function listQuestions(workshopId: number) {
  await getWorkshop(workshopId);
  const qs = await prisma.workshopQuestion.findMany({
    where: { workshopId },
    orderBy: { sortOrder: 'asc' },
    include: { ...questionInclude, _count: { select: { answers: true } } },
  });
  return qs.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    required: q.required,
    answerCount: q._count.answers,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
  }));
}

export async function addQuestion(workshopId: number, input: z.infer<typeof questionSchema>) {
  await getWorkshop(workshopId);
  const max = await prisma.workshopQuestion.aggregate({ where: { workshopId }, _max: { sortOrder: true } });
  await prisma.workshopQuestion.create({
    data: {
      workshopId,
      text: input.text,
      type: input.type,
      required: input.required,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      options: input.type === 'SINGLE_CHOICE' ? { create: input.options.map((o, i) => ({ label: o.label, sortOrder: i })) } : undefined,
    },
  });
  return listQuestions(workshopId);
}

export async function updateQuestion(questionId: number, input: z.infer<typeof questionSchema>) {
  const q = await prisma.workshopQuestion.findUnique({
    where: { id: questionId },
    include: { options: { include: { _count: { select: { answers: true } } } }, _count: { select: { answers: true } } },
  });
  if (!q) throw notFound('השאלה');
  if (q.type !== input.type && q._count.answers > 0)
    throw new AppError(409, 'HAS_ANSWERS', 'לא ניתן לשנות את סוג השאלה לאחר שנמסרו עליה תשובות');

  await prisma.$transaction(async (tx) => {
    await tx.workshopQuestion.update({ where: { id: questionId }, data: { text: input.text, type: input.type, required: input.required } });
    const keepIds = input.type === 'SINGLE_CHOICE' ? input.options.filter((o) => o.id).map((o) => o.id!) : [];
    for (const old of q.options) {
      if (keepIds.includes(old.id)) continue;
      if (old._count.answers > 0) throw new AppError(409, 'HAS_ANSWERS', `לא ניתן להסיר את האפשרות "${old.label}" כי נבחרה בהרשמות קיימות`);
      await tx.questionOption.delete({ where: { id: old.id } });
    }
    if (input.type === 'SINGLE_CHOICE') {
      for (const [i, o] of input.options.entries()) {
        if (o.id && q.options.some((x) => x.id === o.id)) await tx.questionOption.update({ where: { id: o.id }, data: { label: o.label, sortOrder: i } });
        else await tx.questionOption.create({ data: { questionId, label: o.label, sortOrder: i } });
      }
    }
  });
  return listQuestions(q.workshopId);
}

export async function deleteQuestion(questionId: number) {
  const q = await prisma.workshopQuestion.findUnique({ where: { id: questionId }, include: { _count: { select: { answers: true } } } });
  if (!q) throw notFound('השאלה');
  if (q._count.answers > 0) throw new AppError(409, 'HAS_ANSWERS', 'לא ניתן למחוק שאלה שנמסרו עליה תשובות');
  await prisma.workshopQuestion.delete({ where: { id: questionId } });
}
