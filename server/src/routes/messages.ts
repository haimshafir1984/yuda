import { Router } from 'express';
import { z } from 'zod';
import { listOutbox, listTemplates, resendMessage, updateTemplate } from '../messaging/messageService';
import { listJobs, backgroundTick } from '../messaging/scheduler';
import { asyncHandler, idParam } from '../http';

export const messagesRouter = Router();


messagesRouter.get('/messages/templates', asyncHandler(async (_req, res) => res.json(await listTemplates())));

messagesRouter.put(
  '/messages/templates/:id',
  asyncHandler(async (req, res) => {
    const body = z.object({ subject: z.string().nullable().optional(), body: z.string().trim().min(1, 'נוסח ההודעה חובה').max(1000).optional(), active: z.boolean().optional() }).parse(req.body);
    res.json(await updateTemplate(idParam(req), body));
  }),
);

messagesRouter.get(
  '/messages/outbox',
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.string().optional(), memberId: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
    res.json(await listOutbox(q));
  }),
);

messagesRouter.post('/messages/outbox/:id/resend', asyncHandler(async (req, res) => res.json(await resendMessage(idParam(req)))));

messagesRouter.get('/messages/jobs', asyncHandler(async (req, res) => res.json(await listJobs(typeof req.query.status === 'string' ? req.query.status : undefined))));

/** הרצה מיידית של מחזור הרקע (להדגמה: לא צריך לחכות לדקה) */
messagesRouter.post('/messages/run-now', asyncHandler(async (_req, res) => res.json(await backgroundTick())));
