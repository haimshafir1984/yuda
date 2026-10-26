import { Prisma, Member } from '@prisma/client';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { ageFromBirthYear, parseDateOnly, tenureFromJoinDate, toDateOnly, todayDateOnly } from '../lib/dates';
import { normalizePhone } from '../lib/phone';
import { MemberInput } from '../validation';

export const memberDto = (m: Member) => ({
  id: m.id,
  firstName: m.firstName,
  lastName: m.lastName,
  fullName: `${m.firstName} ${m.lastName}`,
  gender: m.gender,
  phone: m.phone,
  email: m.email,
  nationalId: m.nationalId,
  birthYear: m.birthYear,
  age: ageFromBirthYear(m.birthYear),
  maritalStatus: m.maritalStatus,
  nationalInsurance: m.nationalInsurance,
  preferredChannel: m.preferredChannel,
  joinDate: toDateOnly(m.joinDate),
  tenure: tenureFromJoinDate(m.joinDate),
});

export interface MemberListQuery {
  q?: string;
  gender?: string;
  nationalInsurance?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

const buildSearch = (q: string | undefined): Prisma.MemberWhereInput => {
  const tokens = (q ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return {};
  return {
    AND: tokens.map((t) => {
      const digits = t.replace(/\D/g, '');
      const or: Prisma.MemberWhereInput[] = [
        { firstName: { contains: t } },
        { lastName: { contains: t } },
        { nationalId: { contains: t } },
        { phone: { contains: t } },
      ];
      if (digits.length >= 3) or.push({ phoneNormalized: { contains: digits } });
      return { OR: or };
    }),
  };
};

export async function listMembers(query: MemberListQuery) {
  const where: Prisma.MemberWhereInput = { ...buildSearch(query.q) };
  if (query.gender === 'MALE' || query.gender === 'FEMALE') where.gender = query.gender;
  if (query.nationalInsurance === 'true') where.nationalInsurance = true;
  if (query.nationalInsurance === 'false') where.nationalInsurance = false;

  const dir: 'asc' | 'desc' = query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 20));
  const sort = query.sort ?? 'name';

  const counts = await prisma.registration.groupBy({
    by: ['memberId'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.memberId, c._count._all]));
  const total = await prisma.member.count({ where });

  let members: Member[];
  if (sort === 'workshopCount') {
    const all = await prisma.member.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    all.sort((a, b) => ((countMap.get(a.id) ?? 0) - (countMap.get(b.id) ?? 0)) * (dir === 'asc' ? 1 : -1));
    members = all.slice((page - 1) * pageSize, page * pageSize);
  } else {
    let orderBy: Prisma.MemberOrderByWithRelationInput[];
    switch (sort) {
      case 'phone':
        orderBy = [{ phoneNormalized: dir }];
        break;
      case 'age': // גיל גבוה = שנת לידה נמוכה
        orderBy = [{ birthYear: dir === 'asc' ? 'desc' : 'asc' }];
        break;
      case 'gender':
        orderBy = [{ gender: dir }, { lastName: 'asc' }];
        break;
      case 'joinDate':
        orderBy = [{ joinDate: dir }, { id: dir }];
        break;
      case 'nationalInsurance':
        orderBy = [{ nationalInsurance: dir }, { lastName: 'asc' }];
        break;
      default:
        orderBy = [{ lastName: dir }, { firstName: dir }];
    }
    members = await prisma.member.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });
  }

  return {
    items: members.map((m) => ({ ...memberDto(m), workshopCount: countMap.get(m.id) ?? 0 })),
    total,
    page,
    pageSize,
  };
}

export async function getMember(id: number) {
  const m = await prisma.member.findUnique({ where: { id } });
  if (!m) throw notFound('החבר');
  return memberDto(m);
}

async function assertUnique(input: MemberInput, excludeId?: number) {
  if (input.nationalId) {
    const dup = await prisma.member.findUnique({ where: { nationalId: input.nationalId } });
    if (dup && dup.id !== excludeId)
      throw new AppError(409, 'DUPLICATE_NATIONAL_ID', 'כבר קיים חבר עם תעודת זהות זו', {
        existing: { id: dup.id, fullName: `${dup.firstName} ${dup.lastName}` },
      });
  }
  if (!input.allowDuplicatePhone) {
    const dup = await prisma.member.findFirst({
      where: { phoneNormalized: normalizePhone(input.phone), ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (dup)
      throw new AppError(409, 'DUPLICATE_PHONE', 'מספר הטלפון כבר קיים במערכת אצל חבר אחר', {
        existing: { id: dup.id, fullName: `${dup.firstName} ${dup.lastName}` },
      });
  }
}

const memberData = (input: MemberInput) => ({
  firstName: input.firstName,
  lastName: input.lastName,
  gender: input.gender ?? null,
  phone: input.phone,
  phoneNormalized: normalizePhone(input.phone),
  email: input.email ?? null,
  nationalId: input.nationalId ?? null,
  birthYear: input.birthYear ?? null,
  maritalStatus: input.maritalStatus ?? null,
  nationalInsurance: input.nationalInsurance ?? false,
  preferredChannel: input.preferredChannel ?? 'SMS',
  joinDate: parseDateOnly(input.joinDate ?? todayDateOnly()),
});

export async function createMember(input: MemberInput) {
  await assertUnique(input);
  try {
    const m = await prisma.member.create({ data: memberData(input) });
    return memberDto(m);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError(409, 'DUPLICATE_NATIONAL_ID', 'כבר קיים חבר עם תעודת זהות זו');
    throw e;
  }
}

export async function updateMember(id: number, input: MemberInput) {
  const existing = await prisma.member.findUnique({ where: { id } });
  if (!existing) throw notFound('החבר');
  await assertUnique(input, id);
  try {
    const m = await prisma.member.update({ where: { id }, data: memberData(input) });
    return memberDto(m);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError(409, 'DUPLICATE_NATIONAL_ID', 'כבר קיים חבר עם תעודת זהות זו');
    throw e;
  }
}

export async function updatePreferences(id: number, preferredChannel: string) {
  const existing = await prisma.member.findUnique({ where: { id } });
  if (!existing) throw notFound('החבר');
  return memberDto(await prisma.member.update({ where: { id }, data: { preferredChannel } }));
}

// ---------- פעילות קבוצתית ----------

type Category = 'future' | 'active' | 'history';

export async function memberActivity(memberId: number) {
  await getMember(memberId);
  const regs = await prisma.registration.findMany({
    where: { memberId },
    orderBy: { registeredAt: 'desc' },
    include: {
      workshop: { include: { sessions: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] } } },
      attendance: true,
    },
  });
  const today = todayDateOnly();

  return regs.map((r) => {
    const w = r.workshop;
    const dates = w.sessions.map((s) => toDateOnly(s.date)!);
    const startDate = dates[0] ?? null;
    const endDate = dates[dates.length - 1] ?? null;
    const present = r.attendance.filter((a) => a.status === 'PRESENT').length;
    const absent = r.attendance.filter((a) => a.status === 'ABSENT').length;

    let category: Category;
    if (r.status === 'CANCELLED' || w.status === 'FINISHED' || w.status === 'CANCELLED') category = 'history';
    else if (w.status === 'ONGOING' || (startDate && startDate <= today && endDate && endDate >= today)) category = 'active';
    else if (endDate && endDate < today) category = 'history';
    else category = 'future';

    return {
      registrationId: r.id,
      workshopId: w.id,
      workshopName: w.name,
      kind: w.kind,
      startDate,
      endDate,
      workshopStatus: w.status,
      registrationStatus: r.status,
      registeredAt: r.registeredAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      category,
      attendance: { present, absent, totalSessions: w.sessions.length },
    };
  });
}

/** פירוט נוכחות לפי מפגש עבור כל ההרשמות הפעילות של החבר */
export async function memberSessionAttendance(memberId: number) {
  await getMember(memberId);
  const regs = await prisma.registration.findMany({
    where: { memberId, status: 'ACTIVE' },
    include: {
      workshop: { include: { sessions: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] } } },
      attendance: true,
    },
  });
  const rows = regs.flatMap((r) =>
    r.workshop.sessions.map((s, i) => ({
      registrationId: r.id,
      workshopId: r.workshopId,
      workshopName: r.workshop.name,
      sessionId: s.id,
      sessionNumber: i + 1,
      date: toDateOnly(s.date)!,
      startTime: s.startTime,
      status: (r.attendance.find((a) => a.sessionId === s.id)?.status ?? 'UNMARKED') as 'PRESENT' | 'ABSENT' | 'UNMARKED',
    })),
  );
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.workshopName.localeCompare(b.workshopName));
}

/** חריגות: ביטולי הרשמה והיעדרויות שסומנו בפועל (לא מיוצרות עבור מפגש שטרם נבדקה בו נוכחות) */
export async function memberExceptions(memberId: number) {
  await getMember(memberId);
  const [cancelled, absences] = await Promise.all([
    prisma.registration.findMany({
      where: { memberId, status: 'CANCELLED' },
      include: { workshop: true },
    }),
    prisma.attendance.findMany({
      where: { status: 'ABSENT', registration: { memberId } },
      include: { session: { include: { workshop: true } } },
    }),
  ]);
  const rows = [
    ...cancelled.map((r) => ({
      id: `c${r.id}`,
      type: 'CANCELLATION' as const,
      workshopId: r.workshopId,
      workshopName: r.workshop.name,
      date: (r.cancelledAt ?? r.registeredAt).toISOString(),
      details: r.cancelReason ? `סיבה: ${r.cancelReason}` : null,
    })),
    ...absences.map((a) => ({
      id: `a${a.id}`,
      type: 'ABSENCE' as const,
      workshopId: a.session.workshopId,
      workshopName: a.session.workshop.name,
      date: a.session.date.toISOString(),
      details: null as string | null,
    })),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- הגבלות ----------

export async function listRestrictions(memberId: number) {
  await getMember(memberId);
  const rows = await prisma.memberRestriction.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    include: { workshop: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    scope: r.workshopId ? ('WORKSHOP' as const) : r.kind ? ('KIND' as const) : ('GENERAL' as const),
    kind: r.kind,
    workshopId: r.workshopId,
    workshopName: r.workshop?.name ?? null,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    removedAt: r.removedAt?.toISOString() ?? null,
    active: !r.removedAt,
  }));
}

export async function addRestriction(
  memberId: number,
  workshopId: number | null | undefined,
  reason: string | null | undefined,
  kind?: 'WORKSHOP' | 'EVENT' | null,
) {
  await getMember(memberId);
  if (workshopId) {
    const w = await prisma.workshop.findUnique({ where: { id: workshopId }, include: { sessions: true } });
    if (!w) throw notFound('הסדנה');
    // לפי המסמך: ניתן לבחור רק פעילות שטרם התקיימה
    const last = w.sessions.map((s) => toDateOnly(s.date)!).sort().pop();
    if (w.status === 'FINISHED' || w.status === 'CANCELLED' || (last && last < todayDateOnly()))
      throw new AppError(422, 'WORKSHOP_PAST', 'ניתן להגביל רק פעילות שטרם התקיימה');
  }
  const dup = await prisma.memberRestriction.findFirst({
    where: { memberId, workshopId: workshopId ?? null, kind: kind ?? null, removedAt: null },
  });
  if (dup) throw new AppError(409, 'RESTRICTION_EXISTS', 'הגבלה זהה כבר קיימת וממתינה להסרה');
  return prisma.memberRestriction.create({ data: { memberId, workshopId: workshopId ?? null, kind: kind ?? null, reason: reason ?? null } });
}

// ---------- הערות עו"סית בכרטיס החבר (טבלה נפרדת, לא בטבלת החברים הראשית) ----------

export async function listNotes(memberId: number) {
  await getMember(memberId);
  const rows = await prisma.memberNote.findMany({ where: { memberId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return rows.map((n) => ({ id: n.id, text: n.text, author: n.author, createdAt: n.createdAt.toISOString() }));
}

export async function addNote(memberId: number, text: string, author: string | null | undefined) {
  await getMember(memberId);
  await prisma.memberNote.create({ data: { memberId, text, author: author ?? null } });
  return listNotes(memberId);
}

export async function removeRestriction(memberId: number, restrictionId: number) {
  const r = await prisma.memberRestriction.findFirst({ where: { id: restrictionId, memberId } });
  if (!r) throw notFound('ההגבלה');
  if (r.removedAt) return r;
  return prisma.memberRestriction.update({ where: { id: r.id }, data: { removedAt: new Date() } });
}
