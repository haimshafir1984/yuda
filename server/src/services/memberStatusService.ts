import { prisma } from '../db';
import { currentActorName } from '../auth/context';
import { AppError, notFound } from '../errors';
import { addDays, parseDateOnly, toDateOnly, todayDateOnly } from '../lib/dates';
import { REMOVAL_KINDS, getMember, memberDto } from './memberService';

/** סטטוס חבר, הרחקות ודוח חברים לא פעילים (שלב א׳ של עדכון האפיון, נובמבר 2026) */

export interface RemovalInput {
  kind: (typeof REMOVAL_KINDS)[number];
  date?: string | null;
  reason: string;
  description?: string | null;
  handledBy?: string | null;
  endDate?: string | null;
  condition?: string | null;
  complaintId?: number | null;
}

const STATUS_OF_KIND = { TEMPORARY: 'REMOVED_TEMP', CONDITIONAL: 'REMOVED_CONDITIONAL', PERMANENT: 'REMOVED_PERMANENT' } as const;

const fieldError = (field: string, message: string) => new AppError(400, 'VALIDATION', message, { fields: { [field]: message } });

type RemovalRow = Awaited<ReturnType<typeof prisma.memberRemoval.findFirstOrThrow>>;

export const removalDto = (r: RemovalRow) => ({
  id: r.id,
  kind: r.kind,
  date: toDateOnly(r.date),
  reason: r.reason,
  description: r.description,
  handledBy: r.handledBy,
  endDate: toDateOnly(r.endDate),
  condition: r.condition,
  complaintId: r.complaintId,
  returnedAt: toDateOnly(r.returnedAt),
  returnedBy: r.returnedBy,
  returnNote: r.returnNote,
  active: !r.returnedAt,
  // הסטטוס לא משתנה אוטומטית: הרחקה זמנית שתאריך הסיום שלה עבר ממתינה להחלטת איש צוות
  endDatePassed: !r.returnedAt && !!r.endDate && toDateOnly(r.endDate)! < todayDateOnly(),
});

export async function listRemovals(memberId: number) {
  await getMember(memberId);
  const rows = await prisma.memberRemoval.findMany({ where: { memberId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return rows.map(removalDto);
}

export async function addRemoval(memberId: number, input: RemovalInput) {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m) throw notFound('החבר');
  if (m.status.startsWith('REMOVED')) throw new AppError(409, 'ALREADY_REMOVED', 'החבר כבר מורחק. יש להחזיר אותו מההרחקה לפני הרחקה חדשה');
  if (input.kind === 'TEMPORARY' && !input.endDate) throw fieldError('endDate', 'יש להזין תאריך סיום להרחקה זמנית');
  if (input.kind === 'CONDITIONAL' && !input.condition) throw fieldError('condition', 'יש להזין את התנאי לחזרה');
  const date = parseDateOnly(input.date ?? todayDateOnly());
  if (input.endDate && parseDateOnly(input.endDate) < date) throw fieldError('endDate', 'תאריך הסיום קודם לתאריך ההרחקה');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.memberRemoval.create({
      data: {
        memberId,
        kind: input.kind,
        date,
        reason: input.reason,
        description: input.description ?? null,
        handledBy: input.handledBy ?? currentActorName(),
        endDate: input.kind === 'TEMPORARY' && input.endDate ? parseDateOnly(input.endDate) : null,
        condition: input.kind === 'CONDITIONAL' ? input.condition ?? null : null,
        complaintId: input.complaintId ?? null,
      },
    });
    await tx.member.update({ where: { id: memberId }, data: { status: STATUS_OF_KIND[input.kind] } });
    return created;
  });
  return removalDto(row);
}

/** החזרה מהרחקה: ידנית בלבד, ביוזמת החבר. לא מתבצעת אוטומטית גם אחרי תאריך הסיום */
export async function returnFromRemoval(memberId: number, removalId: number, note: string | null | undefined) {
  const r = await prisma.memberRemoval.findFirst({ where: { id: removalId, memberId } });
  if (!r) throw notFound('ההרחקה');
  if (r.returnedAt) throw new AppError(409, 'ALREADY_RETURNED', 'החבר כבר הוחזר מהרחקה זו');
  await prisma.$transaction(async (tx) => {
    await tx.memberRemoval.update({ where: { id: r.id }, data: { returnedAt: new Date(), returnedBy: currentActorName(), returnNote: note ?? null } });
    const stillOpen = await tx.memberRemoval.count({ where: { memberId, returnedAt: null, id: { not: r.id } } });
    if (!stillOpen) await tx.member.update({ where: { id: memberId }, data: { status: 'ACTIVE' } });
  });
  return listRemovals(memberId);
}

/** העברה ל"לא פעיל" ובחזרה. חבר מורחק משנה סטטוס רק דרך ההרחקות */
export async function setActiveState(memberId: number, status: 'ACTIVE' | 'INACTIVE') {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m) throw notFound('החבר');
  if (m.status.startsWith('REMOVED')) throw new AppError(409, 'MEMBER_REMOVED', 'חבר מורחק משנה סטטוס רק דרך החזרה מהרחקה');
  return memberDto(await prisma.member.update({ where: { id: memberId }, data: { status } }));
}

/** חברים פעילים שלא השתתפו באף פעילות מתועדת במשך שנה (ומוכרים לפחות שנה). דוח התראה בלבד, לא משנה סטטוס */
export async function inactiveCandidates() {
  const since = parseDateOnly(addDays(todayDateOnly(), -365));
  const present = await prisma.attendance.findMany({
    where: { status: 'PRESENT', session: { date: { gte: since } } },
    select: { registration: { select: { memberId: true } } },
  });
  const activeIds = new Set(present.map((a) => a.registration.memberId));
  const members = await prisma.member.findMany({ where: { status: 'ACTIVE', joinDate: { lte: since } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  return members.filter((m) => !activeIds.has(m.id)).map(memberDto);
}
