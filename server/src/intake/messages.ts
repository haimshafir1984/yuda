import { prisma } from '../db';
import { notFound } from '../errors';
import { deliver } from '../messaging/messageService';
import { renderText } from '../messaging/templates';

/** הודעה למועמד (טרם חבר) לפי תבנית. ערוץ: לפי הבחירה בטופס (SMS כברירת מחדל). בלי כתובת בערוץ: נרשמת כדולגה */
export async function sendToCandidate(candidateId: number, templateKey: string, vars: Record<string, string | number | null | undefined> = {}, related?: { type: string; id: number }) {
  const c = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!c) throw notFound('המועמד');
  const tpl = await prisma.messageTemplate.findUnique({ where: { key: templateKey } });
  if (!tpl || !tpl.active) return null; // תבנית כבויה: לא שולחים
  const all = { שם: c.firstName, 'שם מלא': `${c.firstName} ${c.lastName}`, ...vars };
  const channel = c.preferredChannel === 'EMAIL' ? 'EMAIL' : 'SMS';
  const to = channel === 'EMAIL' ? c.email : c.phone;
  const row = await prisma.outboxMessage.create({
    data: {
      candidateId: c.id,
      channel,
      toAddress: to,
      templateKey: tpl.key,
      subject: tpl.subject ? renderText(tpl.subject, all) : null,
      body: renderText(tpl.body, all),
      status: to ? 'QUEUED' : 'SKIPPED',
      error: to ? null : channel === 'EMAIL' ? 'למועמד אין כתובת מייל' : 'למועמד אין מספר טלפון',
      relatedType: related?.type ?? 'CANDIDATE',
      relatedId: related?.id ?? c.id,
    },
  });
  return to ? deliver(row.id) : row;
}

/** כשל בהודעה לא מפיל את הפעולה העסקית: הכישלון נראה בתיבת היוצאות */
export async function trySend(candidateId: number, templateKey: string, vars: Record<string, string | number | null | undefined> = {}) {
  try {
    return await sendToCandidate(candidateId, templateKey, vars);
  } catch {
    return null;
  }
}

export const baseUrl = () => (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
