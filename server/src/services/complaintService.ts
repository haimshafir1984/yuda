import { z } from 'zod';
import { prisma } from '../db';
import { currentActorName } from '../auth/context';
import { AppError, notFound } from '../errors';
import { parseDateOnly, toDateOnly, todayDateOnly } from '../lib/dates';
import { addRemoval, removalDto } from './memberStatusService';

/** דיווחים ותלונות: מתועדים ידנית ע"י העו"סית, עם היסטוריה לכל חבר */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max = 2000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string({ required_error: 'יש לבחור תאריך' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');

export const COMPLAINT_STATUSES = ['NEW', 'IN_PROGRESS', 'HANDLED'] as const;
export const ENTRY_KINDS = ['MEETING', 'CALL', 'MESSAGE', 'NOTE'] as const;
export const ACTIONS = ['NONE', 'REMOVAL_PERMANENT', 'REMOVAL_CONDITIONAL', 'REMOVAL_TEMPORARY', 'OTHER'] as const;

export const complaintCreateSchema = z
  .object({
    receivedAt: z.preprocess(emptyToNull, dateStr.nullable().optional()), // אפשר תאריכים אחורה (הזנת תלונות ישנות)
    complainantType: z.enum(['STAFF', 'MEMBER'], { required_error: 'יש לבחור מי המתלונן' }),
    complainantMemberId: z.number().int().nullish(),
    complainantName: optStr(80),
    subjectMemberId: z.number({ required_error: 'יש לבחור על מי התלונה' }).int(),
    text: z.string({ required_error: 'יש לתאר את התלונה' }).trim().min(1, 'יש לתאר את התלונה').max(5000),
  })
  .superRefine((v, ctx) => {
    if (v.complainantType === 'MEMBER' && !v.complainantMemberId) ctx.addIssue({ code: 'custom', path: ['complainantMemberId'], message: 'יש לבחור את החבר המתלונן' });
    if (v.complainantType === 'STAFF' && !v.complainantName) ctx.addIssue({ code: 'custom', path: ['complainantName'], message: 'יש לבחור את איש הצוות המתלונן' });
  });
export const complaintUpdateSchema = z.object({
  receivedAt: dateStr.optional(),
  text: z.string().trim().min(1, 'יש לתאר את התלונה').max(5000).optional(),
  actionNote: optStr(2000),
});
export const complaintStatusSchema = z.object({ status: z.enum(COMPLAINT_STATUSES) });
export const entrySchema = z.object({
  kind: z.enum(ENTRY_KINDS).default('NOTE'),
  date: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  text: z.string({ required_error: 'יש להזין תיאור' }).trim().min(1, 'יש להזין תיאור').max(3000),
});
export const actionSchema = z.object({
  action: z.enum(ACTIONS),
  note: optStr(2000),
  // פרטי הרחקה, כשהפעולה היא הרחקה
  removal: z
    .object({
      reason: z.string().trim().min(1, 'יש להזין סיבה').max(500).optional(),
      description: optStr(3000),
      endDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
      condition: optStr(500),
    })
    .optional(),
});

type Row = Awaited<ReturnType<typeof loadComplaint>>;

async function loadComplaint(id: number) {
  const c = await prisma.complaint.findUnique({
    where: { id },
    include: { subject: true, complainant: true, entries: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } },
  });
  if (!c) throw notFound('התלונה');
  return c;
}

const name = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;

const dto = (c: Row) => ({
  id: c.id,
  receivedAt: toDateOnly(c.receivedAt)!,
  complainantType: c.complainantType,
  complainantMemberId: c.complainantMemberId,
  complainantName: c.complainant ? name(c.complainant) : c.complainantName,
  subjectMemberId: c.subjectMemberId,
  subjectName: name(c.subject),
  text: c.text,
  status: c.status,
  actionTaken: c.actionTaken,
  actionNote: c.actionNote,
  createdBy: c.createdBy,
  createdAt: c.createdAt.toISOString(),
  entries: c.entries.map((e) => ({ id: e.id, kind: e.kind, date: toDateOnly(e.date)!, text: e.text, author: e.author })),
});

export async function listComplaints(filter: { status?: string; q?: string; memberId?: number }) {
  const rows = await prisma.complaint.findMany({
    where: {
      ...(filter.status && (COMPLAINT_STATUSES as readonly string[]).includes(filter.status) ? { status: filter.status } : {}),
      ...(filter.memberId ? { OR: [{ subjectMemberId: filter.memberId }, { complainantMemberId: filter.memberId }] } : {}),
      ...(filter.q ? { OR: [{ text: { contains: filter.q } }, { subject: { OR: [{ firstName: { contains: filter.q } }, { lastName: { contains: filter.q } }] } }] } : {}),
    },
    include: { subject: true, complainant: true, entries: true },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map((c) => ({ ...dto(c), entryCount: c.entries.length }));
}

/** תלונה + תלונות קודמות על אותו חבר (מוצגות כשהמערכת מזהה תלונה חוזרת) */
export async function getComplaint(id: number) {
  const c = await loadComplaint(id);
  const previous = await prisma.complaint.findMany({
    where: { subjectMemberId: c.subjectMemberId, id: { not: id } },
    include: { subject: true, complainant: true, entries: true },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
  });
  const removals = await prisma.memberRemoval.findMany({ where: { complaintId: id }, orderBy: { id: 'desc' } });
  return { ...dto(c), previous: previous.map((p) => ({ ...dto(p), entries: [] })), removals: removals.map(removalDto), repeat: previous.length > 0 };
}

export async function memberComplaints(memberId: number) {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m) throw notFound('החבר');
  const rows = await listComplaints({ memberId });
  return {
    about: rows.filter((r) => r.subjectMemberId === memberId), // שדיווחו עליו
    by: rows.filter((r) => r.complainantMemberId === memberId), // שהוא דיווח
  };
}

export async function createComplaint(input: z.infer<typeof complaintCreateSchema>) {
  const subject = await prisma.member.findUnique({ where: { id: input.subjectMemberId } });
  if (!subject) throw notFound('החבר שעליו התלונה');
  if (input.complainantType === 'MEMBER') {
    const c = await prisma.member.findUnique({ where: { id: input.complainantMemberId! } });
    if (!c) throw notFound('החבר המתלונן');
    if (c.id === subject.id) throw new AppError(400, 'VALIDATION', 'חבר לא יכול להתלונן על עצמו', { fields: { complainantMemberId: 'חבר לא יכול להתלונן על עצמו' } });
  }
  const created = await prisma.complaint.create({
    data: {
      receivedAt: parseDateOnly(input.receivedAt ?? todayDateOnly()),
      complainantType: input.complainantType,
      complainantMemberId: input.complainantType === 'MEMBER' ? input.complainantMemberId! : null,
      complainantName: input.complainantType === 'STAFF' ? input.complainantName ?? null : null,
      subjectMemberId: input.subjectMemberId,
      text: input.text,
      createdBy: currentActorName(),
    },
  });
  return getComplaint(created.id);
}

export async function updateComplaint(id: number, input: z.infer<typeof complaintUpdateSchema>) {
  await loadComplaint(id);
  await prisma.complaint.update({
    where: { id },
    data: {
      ...(input.receivedAt && { receivedAt: parseDateOnly(input.receivedAt) }),
      ...(input.text && { text: input.text }),
      ...(input.actionNote !== undefined && { actionNote: input.actionNote }),
    },
  });
  return getComplaint(id);
}

/** מעברי סטטוס ידניים בלבד: חדשה, בטיפול, טופל */
export async function setStatus(id: number, status: (typeof COMPLAINT_STATUSES)[number]) {
  const c = await loadComplaint(id);
  if (status === 'NEW' && c.status !== 'NEW') throw new AppError(409, 'INVALID_STATUS', 'לא ניתן להחזיר תלונה לסטטוס "חדשה"');
  await prisma.complaint.update({ where: { id }, data: { status } });
  return getComplaint(id);
}

/** תיעוד הטיפול (פגישה, שיחה, הודעה, הערה): מותר רק כל עוד התלונה אינה "טופלה" */
export async function addEntry(id: number, input: z.infer<typeof entrySchema>) {
  const c = await loadComplaint(id);
  if (c.status === 'HANDLED') throw new AppError(409, 'COMPLAINT_CLOSED', 'התלונה סומנה כמטופלת. כדי להוסיף תיעוד יש להחזיר אותה לסטטוס "בטיפול"');
  await prisma.$transaction(async (tx) => {
    await tx.complaintEntry.create({ data: { complaintId: id, kind: input.kind, date: parseDateOnly(input.date ?? todayDateOnly()), text: input.text, author: currentActorName() } });
    if (c.status === 'NEW') await tx.complaint.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  });
  return getComplaint(id);
}

/** הפעולה שנעשתה בעקבות התלונה. הרחקה יוצרת רשומת הרחקה בכרטיס החבר ומעדכנת את סטטוס החבר */
export async function setAction(id: number, input: z.infer<typeof actionSchema>) {
  const c = await loadComplaint(id);
  const kind = ({ REMOVAL_PERMANENT: 'PERMANENT', REMOVAL_CONDITIONAL: 'CONDITIONAL', REMOVAL_TEMPORARY: 'TEMPORARY' } as const)[input.action as 'REMOVAL_PERMANENT'];
  if (kind) {
    await addRemoval(c.subjectMemberId, {
      kind,
      reason: input.removal?.reason ?? `בעקבות תלונה #${id}`,
      description: input.removal?.description ?? c.text,
      endDate: input.removal?.endDate ?? null,
      condition: input.removal?.condition ?? null,
      complaintId: id,
    });
  }
  await prisma.complaint.update({ where: { id }, data: { actionTaken: input.action, ...(input.note !== undefined && { actionNote: input.note }) } });
  return getComplaint(id);
}
