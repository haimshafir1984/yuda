import { prisma } from '../db';
import { AppError, notFound } from '../errors';
import { getProvider } from './provider';
import { renderText, TemplateKey } from './templates';

export const MAX_ATTEMPTS = 3;

export interface SendInput {
  memberId: number;
  templateKey: TemplateKey;
  vars: Record<string, string | number | null | undefined>;
  related?: { type: string; id: number };
}

/** ניסיון שליחה אחד להודעה בתור. הכישלון נשמר ולא נזרק */
export async function deliver(id: number) {
  const msg = await prisma.outboxMessage.findUnique({ where: { id } });
  if (!msg || (msg.status !== 'QUEUED' && msg.status !== 'FAILED')) return msg;
  const provider = getProvider();
  try {
    await provider.send({ channel: msg.channel as 'SMS' | 'EMAIL', to: msg.toAddress ?? '', subject: msg.subject, body: msg.body });
    return await prisma.outboxMessage.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, provider: provider.name, error: null },
    });
  } catch (e) {
    return prisma.outboxMessage.update({
      where: { id },
      data: { status: 'FAILED', attempts: { increment: 1 }, provider: provider.name, error: e instanceof Error ? e.message : 'שגיאת שליחה' },
    });
  }
}

/**
 * שליחת הודעה לחבר לפי התבנית וערוץ התקשורת המועדף שלו (ברירת מחדל SMS).
 * חבר בלי כתובת בערוץ הנבחר: ההודעה נרשמת כדולגה עם הסיבה, כדי שהצוות יראה שלא נשלחה.
 */
export async function sendToMember(input: SendInput) {
  const member = await prisma.member.findUnique({ where: { id: input.memberId } });
  if (!member) throw notFound('החבר');
  const tpl = await prisma.messageTemplate.findUnique({ where: { key: input.templateKey } });
  if (!tpl || !tpl.active) return null; // תבנית כבויה: לא שולחים

  const vars = { שם: member.firstName, 'שם מלא': `${member.firstName} ${member.lastName}`, ...input.vars };
  const channel = member.preferredChannel === 'EMAIL' ? 'EMAIL' : 'SMS';
  const to = channel === 'EMAIL' ? member.email : member.phone;
  const row = await prisma.outboxMessage.create({
    data: {
      memberId: member.id,
      channel,
      toAddress: to,
      templateKey: tpl.key,
      subject: tpl.subject ? renderText(tpl.subject, vars) : null,
      body: renderText(tpl.body, vars),
      status: to ? 'QUEUED' : 'SKIPPED',
      error: to ? null : channel === 'EMAIL' ? 'לחבר אין כתובת מייל' : 'לחבר אין מספר טלפון',
      relatedType: input.related?.type,
      relatedId: input.related?.id,
    },
  });
  return to ? deliver(row.id) : row;
}

/** ניסיון חוזר להודעות שנכשלו, עד MAX_ATTEMPTS */
export async function retryFailedMessages() {
  const failed = await prisma.outboxMessage.findMany({ where: { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } }, take: 50 });
  for (const m of failed) await deliver(m.id);
  return failed.length;
}

export async function listOutbox(query: { status?: string; memberId?: number; limit?: number }) {
  const rows = await prisma.outboxMessage.findMany({
    where: { ...(query.status && { status: query.status }), ...(query.memberId && { memberId: query.memberId }) },
    orderBy: { id: 'desc' },
    take: Math.min(query.limit ?? 100, 500),
  });
  const members = await prisma.member.findMany({
    where: { id: { in: rows.map((r) => r.memberId).filter((x): x is number => x != null) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const name = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    memberName: r.memberId ? name.get(r.memberId) ?? null : null,
    channel: r.channel,
    toAddress: r.toAddress,
    templateKey: r.templateKey,
    subject: r.subject,
    body: r.body,
    status: r.status,
    error: r.error,
    attempts: r.attempts,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
  }));
}

export async function resendMessage(id: number) {
  const m = await prisma.outboxMessage.findUnique({ where: { id } });
  if (!m) throw notFound('ההודעה');
  if (m.status === 'SENT') throw new AppError(409, 'ALREADY_SENT', 'ההודעה כבר נשלחה');
  if (m.status === 'SKIPPED' || !m.toAddress) throw new AppError(409, 'NO_ADDRESS', 'אין כתובת לשליחה. יש להשלים את פרטי החבר');
  return deliver(id);
}

export async function listTemplates() {
  return prisma.messageTemplate.findMany({ orderBy: { id: 'asc' } });
}

export async function updateTemplate(id: number, data: { subject?: string | null; body?: string; active?: boolean }) {
  const t = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!t) throw notFound('התבנית');
  return prisma.messageTemplate.update({
    where: { id },
    data: { ...(data.subject !== undefined && { subject: data.subject }), ...(data.body !== undefined && { body: data.body }), ...(data.active !== undefined && { active: data.active }) },
  });
}
