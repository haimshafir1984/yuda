import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam } from '../http';
import { listTemplates } from '../messaging/messageService';
import { manualSendSchema, sendManual } from '../messaging/manualSend';
import * as complaints from '../services/complaintService';
import * as mediation from '../services/mediationService';
import * as members from '../services/memberService';
import * as status from '../services/memberStatusService';
import { memberNoteSchema } from '../validation';

/** שלב א׳: סטטוס חבר והרחקות, הערות צוות, דיווחים ותלונות, גישור משפחתי ושליחת הודעות ידנית */
export const stageARouter = Router();
const r = stageARouter;
const q = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optStr = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין');

const removalSchema = z.object({
  kind: z.enum(members.REMOVAL_KINDS, { required_error: 'יש לבחור סוג הרחקה' }),
  date: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  reason: z.string({ required_error: 'יש להזין סיבה' }).trim().min(1, 'יש להזין סיבה').max(500),
  description: optStr(3000),
  handledBy: optStr(80),
  endDate: z.preprocess(emptyToNull, dateStr.nullable().optional()),
  condition: optStr(500),
});

// ----- חברים: סטטוס, הרחקות, הערות צוות, דוח -----
r.get('/members/reports/inactive', asyncHandler(async (_rq, res) => res.json(await status.inactiveCandidates())));
r.patch('/members/:id/status', asyncHandler(async (rq, res) => {
  const body = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).parse(rq.body);
  res.json(await status.setActiveState(idParam(rq), body.status));
}));
r.get('/members/:id/removals', asyncHandler(async (rq, res) => res.json(await status.listRemovals(idParam(rq)))));
r.post('/members/:id/removals', asyncHandler(async (rq, res) => {
  await status.addRemoval(idParam(rq), removalSchema.parse(rq.body));
  res.status(201).json(await status.listRemovals(idParam(rq)));
}));
r.post('/members/:id/removals/:removalId/return', asyncHandler(async (rq, res) => {
  const body = z.object({ note: optStr(1000) }).parse(rq.body ?? {});
  res.json(await status.returnFromRemoval(idParam(rq), idParam(rq, 'removalId'), body.note));
}));
r.get('/members/:id/staff-notes', asyncHandler(async (rq, res) => res.json(await members.listNotes(idParam(rq), 'GENERAL'))));
r.post('/members/:id/staff-notes', asyncHandler(async (rq, res) => {
  const body = memberNoteSchema.parse(rq.body);
  res.status(201).json(await members.addNote(idParam(rq), body.text, null, 'GENERAL'));
}));

// ----- דיווחים ותלונות -----
r.get('/complaints', asyncHandler(async (rq, res) => res.json(await complaints.listComplaints({ status: q(rq.query.status), q: q(rq.query.q) }))));
r.post('/complaints', asyncHandler(async (rq, res) => res.status(201).json(await complaints.createComplaint(complaints.complaintCreateSchema.parse(rq.body)))));
r.get('/complaints/:id', asyncHandler(async (rq, res) => res.json(await complaints.getComplaint(idParam(rq)))));
r.put('/complaints/:id', asyncHandler(async (rq, res) => res.json(await complaints.updateComplaint(idParam(rq), complaints.complaintUpdateSchema.parse(rq.body)))));
r.post('/complaints/:id/status', asyncHandler(async (rq, res) => res.json(await complaints.setStatus(idParam(rq), complaints.complaintStatusSchema.parse(rq.body).status))));
r.post('/complaints/:id/entries', asyncHandler(async (rq, res) => res.status(201).json(await complaints.addEntry(idParam(rq), complaints.entrySchema.parse(rq.body)))));
r.post('/complaints/:id/action', asyncHandler(async (rq, res) => res.json(await complaints.setAction(idParam(rq), complaints.actionSchema.parse(rq.body)))));
r.get('/members/:id/complaints', asyncHandler(async (rq, res) => res.json(await complaints.memberComplaints(idParam(rq)))));

// ----- גישור משפחתי -----
r.get('/mediations', asyncHandler(async (rq, res) => res.json(await mediation.listMediations({ status: q(rq.query.status) }))));
r.post('/mediations', asyncHandler(async (rq, res) => res.status(201).json(await mediation.createMediation(mediation.mediationCreateSchema.parse(rq.body)))));
r.get('/mediations/:id', asyncHandler(async (rq, res) => res.json(await mediation.getMediation(idParam(rq)))));
r.put('/mediations/:id', asyncHandler(async (rq, res) => res.json(await mediation.updateMediation(idParam(rq), mediation.mediationUpdateSchema.parse(rq.body)))));
r.post('/mediations/:id/contacts', asyncHandler(async (rq, res) => res.status(201).json(await mediation.addContact(idParam(rq), mediation.contactSchema.parse(rq.body)))));
r.post('/mediations/:id/finish', asyncHandler(async (rq, res) => res.json(await mediation.finishMediation(idParam(rq), mediation.finishMediationSchema.parse(rq.body)))));
r.post('/mediations/:id/reopen', asyncHandler(async (rq, res) => res.json(await mediation.reopenMediation(idParam(rq)))));
r.get('/members/:id/mediations', asyncHandler(async (rq, res) => res.json(await mediation.listMediations({ memberId: idParam(rq) }))));

// ----- שליחת הודעה ידנית -----
// רשימת התבניות לבחירה בעת שליחה: זמינה לכל מי שעורך חברים (עריכת התבניות עצמן נשארת בהגדרות)
r.get('/messages/send-options', asyncHandler(async (_rq, res) => res.json((await listTemplates()).filter((t) => t.active))));
r.post('/messages/send', asyncHandler(async (rq, res) => res.status(201).json(await sendManual(manualSendSchema.parse(rq.body)))));
