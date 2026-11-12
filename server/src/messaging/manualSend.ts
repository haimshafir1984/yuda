import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../errors';
import { deliver } from './messageService';
import { renderText } from './templates';

/** שליחה ידנית של הודעה לחבר אחד או למספר חברים: לפי תבנית (עם ערכים למשתנים), או בנוסח חופשי */

export const manualSendSchema = z
  .object({
    memberIds: z.array(z.number().int()).min(1, 'יש לבחור לפחות חבר אחד').max(500),
    templateKey: z.string().min(1).optional(),
    body: z.string().trim().max(1000).optional(),
    subject: z.string().trim().max(200).nullish(),
    vars: z.record(z.string(), z.string().max(300)).default({}),
    related: z.object({ type: z.string().max(30), id: z.number().int() }).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.templateKey && !v.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'יש לבחור תבנית או לכתוב נוסח הודעה' });
  });

export async function sendManual(input: z.infer<typeof manualSendSchema>) {
  const tpl = input.templateKey ? await prisma.messageTemplate.findUnique({ where: { key: input.templateKey } }) : null;
  if (input.templateKey && !tpl) throw new AppError(404, 'NOT_FOUND', 'התבנית לא נמצאה');
  const members = await prisma.member.findMany({ where: { id: { in: input.memberIds } } });
  const results: { memberId: number; memberName: string; status: string; error: string | null }[] = [];

  for (const member of members) {
    const vars = { שם: member.firstName, 'שם מלא': `${member.firstName} ${member.lastName}`, ...input.vars };
    const channel = member.preferredChannel === 'EMAIL' ? 'EMAIL' : 'SMS';
    const to = channel === 'EMAIL' ? member.email : member.phone;
    const bodyText = tpl ? tpl.body : input.body!;
    const subjectText = tpl ? tpl.subject : input.subject ?? null;
    const row = await prisma.outboxMessage.create({
      data: {
        memberId: member.id,
        channel,
        toAddress: to,
        templateKey: tpl?.key ?? null,
        subject: subjectText ? renderText(subjectText, vars) : null,
        body: renderText(bodyText, vars),
        status: to ? 'QUEUED' : 'SKIPPED',
        error: to ? null : channel === 'EMAIL' ? 'לחבר אין כתובת מייל' : 'לחבר אין מספר טלפון',
        relatedType: input.related?.type ?? 'MANUAL',
        relatedId: input.related?.id,
      },
    });
    const final = to ? await deliver(row.id) : row;
    results.push({ memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, status: final?.status ?? row.status, error: final?.error ?? null });
  }
  const missing = input.memberIds.filter((id) => !members.some((m) => m.id === id));
  return { results, missing, sent: results.filter((r) => r.status === 'SENT').length, skipped: results.filter((r) => r.status !== 'SENT').length };
}
