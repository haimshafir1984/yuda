import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { parseDateOnly, todayDateOnly, toDateOnly } from '../lib/dates';
import {
  assignSchema, contactSchema, decisionSchema, openFromRequestSchema, requestCreateSchema, requestNoteSchema, requestStatusSchema, requestUpdateSchema,
} from '../socialValidation';
import { createProcess, listProcesses } from './socialWorkService';
import { getTreatment } from './treatmentService';

type Tx = Prisma.TransactionClient;

const STATUS_LABEL: Record<string, string> = {
  NEW: 'חדשה', REVIEW: 'בבדיקה', WAITING_INFO: 'ממתינה למידע', IN_PROGRESS: 'בטיפול', HANDLED: 'טופלה', REJECTED: 'נדחתה', CLOSED: 'נסגרה',
};
const DECISION_LABEL: Record<string, string> = {
  SOCIAL_WORK_NEEDED: 'נדרש ליווי עו"ס', PSYCH_REFERRAL: 'הפניה לטיפול פסיכולוגי חיצוני', EXTERNAL_REFERRAL: 'הפניה לגורם חיצוני',
  ANSWERED: 'ניתן מענה ללא תהליך נוסף', REJECTED: 'הפנייה נדחתה', MORE_INFO: 'נדרש מידע נוסף',
};
const MODE_LABEL: Record<string, string> = { FACE: 'פגישה פרונטלית', PHONE: 'שיחת טלפון', ONLINE: 'מפגש מקוון', OTHER: 'אחר' };

const touch = (tx: Tx, requestId: number, data: Prisma.ServiceRequestUpdateInput = {}) =>
  tx.serviceRequest.update({ where: { id: requestId }, data: { ...data, updatedAt: new Date() } });

const addEvent = (tx: Tx, requestId: number, type: string, description: string, o: { actor?: string | null; from?: string | null; to?: string | null } = {}) =>
  tx.serviceRequestEvent.create({ data: { requestId, type, description, actor: o.actor ?? null, fromStatus: o.from ?? null, toStatus: o.to ?? null } });

const include = { member: { select: { firstName: true, lastName: true } } } satisfies Prisma.ServiceRequestInclude;
type RequestFull = Prisma.ServiceRequestGetPayload<{ include: typeof include }>;

export const requestDto = (r: RequestFull) => ({
  id: r.id, memberId: r.memberId, memberName: `${r.member.firstName} ${r.member.lastName}`, type: r.type, subject: r.subject, description: r.description,
  openedAt: toDateOnly(r.openedAt)!, source: r.source, assignee: r.assignee, priority: r.priority, status: r.status, internalNote: r.internalNote,
  decision: r.decision, closeReason: r.closeReason, updatedAt: r.updatedAt.toISOString(),
});

async function load(id: number, db: Tx | typeof prisma = prisma) {
  const r = await db.serviceRequest.findUnique({ where: { id }, include });
  if (!r) throw notFound('הפנייה');
  return r;
}
export const getRequest = async (id: number) => requestDto(await load(id));

export interface RequestListQuery { q?: string; status?: string; type?: string; assignee?: string; from?: string; to?: string; sort?: string; order?: string; memberId?: number }

export async function listRequests(query: RequestListQuery) {
  const rows = await prisma.serviceRequest.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.assignee ? { assignee: query.assignee } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.from || query.to ? { openedAt: { ...(query.from ? { gte: parseDateOnly(query.from) } : {}), ...(query.to ? { lte: parseDateOnly(query.to) } : {}) } } : {}),
    },
    include,
  });
  let list = rows.map(requestDto);
  const q = query.q?.trim();
  if (q) list = list.filter((r) => r.memberName.includes(q) || r.subject.includes(q) || String(r.id) === q.replace('#', ''));
  const dir = query.order === 'asc' ? 1 : -1;
  const sort = query.sort ?? 'openedAt';
  const prio = { URGENT: 3, HIGH: 2, NORMAL: 1 } as Record<string, number>;
  list.sort((a, b) => {
    switch (sort) {
      case 'id': return (a.id - b.id) * dir;
      case 'member': return a.memberName.localeCompare(b.memberName, 'he') * dir;
      case 'type': return a.type.localeCompare(b.type) * dir;
      case 'subject': return a.subject.localeCompare(b.subject, 'he') * dir;
      case 'assignee': return (a.assignee ?? '').localeCompare(b.assignee ?? '', 'he') * dir;
      case 'priority': return (prio[a.priority] - prio[b.priority]) * dir;
      case 'status': return a.status.localeCompare(b.status) * dir;
      case 'updatedAt': return a.updatedAt.localeCompare(b.updatedAt) * dir;
      default: return (a.openedAt.localeCompare(b.openedAt) || a.id - b.id) * dir;
    }
  });
  return list;
}

export async function createRequest(input: z.infer<typeof requestCreateSchema>) {
  const id = await prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'החבר לא נמצא');
    // הגנה מפני לחיצה כפולה: אותה פנייה בדיוק בתוך 10 שניות
    const recent = await tx.serviceRequest.findFirst({
      where: { memberId: member.id, type: input.type, subject: input.subject, createdAt: { gte: new Date(Date.now() - 10_000) } },
    });
    if (recent) return recent.id;
    const r = await tx.serviceRequest.create({
      data: {
        memberId: member.id, type: input.type, subject: input.subject, description: input.description ?? null, openedAt: parseDateOnly(input.openedAt ?? todayDateOnly()),
        source: input.source, assignee: input.assignee ?? null, priority: input.priority, internalNote: input.internalNote ?? null,
      },
    });
    await addEvent(tx, r.id, 'CREATED', 'הפנייה נפתחה', { to: 'NEW' });
    if (input.assignee) await addEvent(tx, r.id, 'ASSIGNED', `שויכה ל${input.assignee}`);
    return r.id;
  });
  return getRequest(id);
}

export async function updateRequest(id: number, input: z.infer<typeof requestUpdateSchema>) {
  await prisma.$transaction(async (tx) => {
    const r = await load(id, tx);
    const changes: string[] = [];
    const data: Prisma.ServiceRequestUpdateInput = {};
    if (input.type !== undefined && input.type !== r.type) { data.type = input.type; changes.push('סוג'); }
    if (input.subject !== undefined && input.subject !== r.subject) { data.subject = input.subject; changes.push('נושא'); }
    if (input.description !== undefined && input.description !== r.description) { data.description = input.description; changes.push('תיאור'); }
    if (input.openedAt !== undefined && input.openedAt !== toDateOnly(r.openedAt)) { data.openedAt = parseDateOnly(input.openedAt); changes.push('תאריך פתיחה'); }
    if (input.source !== undefined && input.source !== r.source) { data.source = input.source; changes.push('מקור'); }
    if (input.priority !== undefined && input.priority !== r.priority) { data.priority = input.priority; changes.push('עדיפות'); }
    if (input.internalNote !== undefined && input.internalNote !== r.internalNote) { data.internalNote = input.internalNote; changes.push('הערה פנימית'); }
    if (changes.length) {
      await addEvent(tx, id, 'EDITED', `פרטי הפנייה עודכנו: ${changes.join(', ')}`);
      await touch(tx, id, data);
    }
  });
  return getRequest(id);
}

export async function assignRequest(id: number, input: z.infer<typeof assignSchema>) {
  await prisma.$transaction(async (tx) => {
    const r = await load(id, tx);
    if (r.assignee === input.assignee) throw new AppError(409, 'NO_CHANGE', 'הפנייה כבר משויכת לגורם זה');
    await addEvent(tx, id, 'ASSIGNED', r.assignee ? `שיוך שונה מ${r.assignee} ל${input.assignee}` : `שויכה ל${input.assignee}`, { actor: input.assignee });
    await touch(tx, id, { assignee: input.assignee });
  });
  return getRequest(id);
}

export async function changeRequestStatus(id: number, input: z.infer<typeof requestStatusSchema>) {
  await prisma.$transaction(async (tx) => {
    const r = await load(id, tx);
    if (r.status === input.status) throw new AppError(409, 'NO_CHANGE', 'הפנייה כבר בסטטוס זה');
    if (input.status === 'CLOSED' && !input.reason) throw new AppError(422, 'REASON_REQUIRED', 'בסגירת פנייה יש להזין סיבת סגירה או סיכום טיפול');
    await addEvent(tx, id, 'STATUS_CHANGE', `הסטטוס שונה ל"${STATUS_LABEL[input.status]}"${input.reason ? `: ${input.reason}` : ''}`, { from: r.status, to: input.status });
    await touch(tx, id, { status: input.status, ...(input.status === 'CLOSED' ? { closeReason: input.reason } : r.status === 'CLOSED' ? { closeReason: null } : {}) });
  });
  return getRequest(id);
}

export async function addRequestNote(id: number, input: z.infer<typeof requestNoteSchema>) {
  await prisma.$transaction(async (tx) => {
    await load(id, tx);
    await addEvent(tx, id, 'NOTE', input.text);
    await touch(tx, id);
  });
  return getRequest(id);
}

export async function addContact(id: number, input: z.infer<typeof contactSchema>) {
  await prisma.$transaction(async (tx) => {
    await load(id, tx);
    const when = input.date ? ` (${input.date})` : '';
    await addEvent(tx, id, 'CONTACT', `${MODE_LABEL[input.mode]}${when}: ${input.text}`);
    await touch(tx, id);
  });
  return getRequest(id);
}

/** החלטה אינה סוגרת את הפנייה */
export async function setDecision(id: number, input: z.infer<typeof decisionSchema>) {
  await prisma.$transaction(async (tx) => {
    await load(id, tx);
    await addEvent(tx, id, 'DECISION', `החלטה: ${DECISION_LABEL[input.decision]}${input.note ? `. ${input.note}` : ''}`);
    await touch(tx, id, { decision: input.decision });
  });
  return getRequest(id);
}

/** פתיחת ליווי עו"ס מתוך הפנייה: החבר והפנייה משויכים אוטומטית */
export async function openSocialWork(id: number, input: z.infer<typeof openFromRequestSchema> & { allowAnother?: boolean }) {
  const r = await load(id);
  return createProcess({ ...input, memberId: r.memberId, requestId: id });
}

/** קישור לתהליך שפ"ח קיים של אותו חבר. השפ"ח עצמו אינו משתנה ואינו נוצר כאן */
export async function linkTreatment(id: number, treatmentId: number) {
  await prisma.$transaction(async (tx) => {
    const r = await load(id, tx);
    const t = await tx.psychologicalTreatment.findUnique({ where: { id: treatmentId } });
    if (!t) throw new AppError(404, 'TREATMENT_NOT_FOUND', 'תהליך השפ"ח לא נמצא');
    if (t.memberId !== r.memberId) throw new AppError(422, 'CROSS_MEMBER', 'לא ניתן לקשר לתהליך שפ"ח של חבר אחר');
    const exists = await tx.serviceRequestTreatment.findUnique({ where: { requestId_treatmentId: { requestId: id, treatmentId } } });
    if (exists) throw new AppError(409, 'ALREADY_LINKED', 'הפנייה כבר מקושרת לתהליך שפ"ח זה');
    await tx.serviceRequestTreatment.create({ data: { requestId: id, treatmentId } });
    await addEvent(tx, id, 'TREATMENT_LINKED', `קושרה לתהליך שפ"ח #${treatmentId}`);
    await touch(tx, id);
  });
  return getRelated(id);
}

export async function listRequestEvents(id: number) {
  await load(id);
  const rows = await prisma.serviceRequestEvent.findMany({ where: { requestId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return rows.map((e) => ({ id: e.id, type: e.type, description: e.description, actor: e.actor, fromStatus: e.fromStatus, toStatus: e.toStatus, createdAt: e.createdAt.toISOString() }));
}

export async function getRelated(id: number) {
  await load(id);
  const [socialProcesses, links] = await Promise.all([
    listProcesses({ requestId: id, sort: 'startDate', order: 'desc' }),
    prisma.serviceRequestTreatment.findMany({ where: { requestId: id }, orderBy: { id: 'asc' } }),
  ]);
  const treatments = await Promise.all(links.map((l) => getTreatment(l.treatmentId)));
  return { socialProcesses, treatments };
}

export const memberRequests = async (memberId: number) => {
  if (!(await prisma.member.findUnique({ where: { id: memberId } }))) throw notFound('החבר');
  return listRequests({ memberId, sort: 'openedAt', order: 'desc' });
};
