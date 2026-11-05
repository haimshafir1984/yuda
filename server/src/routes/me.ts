import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../errors';
import { asyncHandler } from '../http';
import { toDateOnly } from '../lib/dates';
import { normalizePhone } from '../lib/phone';
import { cancelRegistration } from '../services/registrationService';

/**
 * דף החבר "האירועים והסדנאות שאני רשום אליהם" (ציבורי, בלי כניסת צוות).
 * לפי מסמך הדרישות: צפייה בטלפון בלבד, וביטול דורש קוד חד-פעמי.
 * בהדגמה הקוד קבוע ומוצג על המסך. אין שליחת הודעות ואין אבטחה אמיתית.
 */
export const DEMO_OTP = '123456';
export const meRouter = Router();

const phoneSchema = z.object({ phone: z.string({ required_error: 'יש להזין מספר טלפון' }).trim().min(1, 'יש להזין מספר טלפון') });

async function findMember(phone: string) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 9) throw new AppError(400, 'VALIDATION', 'מספר טלפון לא תקין');
  const members = await prisma.member.findMany({ where: { phoneNormalized: normalized } });
  if (members.length === 0) throw new AppError(404, 'NOT_A_MEMBER', 'הדף מיועד לחברי הארגון בלבד. לא נמצא חבר עם מספר הטלפון הזה.');
  if (members.length > 1) throw new AppError(409, 'BLOCKED', 'לא ניתן להציג את הפרטים דרך דף זה. אנא פנו למשרד הארגון.');
  return members[0];
}

async function myEvents(memberId: number) {
  const regs = await prisma.registration.findMany({
    where: { memberId, status: 'ACTIVE', workshop: { status: { notIn: ['FINISHED', 'CANCELLED'] } } },
    include: { workshop: { include: { sessions: { orderBy: { date: 'asc' } } } } },
    orderBy: { registeredAt: 'desc' },
  });
  return regs.map((r) => ({
    registrationId: r.id,
    workshopId: r.workshopId,
    name: r.workshop.name,
    kind: r.workshop.kind,
    startDate: toDateOnly(r.workshop.sessions[0]?.date),
    endDate: toDateOnly(r.workshop.sessions[r.workshop.sessions.length - 1]?.date),
    startTime: r.workshop.startTime,
    isPaid: r.workshop.isPaid,
  }));
}

meRouter.post(
  '/lookup',
  asyncHandler(async (req, res) => {
    const m = await findMember(phoneSchema.parse(req.body).phone);
    res.json({ name: `${m.firstName} ${m.lastName}`, events: await myEvents(m.id), demoCode: DEMO_OTP });
  }),
);

meRouter.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const body = phoneSchema.extend({ registrationId: z.number().int(), code: z.string() }).parse(req.body);
    const m = await findMember(body.phone);
    if (body.code !== DEMO_OTP) throw new AppError(403, 'BAD_CODE', 'קוד האימות שגוי');
    const reg = await prisma.registration.findUnique({ where: { id: body.registrationId } });
    if (!reg || reg.memberId !== m.id || reg.status !== 'ACTIVE') throw new AppError(404, 'NOT_FOUND', 'ההרשמה לא נמצאה');
    await cancelRegistration(reg.id, 'בוטל על ידי החבר דרך דף "האירועים שלי"');
    res.json({ events: await myEvents(m.id) });
  }),
);
