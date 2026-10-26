import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { parseDateOnly, todayDateOnly, toDateOnly } from '../lib/dates';
import {
  END_REASONS, finishSocialSchema, interventionSchema, meetingSchema, processCreateSchema, processUpdateSchema, swReportSchema,
} from '../socialValidation';

type Tx = Prisma.TransactionClient;

export const END_REASON_LABEL: Record<(typeof END_REASONS)[number], string> = {
  COMPLETED: 'הליווי הושלם',
  GOAL_ACHIEVED: 'מטרת הליווי הושגה',
  DROPOUT: 'נשירה',
  TRANSFERRED: 'הועבר לגורם אחר',
  MEMBER_REQUEST: 'לבקשת החבר',
  OTHER: 'אחר',
};

const KIND_LABEL: Record<string, string> = {
  RIGHTS: 'מיצוי זכויות', SUPPORT: 'תמיכה וליווי', PARENT_MEDIATION: 'גישור מול הורים', FAMILY: 'סיוע בקשר משפחתי',
  EMOTIONAL: 'תמיכה רגשית', BUREAUCRATIC: 'סיוע בירוקרטי', OTHER: 'אחר',
};
const STATUS_LABEL: Record<string, string> = { NOT_STARTED: 'טרם התחיל', ACTIVE: 'פעיל', FROZEN: 'בהקפאה', FINISHED: 'הסתיים' };

const heDate = (d: string) => d.split('-').reverse().join('/');
const ts = (d: Date) => ({ date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) });
const parseMeeting = (date: string, time: string) => new Date(`${date}T${time}:00.000Z`);

const event = (tx: Tx, processId: number, type: string, description: string, from?: string | null, to?: string | null) =>
  tx.socialWorkEvent.create({ data: { processId, type, description, fromStatus: from ?? null, toStatus: to ?? null } });

// ======================= DTO =======================

const processInclude = {
  member: { select: { firstName: true, lastName: true, nationalInsurance: true } },
  _count: { select: { meetings: { where: { status: 'HELD' } } } }, // פגישות שבוטלו אינן נספרות
  events: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { createdAt: true } },
} satisfies Prisma.SocialWorkProcessInclude;
type ProcessFull = Prisma.SocialWorkProcessGetPayload<{ include: typeof processInclude }>;

/** מספר הפגישות בפועל מצדיק סיווג: עד 2 חד-פעמי, 3 ומעלה מתמשך */
const suggestType = (meetings: number) => (meetings >= 3 ? 'ONGOING' : 'ONE_TIME');

export const processDto = (p: ProcessFull) => {
  const meetingCount = p._count.meetings;
  const suggested = meetingCount === 0 ? p.type : suggestType(meetingCount);
  return {
    id: p.id,
    memberId: p.memberId,
    memberName: `${p.member.firstName} ${p.member.lastName}`,
    nationalInsurance: p.member.nationalInsurance, // נגזר מכרטיס החבר
    requestId: p.requestId,
    socialWorker: p.socialWorker,
    kinds: p.kinds.split(',').filter(Boolean),
    type: p.type,
    typeManual: p.typeManual,
    // כשהסוג נקבע ידנית מוצגת הצעה בלבד; כשהוא אוטומטי הוא מתעדכן מעצמו
    suggestedType: p.typeManual && suggested !== p.type ? suggested : null,
    goal: p.goal,
    status: p.status,
    startDate: toDateOnly(p.startDate)!,
    endDate: toDateOnly(p.endDate),
    endReason: p.endReason,
    endSummary: p.endSummary,
    meetingCount,
    lastActivity: (p.events[0]?.createdAt ?? p.updatedAt).toISOString(),
  };
};

async function loadProcess(id: number, db: Tx | typeof prisma = prisma) {
  const p = await db.socialWorkProcess.findUnique({ where: { id }, include: processInclude });
  if (!p) throw notFound('תהליך הליווי');
  return p;
}
export const getProcess = async (id: number) => processDto(await loadProcess(id));

export interface ProcessListQuery { q?: string; status?: string; kind?: string; worker?: string; sort?: string; order?: string; memberId?: number; requestId?: number }

export async function listProcesses(query: ProcessListQuery) {
  const rows = await prisma.socialWorkProcess.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.worker ? { socialWorker: query.worker } : {}),
      ...(query.kind ? { kinds: { contains: query.kind } } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.requestId ? { requestId: query.requestId } : {}),
    },
    include: processInclude,
  });
  let list = rows.map(processDto);
  const q = query.q?.trim();
  if (q) list = list.filter((p) => p.memberName.includes(q) || (p.goal ?? '').includes(q) || String(p.id) === q.replace('#', ''));
  const dir = query.order === 'asc' ? 1 : -1;
  const sort = query.sort ?? 'startDate';
  list.sort((a, b) => {
    switch (sort) {
      case 'id': return (a.id - b.id) * dir;
      case 'member': return a.memberName.localeCompare(b.memberName, 'he') * dir;
      case 'worker': return (a.socialWorker ?? '').localeCompare(b.socialWorker ?? '', 'he') * dir;
      case 'meetings': return (a.meetingCount - b.meetingCount) * dir;
      case 'status': return a.status.localeCompare(b.status) * dir;
      case 'lastActivity': return a.lastActivity.localeCompare(b.lastActivity) * dir;
      default: return (a.startDate.localeCompare(b.startDate) || a.id - b.id) * dir;
    }
  });
  return list;
}

// ======================= יצירה ועדכון =======================

export async function createProcess(input: z.infer<typeof processCreateSchema>) {
  const id = await prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'החבר לא נמצא');
    let requestId: number | null = null;
    if (input.requestId) {
      const req = await tx.serviceRequest.findUnique({ where: { id: input.requestId } });
      if (!req) throw new AppError(404, 'REQUEST_NOT_FOUND', 'הפנייה לא נמצאה');
      if (req.memberId !== member.id) throw new AppError(422, 'CROSS_MEMBER', 'הפנייה שייכת לחבר אחר');
      const existing = await tx.socialWorkProcess.findFirst({ where: { requestId: req.id }, orderBy: { id: 'desc' } });
      if (existing && !input.allowAnother)
        throw new AppError(409, 'REQUEST_ALREADY_LINKED', `מהפנייה הזו כבר נפתח תהליך ליווי #${existing.id}`, { processId: existing.id });
      requestId = req.id;
    } else {
      // הגנה מפני לחיצה כפולה: אותו חבר, אותה מהות ואותה מטרה בתוך 10 שניות
      const recent = await tx.socialWorkProcess.findFirst({
        where: { memberId: member.id, kinds: input.kinds.join(','), goal: input.goal ?? null, createdAt: { gte: new Date(Date.now() - 10_000) } },
      });
      if (recent) return recent.id;
    }
    const p = await tx.socialWorkProcess.create({
      data: {
        memberId: member.id, requestId, socialWorker: input.socialWorker ?? null, kinds: input.kinds.join(','),
        type: input.type === 'AUTO' ? 'ONE_TIME' : input.type,
        typeManual: input.type !== 'AUTO',
        goal: input.goal ?? null, startDate: parseDateOnly(input.startDate ?? todayDateOnly()),
      },
    });
    await event(tx, p.id, 'OPENED', requestId ? `נפתח תהליך ליווי מפנייה #${requestId}` : 'נפתח תהליך ליווי', null, 'NOT_STARTED');
    if (requestId) {
      await tx.serviceRequestEvent.create({ data: { requestId, type: 'PROCESS_OPENED', description: `נפתח תהליך ליווי עו"ס #${p.id}` } });
      await tx.serviceRequest.update({ where: { id: requestId }, data: { updatedAt: new Date() } });
    }
    return p.id;
  });
  return getProcess(id);
}

export async function updateProcess(id: number, input: z.infer<typeof processUpdateSchema>) {
  await prisma.$transaction(async (tx) => {
    const p = await loadProcess(id, tx);
    const changes: string[] = [];
    const data: Prisma.SocialWorkProcessUpdateInput = {};
    if (input.socialWorker !== undefined && input.socialWorker !== p.socialWorker) { data.socialWorker = input.socialWorker; changes.push('עו"סית אחראית'); }
    if (input.goal !== undefined && input.goal !== p.goal) { data.goal = input.goal; changes.push('מטרת הליווי'); }
    if (input.startDate !== undefined && input.startDate !== toDateOnly(p.startDate)) { data.startDate = parseDateOnly(input.startDate); changes.push('תאריך התחלה'); }
    if (input.type === 'AUTO') {
      if (p.typeManual) {
        data.typeManual = false;
        await event(tx, id, 'TYPE_CHANGED', 'סוג התהליך הוחזר להגדרה אוטומטית לפי מספר הפגישות');
      }
    } else if (input.type !== undefined && (input.type !== p.type || !p.typeManual)) {
      data.type = input.type;
      data.typeManual = true;
      await event(tx, id, 'TYPE_CHANGED', `סוג התהליך הוגדר ידנית כ${input.type === 'ONE_TIME' ? 'חד-פעמי' : 'מתמשך'}`);
    }
    if (input.kinds !== undefined && input.kinds.join(',') !== p.kinds) {
      data.kinds = input.kinds.join(',');
      await event(tx, id, 'KINDS_CHANGED', `מהות הליווי שונתה ל: ${input.kinds.map((k) => KIND_LABEL[k]).join(', ')}`);
    }
    if (changes.length) await event(tx, id, 'EDITED', `עודכנו: ${changes.join(', ')}`);
    await tx.socialWorkProcess.update({ where: { id }, data });
    await applyAutoType(tx, id);
  });
  return getProcess(id);
}

/** סוג תהליך אוטומטי: עד 2 פגישות שהתקיימו חד-פעמי, 3 ומעלה מתמשך (מסמך הדרישות, שורה 939) */
async function applyAutoType(tx: Tx, processId: number) {
  const p = await tx.socialWorkProcess.findUnique({ where: { id: processId } });
  if (!p || p.typeManual) return;
  const held = await tx.socialWorkMeeting.count({ where: { processId, status: 'HELD' } });
  const next = held >= 3 ? 'ONGOING' : 'ONE_TIME';
  if (next !== p.type) {
    await tx.socialWorkProcess.update({ where: { id: processId }, data: { type: next } });
    await event(tx, processId, 'TYPE_CHANGED', `סוג התהליך עודכן אוטומטית ל${next === 'ONGOING' ? 'מתמשך' : 'חד-פעמי'} (${held} פגישות)`);
  }
}

// ======================= סטטוסים =======================

async function transition(id: number, from: string[], to: 'ACTIVE' | 'FROZEN' | 'FINISHED', type: string, description: string, extra: Prisma.SocialWorkProcessUpdateInput = {}) {
  await prisma.$transaction(async (tx) => {
    const p = await loadProcess(id, tx);
    if (!from.includes(p.status)) throw new AppError(409, 'INVALID_STATUS', `הפעולה אינה זמינה בסטטוס "${STATUS_LABEL[p.status]}"`);
    // עדכון מותנה בסטטוס, כדי שלחיצה כפולה לא תיצור אירוע כפול
    const res = await tx.socialWorkProcess.updateMany({ where: { id, status: p.status }, data: { status: to, ...(extra as Prisma.SocialWorkProcessUpdateManyMutationInput) } });
    if (res.count === 0) throw new AppError(409, 'INVALID_STATUS', 'הסטטוס כבר השתנה');
    await event(tx, id, type, description, p.status, to);
  });
  return getProcess(id);
}

export const activateProcess = (id: number) => transition(id, ['NOT_STARTED'], 'ACTIVE', 'ACTIVATED', 'התהליך הופעל');
export const freezeProcess = (id: number, note?: string | null) => transition(id, ['ACTIVE'], 'FROZEN', 'FROZEN', note ? `התהליך הוקפא: ${note}` : 'התהליך הוקפא');
export const unfreezeProcess = (id: number) => transition(id, ['FROZEN'], 'ACTIVE', 'UNFROZEN', 'התהליך הוצא מהקפאה');
export const finishProcess = (id: number, input: z.infer<typeof finishSocialSchema>) =>
  transition(id, ['NOT_STARTED', 'ACTIVE', 'FROZEN'], 'FINISHED', 'FINISHED', `התהליך הסתיים: ${END_REASON_LABEL[input.reason]}`, {
    endDate: parseDateOnly(input.endDate ?? todayDateOnly()), endReason: input.reason, endSummary: input.summary,
  });
/** פתיחה מחדש משאירה את כל ההיסטוריה (פגישות, אירועים, סיכום סיום קודם נשמר באירוע) */
export const reopenProcess = (id: number, note?: string | null) =>
  transition(id, ['FINISHED'], 'ACTIVE', 'REOPENED', note ? `התהליך נפתח מחדש: ${note}` : 'התהליך נפתח מחדש', { endDate: null, endReason: null, endSummary: null });

// ======================= פגישות =======================

type MeetingRow = Prisma.SocialWorkMeetingGetPayload<object>;
const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const meetingDto = (m: MeetingRow, number: number | null) => ({
  id: m.id, processId: m.processId, ...ts(m.meetingAt), number, subject: m.subject, mode: m.mode, durationMinutes: m.durationMinutes,
  summary: m.summary, followUpNotes: m.followUpNotes, followUpRequired: m.followUpRequired,
  status: m.status, cancelReason: m.cancelReason, topics: csv(m.topics), meetingActions: csv(m.meetingActions), externalPartner: m.externalPartner,
});

export async function listMeetings(processId: number) {
  await loadProcess(processId);
  const rows = await prisma.socialWorkMeeting.findMany({ where: { processId }, orderBy: [{ meetingAt: 'asc' }, { id: 'asc' }] });
  // מספר סידורי רק לפגישות שהתקיימו, לפי סדר הזמן
  let n = 0;
  const numbered = rows.map((m) => meetingDto(m, m.status === 'HELD' ? ++n : null));
  return numbered.reverse();
}

const meetingData = (input: z.infer<typeof meetingSchema>, subject: string) => ({
  meetingAt: parseMeeting(input.date, input.time), subject, mode: input.mode, durationMinutes: input.durationMinutes ?? 60,
  summary: input.summary ?? null, followUpNotes: input.followUpNotes ?? null, followUpRequired: input.followUpRequired,
  status: input.status, cancelReason: input.status === 'CANCELLED' ? input.cancelReason ?? null : null,
  topics: input.topics.join(',') || null, meetingActions: input.meetingActions.join(',') || null,
  externalPartner: input.meetingActions.includes('EXTERNAL_PARTNER') ? input.externalPartner ?? null : null,
});
const defaultSubject = (kinds: string) => KIND_LABEL[kinds.split(',')[0]] ?? 'פגישה';

export async function addMeeting(processId: number, input: z.infer<typeof meetingSchema>) {
  await prisma.$transaction(async (tx) => {
    const p = await loadProcess(processId, tx);
    if (p.status === 'FINISHED') throw new AppError(409, 'FINISHED', 'התהליך הסתיים. יש לפתוח אותו מחדש לפני הוספת פגישה');
    const subject = input.subject?.trim() || defaultSubject(p.kinds);
    const data = meetingData(input, subject);
    const dup = await tx.socialWorkMeeting.findFirst({ where: { processId, meetingAt: data.meetingAt, subject, createdAt: { gte: new Date(Date.now() - 10_000) } } });
    if (dup) return; // לחיצה כפולה
    await tx.socialWorkMeeting.create({ data: { processId, ...data } });
    await event(tx, processId, 'MEETING_ADDED', input.status === 'CANCELLED' ? `נרשמה פגישה שבוטלה: ${subject} (${heDate(input.date)}), סיבה: ${input.cancelReason}` : `נוספה פגישה: ${subject} (${heDate(input.date)})`);
    await applyAutoType(tx, processId);
  });
  return listMeetings(processId);
}

export async function updateMeeting(meetingId: number, input: z.infer<typeof meetingSchema>) {
  const m = await prisma.socialWorkMeeting.findUnique({ where: { id: meetingId }, include: { process: true } });
  if (!m) throw notFound('הפגישה');
  await prisma.$transaction(async (tx) => {
    const subject = input.subject?.trim() || defaultSubject(m.process.kinds);
    const data = meetingData(input, subject);
    const changed: string[] = [];
    if (data.meetingAt.getTime() !== m.meetingAt.getTime()) changed.push('מועד');
    if (subject !== m.subject) changed.push('נושא');
    if (input.mode !== m.mode) changed.push('אופן');
    if (data.durationMinutes !== m.durationMinutes) changed.push('משך');
    if (data.summary !== m.summary) changed.push('סיכום');
    if (data.followUpNotes !== m.followUpNotes || input.followUpRequired !== m.followUpRequired) changed.push('המשך טיפול');
    if (data.status !== m.status) changed.push(data.status === 'CANCELLED' ? 'סומנה כבוטלה' : 'סומנה כהתקיימה');
    if (data.topics !== m.topics || data.meetingActions !== m.meetingActions || data.externalPartner !== m.externalPartner) changed.push('נושאים והתערבויות');
    await tx.socialWorkMeeting.update({ where: { id: meetingId }, data });
    if (changed.length) await event(tx, m.processId, 'MEETING_EDITED', `פגישה "${m.subject}" עודכנה: ${changed.join(', ')}`);
    await applyAutoType(tx, m.processId);
  });
  return listMeetings(m.processId);
}

// ======================= התערבויות =======================

async function assertTreatmentOfMember(tx: Tx, treatmentId: number, memberId: number) {
  const t = await tx.psychologicalTreatment.findUnique({ where: { id: treatmentId } });
  if (!t) throw new AppError(404, 'TREATMENT_NOT_FOUND', 'תהליך השפ"ח לא נמצא');
  if (t.memberId !== memberId) throw new AppError(422, 'CROSS_MEMBER', 'לא ניתן לקשר לתהליך שפ"ח של חבר אחר');
  return t;
}

type InterventionRow = Prisma.SocialWorkInterventionGetPayload<object>;
const interventionDto = (i: InterventionRow) => ({
  id: i.id, processId: i.processId, date: toDateOnly(i.date)!, type: i.type, description: i.description, involved: i.involved, status: i.status, treatmentId: i.treatmentId, meetingId: i.meetingId,
});

async function assertMeetingOfProcess(tx: Tx, meetingId: number, processId: number) {
  const m = await tx.socialWorkMeeting.findFirst({ where: { id: meetingId, processId } });
  if (!m) throw new AppError(422, 'MEETING_MISMATCH', 'ניתן לקשר פעולה רק לפגישה באותו תהליך');
}

export async function listInterventions(processId: number) {
  await loadProcess(processId);
  const rows = await prisma.socialWorkIntervention.findMany({ where: { processId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return rows.map(interventionDto);
}

export async function addIntervention(processId: number, input: z.infer<typeof interventionSchema>) {
  await prisma.$transaction(async (tx) => {
    const p = await loadProcess(processId, tx);
    if (input.treatmentId) await assertTreatmentOfMember(tx, input.treatmentId, p.memberId);
    if (input.meetingId) await assertMeetingOfProcess(tx, input.meetingId, processId);
    const dup = await tx.socialWorkIntervention.findFirst({ where: { processId, description: input.description, type: input.type, createdAt: { gte: new Date(Date.now() - 10_000) } } });
    if (dup) return;
    await tx.socialWorkIntervention.create({
      data: { processId, date: parseDateOnly(input.date), type: input.type, description: input.description, involved: input.involved ?? null, status: input.status, treatmentId: input.treatmentId ?? null, meetingId: input.meetingId ?? null },
    });
    await event(tx, processId, 'INTERVENTION_ADDED', `נוספה פעולה: ${input.description.slice(0, 60)}`);
  });
  return listInterventions(processId);
}

export async function updateIntervention(id: number, input: z.infer<typeof interventionSchema>) {
  const i = await prisma.socialWorkIntervention.findUnique({ where: { id }, include: { process: true } });
  if (!i) throw notFound('הפעולה');
  await prisma.$transaction(async (tx) => {
    if (input.treatmentId) await assertTreatmentOfMember(tx, input.treatmentId, i.process.memberId);
    if (input.meetingId) await assertMeetingOfProcess(tx, input.meetingId, i.processId);
    await tx.socialWorkIntervention.update({
      where: { id },
      data: { date: parseDateOnly(input.date), type: input.type, description: input.description, involved: input.involved ?? null, status: input.status, treatmentId: input.treatmentId ?? null, meetingId: input.meetingId ?? null },
    });
    if (input.status !== i.status) await event(tx, i.processId, 'INTERVENTION_ADDED', `סטטוס פעולה עודכן: ${input.description.slice(0, 40)}`);
  });
  return listInterventions(i.processId);
}

// ======================= דוחות =======================

type ReportRow = Prisma.SocialWorkReportGetPayload<object>;
const swReportDto = (r: ReportRow) => ({ id: r.id, processId: r.processId, type: r.type, date: toDateOnly(r.date)!, title: r.title, content: r.content });

export async function listReports(processId: number) {
  await loadProcess(processId);
  const rows = await prisma.socialWorkReport.findMany({ where: { processId }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return rows.map(swReportDto);
}
export async function addReport(processId: number, input: z.infer<typeof swReportSchema>) {
  await prisma.$transaction(async (tx) => {
    await loadProcess(processId, tx);
    await tx.socialWorkReport.create({ data: { processId, type: input.type, date: parseDateOnly(input.date), title: input.title, content: input.content } });
    await event(tx, processId, 'REPORT_ADDED', `נוסף דוח: ${input.title}`);
  });
  return listReports(processId);
}
export async function updateReport(id: number, input: z.infer<typeof swReportSchema>) {
  const r = await prisma.socialWorkReport.findUnique({ where: { id } });
  if (!r) throw notFound('הדוח');
  await prisma.socialWorkReport.update({ where: { id }, data: { type: input.type, date: parseDateOnly(input.date), title: input.title, content: input.content } });
  return listReports(r.processId);
}

// ======================= היסטוריה וקשרים =======================

export async function listEvents(processId: number) {
  await loadProcess(processId);
  const rows = await prisma.socialWorkEvent.findMany({ where: { processId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return rows.map((e) => ({ id: e.id, type: e.type, description: e.description, fromStatus: e.fromStatus, toStatus: e.toStatus, createdAt: e.createdAt.toISOString() }));
}

/** קישור לשפ"ח: רק של אותו חבר. השפ"ח עצמו אינו משתנה */
export async function linkTreatment(processId: number, treatmentId: number) {
  await prisma.$transaction(async (tx) => {
    const p = await loadProcess(processId, tx);
    await assertTreatmentOfMember(tx, treatmentId, p.memberId);
    const exists = await tx.socialWorkProcessTreatment.findUnique({ where: { processId_treatmentId: { processId, treatmentId } } });
    if (exists) throw new AppError(409, 'ALREADY_LINKED', 'התהליך כבר מקושר לשפ"ח זה');
    await tx.socialWorkProcessTreatment.create({ data: { processId, treatmentId } });
    await event(tx, processId, 'TREATMENT_LINKED', `קושר לתהליך שפ"ח #${treatmentId}`);
  });
  return getRelated(processId);
}

export async function unlinkTreatment(processId: number, treatmentId: number) {
  await prisma.$transaction(async (tx) => {
    await loadProcess(processId, tx);
    const res = await tx.socialWorkProcessTreatment.deleteMany({ where: { processId, treatmentId } });
    if (res.count === 0) throw notFound('הקישור');
    await event(tx, processId, 'TREATMENT_UNLINKED', `הוסר הקישור לתהליך שפ"ח #${treatmentId}`);
  });
  return getRelated(processId);
}

export async function getRelated(processId: number) {
  const p = await prisma.socialWorkProcess.findUnique({
    where: { id: processId },
    include: {
      request: { include: { member: { select: { firstName: true, lastName: true } } } },
      treatments: { include: { treatment: { include: { currentTherapist: true } } } },
    },
  });
  if (!p) throw notFound('תהליך הליווי');
  const others = await prisma.socialWorkProcess.findMany({ where: { memberId: p.memberId, id: { not: processId } }, include: processInclude, orderBy: { startDate: 'desc' } });
  return {
    request: p.request ? { id: p.request.id, subject: p.request.subject, type: p.request.type, status: p.request.status, openedAt: toDateOnly(p.request.openedAt)! } : null,
    treatments: p.treatments.map((l) => ({
      id: l.treatment.id, status: l.treatment.status, track: l.treatment.track, therapist: l.treatment.currentTherapist?.fullName ?? null, startDate: toDateOnly(l.treatment.startDate)!,
    })),
    otherProcesses: others.map(processDto),
  };
}

// ======================= שילוב בכרטיס חבר ושפ"ח =======================

export const memberProcesses = async (memberId: number) => {
  if (!(await prisma.member.findUnique({ where: { id: memberId } }))) throw notFound('החבר');
  return listProcesses({ memberId, sort: 'startDate', order: 'desc' });
};

/** קשרים נכנסים לכרטיס שפ"ח: ליווי עו"ס ופניות שמקושרים אליו */
export async function treatmentLinks(treatmentId: number) {
  const t = await prisma.psychologicalTreatment.findUnique({ where: { id: treatmentId } });
  if (!t) throw notFound('תהליך השפ"ח');
  const [procs, reqs] = await Promise.all([
    prisma.socialWorkProcessTreatment.findMany({ where: { treatmentId }, include: { process: { include: processInclude } } }),
    prisma.serviceRequestTreatment.findMany({ where: { treatmentId }, include: { request: true } }),
  ]);
  return {
    socialProcesses: procs.map((l) => processDto(l.process)),
    requests: reqs.map((l) => ({ id: l.request.id, subject: l.request.subject, status: l.request.status, openedAt: toDateOnly(l.request.openedAt)! })),
  };
}
