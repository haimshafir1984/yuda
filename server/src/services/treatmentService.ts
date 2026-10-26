import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { parseDateOnly, todayDateOnly, toDateOnly } from '../lib/dates';
import {
  FINISH_REASONS, FREEZE_REASONS, MEETING_SUBJECTS, PAUSE_REASONS,
  assignSchema, changeTherapistSchema, exceptionSchema, extensionSchema, finishSchema, freezeSchema, noteSchema,
  pauseSchema, paymentSchema, reportSchema, socialReportSchema, taskSchema, therapistSchema, treatmentCreateSchema, treatmentMeetingSchema, treatmentUpdateSchema,
} from '../treatmentValidation';

type Tx = Prisma.TransactionClient;

export const STATUSES = ['PENDING_THERAPIST', 'PENDING_CONTRACT', 'ACTIVE', 'ACTIVE_EXTENSION', 'PENDING_EXTENSION_SIGNATURE', 'PAUSED', 'FROZEN', 'FINISHED'] as const;
export type TreatmentStatus = (typeof STATUSES)[number];
const ACTIVE_STATUSES: string[] = ['ACTIVE', 'ACTIVE_EXTENSION'];
const PENDING_STATUSES: string[] = ['PENDING_THERAPIST', 'PENDING_CONTRACT'];

export const SOCIAL_WORKERS = ['אורית לביא', 'רונית כץ', 'שירה אדלר'];

const money = (n: number) => Math.round(n * 100) / 100;
const eventDate = (d?: string | null) => (d ? parseDateOnly(d) : new Date());

// ======================= מטפלים =======================

const therapistDto = (t: { id: number; fullName: string; phone: string | null; email: string | null; type: string; pricePerSession: number; active: boolean }) => ({
  id: t.id, fullName: t.fullName, phone: t.phone, email: t.email, type: t.type, pricePerSession: t.pricePerSession, active: t.active,
});

export async function listTherapists(activeOnly = false) {
  const rows = await prisma.therapist.findMany({ where: activeOnly ? { active: true } : {}, orderBy: [{ active: 'desc' }, { fullName: 'asc' }] });
  return rows.map(therapistDto);
}

export async function createTherapist(input: z.infer<typeof therapistSchema>) {
  const t = await prisma.therapist.create({
    data: { fullName: input.fullName, phone: input.phone ?? null, email: input.email ?? null, type: input.type, pricePerSession: input.pricePerSession, active: input.active ?? true },
  });
  return therapistDto(t);
}

/** שינוי תעריף מטפל משפיע רק על שיוכים ודיווחים עתידיים; דיווחים קיימים שומרים תעריף משלהם */
export async function updateTherapist(id: number, input: z.infer<typeof therapistSchema>) {
  const existing = await prisma.therapist.findUnique({ where: { id } });
  if (!existing) throw notFound('המטפל');
  const t = await prisma.therapist.update({
    where: { id },
    data: { fullName: input.fullName, phone: input.phone ?? null, email: input.email ?? null, type: input.type, pricePerSession: input.pricePerSession, active: input.active ?? existing.active },
  });
  return therapistDto(t);
}

// ======================= חישובים ו-DTO =======================

const treatmentInclude = {
  member: { select: { id: true, firstName: true, lastName: true } },
  currentTherapist: true,
  extensions: true,
  monthlyReports: { where: { status: 'APPROVED' }, select: { sessionsHeld: true } },
} satisfies Prisma.PsychologicalTreatmentInclude;

type TreatmentFull = Prisma.PsychologicalTreatmentGetPayload<{ include: typeof treatmentInclude }>;

export const treatmentDto = (t: TreatmentFull) => {
  // הארכה נספרת במכסה רק לאחר חתימה (מסמך הדרישות: הכרטיס עובר ל"פעיל (הארכה)" כשהמטופל חותם)
  const extensionSessions = t.extensions.filter((e) => e.signedAt).reduce((s, e) => s + e.additionalSessions, 0);
  const pending = t.extensions.filter((e) => !e.signedAt);
  const approvedTotal = t.approvedSessions + extensionSessions;
  // מספר הפגישות שהתקיימו נגזר מדיווחים מאושרים בלבד
  const held = t.monthlyReports.reduce((s, r) => s + r.sessionsHeld, 0);
  return {
    id: t.id,
    memberId: t.memberId,
    memberName: `${t.member.firstName} ${t.member.lastName}`,
    therapist: t.currentTherapist ? { id: t.currentTherapist.id, fullName: t.currentTherapist.fullName } : null,
    socialWorker: t.socialWorker,
    track: t.track,
    status: t.status,
    baseApprovedSessions: t.approvedSessions,
    extensionSessions,
    pendingExtensionSessions: pending.reduce((s, e) => s + e.additionalSessions, 0),
    pendingExtensionIds: pending.map((e) => e.id),
    approvedSessions: approvedTotal,
    heldSessions: held,
    remainingSessions: Math.max(0, approvedTotal - held),
    overQuota: held > approvedTotal,
    sessionCost: t.sessionCost,
    copayPerSession: t.copayPerSession,
    yehudaApproval: t.yehudaApproval,
    intakeRef: t.intakeRef,
    startDate: toDateOnly(t.startDate)!,
    endDate: toDateOnly(t.endDate),
    endReason: t.endReason,
  };
};

async function loadTreatment(id: number, db: Tx | typeof prisma = prisma) {
  const t = await db.psychologicalTreatment.findUnique({ where: { id }, include: treatmentInclude });
  if (!t) throw notFound('תהליך השפ"ח');
  return t;
}

export async function getTreatment(id: number) {
  return treatmentDto(await loadTreatment(id));
}

export interface TreatmentListQuery { q?: string; status?: string; track?: string; sort?: string; order?: string; memberId?: number }

export async function listTreatments(query: TreatmentListQuery) {
  const rows = await prisma.psychologicalTreatment.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(query.track ? { track: query.track } : {}), ...(query.memberId ? { memberId: query.memberId } : {}) },
    include: treatmentInclude,
  });
  let list = rows.map(treatmentDto);
  const q = query.q?.trim();
  if (q) list = list.filter((t) => t.memberName.includes(q) || (t.therapist?.fullName ?? '').includes(q));
  const dir = query.order === 'asc' ? 1 : -1;
  const sort = query.sort ?? 'startDate';
  list.sort((a, b) => {
    switch (sort) {
      case 'member': return a.memberName.localeCompare(b.memberName, 'he') * dir;
      case 'therapist': return (a.therapist?.fullName ?? '').localeCompare(b.therapist?.fullName ?? '', 'he') * dir;
      case 'held': return (a.heldSessions - b.heldSessions) * dir;
      case 'approved': return (a.approvedSessions - b.approvedSessions) * dir;
      case 'status': return a.status.localeCompare(b.status) * dir;
      case 'id': return (a.id - b.id) * dir;
      default: return (a.startDate.localeCompare(b.startDate) || a.id - b.id) * dir;
    }
  });
  return list;
}

// ======================= פעולות יסוד (בתוך טרנזקציה) =======================

async function changeStatus(tx: Tx, id: number, from: string | null, to: TreatmentStatus, source: 'MANUAL' | 'AUTO', reason?: string | null, extra: Prisma.PsychologicalTreatmentUpdateInput = {}) {
  await tx.psychologicalTreatment.update({ where: { id }, data: { status: to, ...extra } });
  await tx.treatmentStatusHistory.create({ data: { treatmentId: id, fromStatus: from, toStatus: to, reason: reason ?? null, source } });
}

const addEvent = (tx: Tx, treatmentId: number, type: string, description: string, o: { date?: Date; actor?: string | null; details?: string | null; exceptionKind?: string | null } = {}) =>
  tx.treatmentEvent.create({
    data: { treatmentId, type, description, date: o.date ?? new Date(), actor: o.actor ?? null, details: o.details ?? null, exceptionKind: o.exceptionKind ?? null },
  });

const withNote = (label: string, note?: string | null) => (note ? `${label} - ${note}` : label);

async function getTherapistFor(tx: Tx, therapistId: number, track: string) {
  const th = await tx.therapist.findUnique({ where: { id: therapistId } });
  if (!th) throw new AppError(404, 'THERAPIST_NOT_FOUND', 'המטפל לא נמצא');
  if (!th.active) throw new AppError(422, 'THERAPIST_INACTIVE', 'המטפל אינו פעיל');
  if (th.type !== track) throw new AppError(422, 'TRACK_MISMATCH', track === 'SMAT' ? 'במסלול סמט יש לבחור מטפל מסוג סמט' : 'במסלול פרטי יש לבחור מטפל פרטי');
  return th;
}

// ======================= יצירת תהליך =======================

export async function createTreatment(input: z.infer<typeof treatmentCreateSchema>) {
  if (!input.yehudaApproval) throw new AppError(422, 'APPROVAL_REQUIRED', 'לא ניתן לפתוח תהליך שפ"ח ללא אישור מיהודה');
  const id = await prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'החבר לא נמצא');
    const open = await tx.psychologicalTreatment.findFirst({ where: { memberId: member.id, status: { not: 'FINISHED' } } });
    if (open) throw new AppError(409, 'OPEN_TREATMENT_EXISTS', 'לחבר כבר קיים תהליך שפ"ח שטרם הסתיים', { treatmentId: open.id });
    const therapist = input.therapistId ? await getTherapistFor(tx, input.therapistId, input.track) : null;
    const status: TreatmentStatus = therapist ? 'PENDING_CONTRACT' : 'PENDING_THERAPIST';
    const t = await tx.psychologicalTreatment.create({
      data: {
        memberId: member.id, socialWorker: input.socialWorker, track: input.track, currentTherapistId: therapist?.id ?? null,
        status, approvedSessions: input.approvedSessions, sessionCost: therapist?.pricePerSession ?? null,
        copayPerSession: input.copayPerSession, yehudaApproval: true, intakeRef: input.intakeRef ?? null, startDate: parseDateOnly(todayDateOnly()),
      },
    });
    await tx.treatmentStatusHistory.create({ data: { treatmentId: t.id, fromStatus: null, toStatus: status, reason: 'פתיחת תהליך', source: 'MANUAL' } });
    await addEvent(tx, t.id, 'OPENED', 'נפתח תהליך שפ"ח', { actor: input.socialWorker });
    if (therapist) {
      await tx.treatmentTherapistHistory.create({ data: { treatmentId: t.id, therapistId: therapist.id, fromDate: new Date() } });
      await addEvent(tx, t.id, 'THERAPIST_ASSIGNED', `שויך מטפל: ${therapist.fullName}`, { actor: therapist.fullName });
    }
    return t.id;
  });
  return getTreatment(id);
}

export async function updateTreatment(id: number, input: z.infer<typeof treatmentUpdateSchema>) {
  await loadTreatment(id);
  await prisma.psychologicalTreatment.update({
    where: { id },
    data: {
      ...(input.socialWorker !== undefined && { socialWorker: input.socialWorker }),
      ...(input.sessionCost !== undefined && { sessionCost: input.sessionCost }),
      ...(input.copayPerSession !== undefined && { copayPerSession: input.copayPerSession }),
      ...(input.approvedSessions !== undefined && { approvedSessions: input.approvedSessions }),
      ...(input.startDate !== undefined && { startDate: parseDateOnly(input.startDate) }),
      ...(input.intakeRef !== undefined && { intakeRef: input.intakeRef }),
    },
  });
  return getTreatment(id);
}

// ======================= מטפלים בתהליך =======================

export async function assignTherapist(id: number, input: z.infer<typeof assignSchema>) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (t.currentTherapistId) throw new AppError(409, 'HAS_THERAPIST', 'כבר משויך מטפל. להחלפה יש להשתמש בפעולת החלפת מטפל');
    if (t.status === 'FINISHED') throw new AppError(409, 'FINISHED', 'התהליך הסתיים');
    const th = await getTherapistFor(tx, input.therapistId, t.track);
    const date = eventDate(input.date);
    await tx.psychologicalTreatment.update({ where: { id }, data: { currentTherapistId: th.id, sessionCost: th.pricePerSession } });
    await tx.treatmentTherapistHistory.create({ data: { treatmentId: id, therapistId: th.id, fromDate: date } });
    await addEvent(tx, id, 'THERAPIST_ASSIGNED', `שויך מטפל: ${th.fullName}`, { date, actor: th.fullName });
    if (t.status === 'PENDING_THERAPIST') await changeStatus(tx, id, t.status, 'PENDING_CONTRACT', 'MANUAL', 'שויך מטפל');
  });
  return getTreatment(id);
}

export async function changeTherapist(id: number, input: z.infer<typeof changeTherapistSchema>) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (!t.currentTherapistId) throw new AppError(409, 'NO_THERAPIST', 'אין מטפל נוכחי. יש לשייך מטפל');
    if (t.status === 'FINISHED') throw new AppError(409, 'FINISHED', 'התהליך הסתיים');
    if (t.currentTherapistId === input.newTherapistId) throw new AppError(422, 'SAME_THERAPIST', 'המטפל החדש זהה למטפל הנוכחי');
    const next = await getTherapistFor(tx, input.newTherapistId, t.track);
    const date = eventDate(input.date);
    const open = await tx.treatmentTherapistHistory.findFirst({ where: { treatmentId: id, toDate: null }, orderBy: { id: 'desc' } });
    if (open) await tx.treatmentTherapistHistory.update({ where: { id: open.id }, data: { toDate: date } });
    await tx.treatmentTherapistHistory.create({ data: { treatmentId: id, therapistId: next.id, fromDate: date, changeReason: input.reason, note: input.note ?? null } });
    await tx.psychologicalTreatment.update({ where: { id }, data: { currentTherapistId: next.id, sessionCost: next.pricePerSession } });
    await addEvent(tx, id, 'THERAPIST_CHANGE', `החלפת מטפל: ${t.currentTherapist!.fullName} ← ${next.fullName}`, {
      date, actor: next.fullName, details: withNote(`סיבה: ${input.reason}`, input.note),
    });
  });
  return getTreatment(id);
}

// ======================= סטטוסים =======================

/** הפעלה ידנית לצורך הדגמה בלבד: לא נחתם חוזה בפועל */
export async function signDemo(id: number) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (t.status !== 'PENDING_CONTRACT') throw new AppError(409, 'INVALID_STATUS', 'ניתן לסמן חוזה כחתום רק בסטטוס "ממתין לחתימת מטופל על חוזה"');
    await changeStatus(tx, id, t.status, 'ACTIVE', 'MANUAL', 'סומן ידנית כחתום לצורך הדגמה (לא נחתם מסמך בפועל)');
    await addEvent(tx, id, 'ACTIVATED', 'הטיפול הופעל. החוזה סומן כחתום ידנית לצורך הדגמה', { details: 'פעולה ידנית. לא קיים מסמך חתום' });
  });
  return getTreatment(id);
}

const activeStatusFor = async (tx: Tx, id: number): Promise<TreatmentStatus> =>
  (await tx.treatmentExtension.count({ where: { treatmentId: id, signedAt: { not: null } } })) > 0 ? 'ACTIVE_EXTENSION' : 'ACTIVE';

export async function pauseTreatment(id: number, input: z.infer<typeof pauseSchema>) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (!ACTIVE_STATUSES.includes(t.status)) throw new AppError(409, 'INVALID_STATUS', 'ניתן להשהות רק טיפול פעיל');
    const label = PAUSE_REASONS[input.reason];
    await changeStatus(tx, id, t.status, 'PAUSED', 'MANUAL', withNote(label, input.note));
    await addEvent(tx, id, 'PAUSE', 'הטיפול הושהה', {
      details: withNote(`סיבה: ${label}`, input.note), exceptionKind: input.reason === 'NON_PAYMENT' ? 'LATE_PAYMENT' : 'VIOLATION_PAUSE',
    });
  });
  return getTreatment(id);
}

export async function resumeTreatment(id: number) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (t.status !== 'PAUSED') throw new AppError(409, 'INVALID_STATUS', 'הטיפול אינו מושהה');
    await changeStatus(tx, id, t.status, await activeStatusFor(tx, id), 'MANUAL', 'ביטול השהיה');
    await addEvent(tx, id, 'RESUME', 'ההשהיה בוטלה והטיפול חזר לפעילות');
  });
  return getTreatment(id);
}

export async function freezeTreatment(id: number, input: z.infer<typeof freezeSchema>) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (!ACTIVE_STATUSES.includes(t.status)) throw new AppError(409, 'INVALID_STATUS', 'ניתן להקפיא רק טיפול פעיל');
    const label = FREEZE_REASONS[input.reason];
    await changeStatus(tx, id, t.status, 'FROZEN', 'MANUAL', withNote(label, input.note));
    await addEvent(tx, id, 'FREEZE', 'הטיפול הוקפא', { details: withNote(`סיבה: ${label}`, input.note) });
  });
  return getTreatment(id);
}

export async function unfreezeTreatment(id: number) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (t.status !== 'FROZEN') throw new AppError(409, 'INVALID_STATUS', 'הטיפול אינו בהקפאה');
    await changeStatus(tx, id, t.status, await activeStatusFor(tx, id), 'MANUAL', 'הוצאה מהקפאה');
    await addEvent(tx, id, 'UNFREEZE', 'הטיפול הוצא מהקפאה וחזר לפעילות');
  });
  return getTreatment(id);
}

async function finishInTx(tx: Tx, id: number, reasonKey: keyof typeof FINISH_REASONS, source: 'MANUAL' | 'AUTO', date: Date, note?: string | null) {
  const t = await loadTreatment(id, tx);
  if (t.status === 'FINISHED') throw new AppError(409, 'INVALID_STATUS', 'התהליך כבר הסתיים');
  const label = FINISH_REASONS[reasonKey];
  await changeStatus(tx, id, t.status, 'FINISHED', source, withNote(label, note), { endDate: date, endReason: reasonKey });
  await addEvent(tx, id, 'FINISH', 'הטיפול הסתיים', { date, details: withNote(`סיבה: ${label}`, note) });
}

export async function finishTreatment(id: number, input: z.infer<typeof finishSchema>) {
  await prisma.$transaction((tx) => finishInTx(tx, id, input.reason, 'MANUAL', eventDate(input.date), input.note));
  return getTreatment(id);
}

export async function addNote(id: number, input: z.infer<typeof noteSchema>) {
  await loadTreatment(id);
  await prisma.$transaction((tx) => addEvent(tx, id, 'NOTE', input.description, { date: eventDate(input.date) }));
  return getTreatment(id);
}

export async function addException(id: number, input: z.infer<typeof exceptionSchema>) {
  await loadTreatment(id);
  await prisma.$transaction((tx) =>
    addEvent(tx, id, 'EXCEPTION', input.description, { date: eventDate(input.date), exceptionKind: input.kind }),
  );
  return getTreatment(id);
}

// ======================= הארכות =======================

export async function addExtension(id: number, input: z.infer<typeof extensionSchema>) {
  if (!input.yehudaApproval) throw new AppError(422, 'APPROVAL_REQUIRED', 'לא ניתן להאריך טיפול ללא אישור מיהודה');
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(id, tx);
    if (input.idempotencyKey) {
      const dup = await tx.treatmentExtension.findFirst({ where: { treatmentId: id, idempotencyKey: input.idempotencyKey } });
      if (dup) return; // שליחה חוזרת של אותה פעולה: לא נוצרת הארכה נוספת
    }
    const reopen = t.status === 'FINISHED' && t.endReason === 'QUOTA';
    if (!ACTIVE_STATUSES.includes(t.status) && !['PAUSED', 'FROZEN'].includes(t.status) && !reopen)
      throw new AppError(409, 'INVALID_STATUS', 'ניתן להאריך טיפול שהופעל, או שהסתיים עקב מיצוי המכסה בלבד');
    const date = eventDate(input.date);
    await tx.treatmentExtension.create({
      data: { treatmentId: id, additionalSessions: input.additionalSessions, copayPerSession: input.copayPerSession, yehudaApproval: true, extensionDate: date, idempotencyKey: input.idempotencyKey ?? null },
    });
    // טיפול שהסתיים בגלל מיצוי המכסה וממתין לחתימה על הארכה: סטטוס ייעודי (שורה 902 במסמך הדרישות)
    if (reopen) await changeStatus(tx, id, t.status, 'PENDING_EXTENSION_SIGNATURE', 'MANUAL', `בקשת הארכה ב-${input.additionalSessions} פגישות, ממתינה לחתימה`);
    await addEvent(tx, id, 'EXTENSION', `נוצרה הארכת טיפול ב-${input.additionalSessions} פגישות (ממתינה לחתימת המטופל)`, {
      date, details: `השתתפות עצמית לפגישות ההארכה: ${input.copayPerSession} ש"ח. קיים אישור מיהודה`,
    });
  });
  return getTreatment(id);
}

/** סימון חתימה על חוזה הארכה לצורך הדגמה (אין חתימה דיגיטלית): ההארכה נספרת במכסה והסטטוס עובר ל"פעיל (הארכה)" */
export async function signExtension(treatmentId: number, extensionId: number) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTreatment(treatmentId, tx);
    const ext = await tx.treatmentExtension.findFirst({ where: { id: extensionId, treatmentId } });
    if (!ext) throw notFound('ההארכה');
    // עדכון מותנה: לחיצה כפולה לא תספור את ההארכה פעמיים
    const res = await tx.treatmentExtension.updateMany({ where: { id: extensionId, signedAt: null }, data: { signedAt: new Date() } });
    if (res.count === 0) throw new AppError(409, 'ALREADY_SIGNED', 'ההארכה כבר נחתמה');
    if (t.status === 'ACTIVE' || t.status === 'PENDING_EXTENSION_SIGNATURE') {
      await changeStatus(tx, treatmentId, t.status, 'ACTIVE_EXTENSION', 'MANUAL', 'חוזה ההארכה סומן כחתום לצורך הדגמה', { endDate: null, endReason: null });
    }
    await addEvent(tx, treatmentId, 'EXTENSION_SIGNED', `חוזה ההארכה נחתם (סימון ידני לצורך הדגמה): ${ext.additionalSessions} פגישות נוספות`, { details: 'פעולה ידנית. לא קיים מסמך חתום' });
  });
  return getTreatment(treatmentId);
}

// ======================= דיווחים חודשיים =======================

type ReportRow = Prisma.TreatmentMonthlyReportGetPayload<{ include: { therapist: true } }>;

export const reportDto = (r: ReportRow) => {
  const sessionsCost = money(r.sessionsHeld * r.ratePerSession);
  const cancellationsCost = money(r.paidCancellations * r.ratePerSession);
  return {
    id: r.id, treatmentId: r.treatmentId, therapistId: r.therapistId, therapistName: r.therapist.fullName,
    year: r.year, month: r.month, sessionsHeld: r.sessionsHeld, paidCancellations: r.paidCancellations, notes: r.notes,
    ratePerSession: r.ratePerSession, copayPerSession: r.copayPerSession,
    sessionsCost, cancellationsCost, therapistTotal: money(sessionsCost + cancellationsCost),
    copayTotal: money((r.sessionsHeld + r.paidCancellations) * r.copayPerSession),
    status: r.status, approvedAt: r.approvedAt?.toISOString() ?? null,
    therapistPaymentStatus: r.therapistPaymentStatus, copayPaymentStatus: r.copayPaymentStatus,
  };
};

async function assertReportTherapist(tx: Tx, treatmentId: number, therapistId: number) {
  const used = await tx.treatmentTherapistHistory.findFirst({ where: { treatmentId, therapistId } });
  if (!used) throw new AppError(422, 'THERAPIST_NOT_IN_TREATMENT', 'המטפל שנבחר לא שויך לתהליך זה');
}

export async function createReport(treatmentId: number, input: z.infer<typeof reportSchema>) {
  try {
    const r = await prisma.$transaction(async (tx) => {
      const t = await loadTreatment(treatmentId, tx);
      if (PENDING_STATUSES.includes(t.status)) throw new AppError(409, 'NOT_ACTIVATED', 'לא ניתן להזין דיווח לפני הפעלת הטיפול');
      await assertReportTherapist(tx, treatmentId, input.therapistId);
      const th = await tx.therapist.findUniqueOrThrow({ where: { id: input.therapistId } });
      return tx.treatmentMonthlyReport.create({
        data: {
          treatmentId, therapistId: th.id, year: input.year, month: input.month, sessionsHeld: input.sessionsHeld,
          paidCancellations: input.paidCancellations, notes: input.notes ?? null,
          ratePerSession: input.ratePerSession ?? t.sessionCost ?? th.pricePerSession, // תעריף נשמר בדיווח
          copayPerSession: input.copayPerSession ?? t.copayPerSession,
        },
        include: { therapist: true },
      });
    });
    return reportDto(r);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError(409, 'REPORT_EXISTS', 'כבר קיים דיווח לאותו חודש ואותו מטפל בתהליך זה');
    throw e;
  }
}

export async function updateReport(reportId: number, input: z.infer<typeof reportSchema>) {
  const existing = await prisma.treatmentMonthlyReport.findUnique({ where: { id: reportId } });
  if (!existing) throw notFound('הדיווח');
  if (existing.status === 'APPROVED') throw new AppError(409, 'REPORT_APPROVED', 'דיווח מאושר אינו ניתן לעריכה');
  try {
    const r = await prisma.$transaction(async (tx) => {
      await assertReportTherapist(tx, existing.treatmentId, input.therapistId);
      return tx.treatmentMonthlyReport.update({
        where: { id: reportId },
        data: {
          therapistId: input.therapistId, year: input.year, month: input.month, sessionsHeld: input.sessionsHeld,
          paidCancellations: input.paidCancellations, notes: input.notes ?? null,
          ...(input.ratePerSession !== undefined && { ratePerSession: input.ratePerSession }),
          ...(input.copayPerSession !== undefined && { copayPerSession: input.copayPerSession }),
        },
        include: { therapist: true },
      });
    });
    return reportDto(r);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError(409, 'REPORT_EXISTS', 'כבר קיים דיווח לאותו חודש ואותו מטפל בתהליך זה');
    throw e;
  }
}

export async function deleteReport(reportId: number) {
  const r = await prisma.treatmentMonthlyReport.findUnique({ where: { id: reportId } });
  if (!r) throw notFound('הדיווח');
  if (r.status !== 'DRAFT') throw new AppError(409, 'REPORT_LOCKED', 'ניתן למחוק טיוטה בלבד');
  await prisma.treatmentMonthlyReport.delete({ where: { id: reportId } });
  return r.treatmentId;
}

export async function submitReport(reportId: number) {
  const res = await prisma.treatmentMonthlyReport.updateMany({ where: { id: reportId, status: 'DRAFT' }, data: { status: 'PENDING' } });
  if (res.count === 0) {
    const r = await prisma.treatmentMonthlyReport.findUnique({ where: { id: reportId } });
    if (!r) throw notFound('הדיווח');
    throw new AppError(409, 'INVALID_STATUS', 'ניתן לשלוח לאישור טיוטה בלבד');
  }
  const r = await prisma.treatmentMonthlyReport.findUniqueOrThrow({ where: { id: reportId }, include: { therapist: true } });
  return reportDto(r);
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

/** אישור דיווח: פעולה חד-פעמית. רק דיווח מאושר נספר בפגישות שהתקיימו */
export async function approveReport(reportId: number) {
  const treatmentId = await prisma.$transaction(async (tx) => {
    const guard = await tx.treatmentMonthlyReport.updateMany({
      where: { id: reportId, status: { in: ['DRAFT', 'PENDING'] } },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
    if (guard.count === 0) {
      const r = await tx.treatmentMonthlyReport.findUnique({ where: { id: reportId } });
      if (!r) throw notFound('הדיווח');
      throw new AppError(409, 'ALREADY_APPROVED', 'הדיווח כבר אושר');
    }
    const r = await tx.treatmentMonthlyReport.findUniqueOrThrow({ where: { id: reportId }, include: { therapist: true } });
    await addEvent(tx, r.treatmentId, 'REPORT_APPROVED', `אושר דיווח חודשי ${monthLabel(r.year, r.month)}: ${r.sessionsHeld} פגישות`, { actor: r.therapist.fullName });
    // הערת המטפל בדיווח החודשי מתועדת גם בפעולות התהליך ("הודעות מטפל")
    if (r.notes) await addEvent(tx, r.treatmentId, 'THERAPIST_MESSAGE', `הודעת מטפל (${monthLabel(r.year, r.month)}): ${r.notes}`, { actor: r.therapist.fullName });

    // סיום אוטומטי רק כשהמכסה המאושרת מוצתה על ידי דיווחים מאושרים
    const t = await loadTreatment(r.treatmentId, tx);
    const dto = treatmentDto(t);
    if (ACTIVE_STATUSES.includes(t.status) && dto.heldSessions >= dto.approvedSessions) {
      // הארכה שטרם נחתמה: הטיפול ממתין לחתימה ואינו מסתיים
      if (dto.pendingExtensionIds.length)
        await changeStatus(tx, t.id, t.status, 'PENDING_EXTENSION_SIGNATURE', 'AUTO', 'מכסת הפגישות מוצתה, והארכה ממתינה לחתימת המטופל');
      else await finishInTx(tx, t.id, 'QUOTA', 'AUTO', new Date(), 'הסיום בוצע אוטומטית');
    }
    return r.treatmentId;
  });
  return { treatment: await getTreatment(treatmentId), report: reportDto(await prisma.treatmentMonthlyReport.findUniqueOrThrow({ where: { id: reportId }, include: { therapist: true } })) };
}

export async function setPayment(reportId: number, input: z.infer<typeof paymentSchema>) {
  const r = await prisma.treatmentMonthlyReport.findUnique({ where: { id: reportId } });
  if (!r) throw notFound('הדיווח');
  if (r.status !== 'APPROVED') throw new AppError(409, 'NOT_APPROVED', 'ניתן לעדכן סטטוס תשלום רק לדיווח מאושר');
  const upd = await prisma.treatmentMonthlyReport.update({
    where: { id: reportId },
    data: { ...(input.therapistPaymentStatus && { therapistPaymentStatus: input.therapistPaymentStatus }), ...(input.copayPaymentStatus && { copayPaymentStatus: input.copayPaymentStatus }) },
    include: { therapist: true },
  });
  return reportDto(upd);
}

// ======================= תצוגות: ציר זמן והיסטוריה =======================

const eventDto = (e: { id: number; type: string; date: Date; description: string; actor: string | null; details: string | null; exceptionKind: string | null }) => ({
  id: e.id, type: e.type, date: e.date.toISOString(), description: e.description, actor: e.actor, details: e.details, exceptionKind: e.exceptionKind,
});

export async function getTimeline(id: number) {
  await loadTreatment(id);
  const [reports, events] = await Promise.all([
    prisma.treatmentMonthlyReport.findMany({ where: { treatmentId: id }, include: { therapist: true } }),
    prisma.treatmentEvent.findMany({ where: { treatmentId: id }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
  ]);
  const rows = reports.map(reportDto).sort((a, b) => b.year - a.year || b.month - a.month || a.therapistName.localeCompare(b.therapistName, 'he'));
  return { reports: rows, events: events.map(eventDto) };
}

export async function getEvents(id: number) {
  await loadTreatment(id);
  const events = await prisma.treatmentEvent.findMany({ where: { treatmentId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return events.map(eventDto);
}

export async function getHistory(id: number) {
  await loadTreatment(id);
  const [therapists, statuses, extensions, heldByTherapist] = await Promise.all([
    prisma.treatmentTherapistHistory.findMany({ where: { treatmentId: id }, include: { therapist: true }, orderBy: { id: 'asc' } }),
    prisma.treatmentStatusHistory.findMany({ where: { treatmentId: id }, orderBy: { id: 'asc' } }),
    prisma.treatmentExtension.findMany({ where: { treatmentId: id }, orderBy: { id: 'asc' } }),
    prisma.treatmentMonthlyReport.groupBy({ by: ['therapistId'], where: { treatmentId: id, status: 'APPROVED' }, _sum: { sessionsHeld: true } }),
  ]);
  const held = new Map(heldByTherapist.map((h) => [h.therapistId, h._sum.sessionsHeld ?? 0]));
  return {
    therapists: therapists.map((h) => ({ id: h.id, therapistId: h.therapistId, therapistName: h.therapist.fullName, fromDate: toDateOnly(h.fromDate)!, toDate: toDateOnly(h.toDate), changeReason: h.changeReason, note: h.note, heldSessions: held.get(h.therapistId) ?? 0 })),
    statuses: statuses.map((s) => ({ id: s.id, fromStatus: s.fromStatus, toStatus: s.toStatus, reason: s.reason, source: s.source, createdAt: s.createdAt.toISOString() })),
    extensions: extensions.map((e, i) => ({ id: e.id, number: i + 1, additionalSessions: e.additionalSessions, copayPerSession: e.copayPerSession, extensionDate: toDateOnly(e.extensionDate)!, yehudaApproval: e.yehudaApproval, signedAt: e.signedAt?.toISOString() ?? null })),
  };
}

// ======================= דוחות עו"סית =======================

const socialDto = (r: { id: number; date: Date; type: string; title: string; content: string }) => ({
  id: r.id, date: toDateOnly(r.date)!, type: r.type, title: r.title, content: r.content,
});

export async function listSocialReports(id: number) {
  await loadTreatment(id);
  const rows = await prisma.treatmentSocialWorkerReport.findMany({ where: { treatmentId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return rows.map(socialDto);
}

export async function createSocialReport(id: number, input: z.infer<typeof socialReportSchema>) {
  await loadTreatment(id);
  await prisma.treatmentSocialWorkerReport.create({ data: { treatmentId: id, date: parseDateOnly(input.date), type: input.type, title: input.title, content: input.content } });
  return listSocialReports(id);
}

export async function updateSocialReport(reportId: number, input: z.infer<typeof socialReportSchema>) {
  const r = await prisma.treatmentSocialWorkerReport.findUnique({ where: { id: reportId } });
  if (!r) throw notFound('הדוח');
  await prisma.treatmentSocialWorkerReport.update({ where: { id: reportId }, data: { date: parseDateOnly(input.date), type: input.type, title: input.title, content: input.content } });
  return listSocialReports(r.treatmentId);
}

// ======================= שילוב בכרטיס החבר =======================

export async function memberTreatments(memberId: number) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw notFound('החבר');
  return listTreatments({ memberId, sort: 'startDate', order: 'desc' });
}

/** השתתפות עצמית בשפ"ח, נגזרת מדיווחים מאושרים */
export async function memberCopay(memberId: number) {
  const reports = await prisma.treatmentMonthlyReport.findMany({
    where: { status: 'APPROVED', treatment: { memberId } },
    include: { therapist: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return reports.map((r) => {
    const d = reportDto(r);
    return { reportId: d.id, treatmentId: d.treatmentId, period: monthLabel(d.year, d.month), therapistName: d.therapistName, amount: d.copayTotal, status: d.copayPaymentStatus };
  });
}

export async function memberTreatmentExceptions(memberId: number) {
  const events = await prisma.treatmentEvent.findMany({
    where: { exceptionKind: { not: null }, treatment: { memberId } },
    orderBy: { date: 'desc' },
  });
  return events.map((e) => ({
    id: `t${e.id}`,
    type: (e.exceptionKind === 'LATE_PAYMENT' ? 'TREATMENT_LATE_PAYMENT' : e.exceptionKind === 'VIOLATION_PAUSE' ? 'TREATMENT_VIOLATION' : 'TREATMENT_MANUAL') as
      'TREATMENT_LATE_PAYMENT' | 'TREATMENT_VIOLATION' | 'TREATMENT_MANUAL',
    treatmentId: e.treatmentId,
    date: e.date.toISOString(),
    details: [e.description, e.details].filter(Boolean).join(' | '),
  }));
}

// ======================= פגישות עם המטופל ומשימות לעו"סית =======================

export async function listTreatmentMeetings(id: number) {
  await loadTreatment(id);
  const rows = await prisma.treatmentMeeting.findMany({ where: { treatmentId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  return rows.map((m) => ({ id: m.id, date: toDateOnly(m.date)!, subject: m.subject, subjectLabel: MEETING_SUBJECTS[m.subject as keyof typeof MEETING_SUBJECTS] ?? m.subject, summary: m.summary }));
}

export async function addTreatmentMeeting(id: number, input: z.infer<typeof treatmentMeetingSchema>) {
  await prisma.$transaction(async (tx) => {
    await loadTreatment(id, tx);
    await tx.treatmentMeeting.create({ data: { treatmentId: id, date: parseDateOnly(input.date), subject: input.subject, summary: input.summary ?? null } });
    await addEvent(tx, id, 'MEETING', `פגישה עם המטופל: ${MEETING_SUBJECTS[input.subject]}`, { date: parseDateOnly(input.date), details: input.summary ?? null });
  });
  return listTreatmentMeetings(id);
}

const taskDto = (t: { id: number; title: string; dueDate: Date | null; done: boolean }) => ({ id: t.id, title: t.title, dueDate: toDateOnly(t.dueDate), done: t.done });

export async function listTasks(id: number) {
  await loadTreatment(id);
  const rows = await prisma.treatmentTask.findMany({ where: { treatmentId: id }, orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { id: 'desc' }] });
  return rows.map(taskDto);
}

export async function addTask(id: number, input: z.infer<typeof taskSchema>) {
  await loadTreatment(id);
  await prisma.treatmentTask.create({ data: { treatmentId: id, title: input.title, dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null } });
  return listTasks(id);
}

export async function setTaskDone(taskId: number, done: boolean) {
  const t = await prisma.treatmentTask.findUnique({ where: { id: taskId } });
  if (!t) throw notFound('המשימה');
  await prisma.treatmentTask.update({ where: { id: taskId }, data: { done } });
  return listTasks(t.treatmentId);
}
