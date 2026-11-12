import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam } from '../http';
import * as intake from '../intake/intakeService';
import { SETTING_KEYS, getSettings, updateSettings } from '../intake/settings';
import { assignableNames } from '../auth/users';

/** קבלת חברים חדשים: ממשק צוות (אזור "קבלת חברים") */
export const intakeRouter = Router();
const r = intakeRouter;
const q = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

r.get('/intake/summary', asyncHandler(async (_rq, res) => res.json({ counts: await intake.summary(), alerts: await intake.alerts() })));
r.get('/intake/coordinators', asyncHandler(async (_rq, res) => res.json(await assignableNames(['INTAKE_COORDINATOR', 'GENERAL_MANAGER']))));

r.get('/intake/settings', asyncHandler(async (_rq, res) => res.json(await getSettings())));
r.put('/intake/settings', asyncHandler(async (rq, res) => {
  const shape = Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().trim().max(300).optional()]));
  const body = z.object(shape).parse(rq.body) as Record<string, string | undefined>;
  for (const k of ['intake.minAge', 'intake.maxAge', 'intake.noReplyDays', 'intake.fadeDays']) {
    if (body[k] !== undefined && !/^\d{1,3}$/.test(body[k]!)) return res.status(400).json({ error: { code: 'VALIDATION', message: 'יש להזין מספר תקין', details: { fields: { [k]: 'יש להזין מספר תקין' } } } });
  }
  if (Number(body['intake.minAge'] ?? 0) > Number(body['intake.maxAge'] ?? 999)) return res.status(400).json({ error: { code: 'VALIDATION', message: 'הגיל המינימלי גדול מהמקסימלי', details: { fields: { 'intake.minAge': 'הגיל המינימלי גדול מהמקסימלי' } } } });
  res.json(await updateSettings(body));
}));

// ----- מועמדים -----
r.get('/intake/candidates', asyncHandler(async (rq, res) => res.json(await intake.listCandidates({ status: q(rq.query.status), q: q(rq.query.q), repeat: rq.query.repeat === 'true' }))));
r.get('/intake/candidates/:id', asyncHandler(async (rq, res) => res.json(await intake.getCandidate(idParam(rq)))));
r.post('/intake/candidates/:id/assign', asyncHandler(async (rq, res) => res.json(await intake.assignCoordinator(idParam(rq), z.object({ coordinator: z.string().trim().max(80).nullable() }).parse(rq.body).coordinator || null))));
r.post('/intake/candidates/:id/reject', asyncHandler(async (rq, res) => res.json(await intake.rejectCandidate(idParam(rq), intake.rejectSchema.parse(rq.body)))));
r.post('/intake/candidates/:id/request-clarification', asyncHandler(async (rq, res) => res.json(await intake.requestClarification(idParam(rq)))));
r.post('/intake/candidates/:id/call', asyncHandler(async (rq, res) => res.json(await intake.recordCall(idParam(rq), intake.callSchema.parse(rq.body)))));
r.post('/intake/candidates/:id/invite-group', asyncHandler(async (rq, res) => res.json(await intake.inviteGroup(idParam(rq)))));
r.post('/intake/candidates/:id/invite-personal', asyncHandler(async (rq, res) => res.json(await intake.invitePersonal(idParam(rq), intake.personalInviteSchema.parse(rq.body).slots))));
r.post('/intake/candidates/:id/meeting', asyncHandler(async (rq, res) => res.json(await intake.scheduleMeeting(idParam(rq), z.object({ scheduledAt: z.string({ required_error: 'יש לבחור מועד' }) }).parse(rq.body).scheduledAt))));
r.post('/intake/candidates/:id/meeting/held', asyncHandler(async (rq, res) => res.json(await intake.meetingHeld(idParam(rq), z.object({ heldAt: z.string().nullish() }).parse(rq.body ?? {}).heldAt))));
r.post('/intake/candidates/:id/meeting/no-show', asyncHandler(async (rq, res) => res.json(await intake.meetingNoShow(idParam(rq)))));
r.post('/intake/candidates/:id/personal-decision', asyncHandler(async (rq, res) => res.json(await intake.personalDecision(idParam(rq), intake.personalDecisionSchema.parse(rq.body)))));

// ----- ראיונות קבוצתיים -----
r.get('/intake/sessions', asyncHandler(async (_rq, res) => res.json(await intake.listSessions())));
r.post('/intake/sessions', asyncHandler(async (rq, res) => res.status(201).json(await intake.createSession(intake.sessionSchema.parse(rq.body)))));
r.get('/intake/sessions/:id', asyncHandler(async (rq, res) => res.json(await intake.getSession(idParam(rq)))));
r.delete('/intake/sessions/:id', asyncHandler(async (rq, res) => { await intake.deleteSession(idParam(rq)); res.json({ ok: true }); }));
r.post('/intake/sessions/:id/send-questionnaires', asyncHandler(async (rq, res) => res.json(await intake.sendQuestionnaires(idParam(rq)))));
r.post('/intake/signups/:id/attendance', asyncHandler(async (rq, res) => res.json(await intake.markAttendance(idParam(rq), z.object({ attended: z.boolean() }).parse(rq.body).attended))));
r.post('/intake/signups/:id/decision', asyncHandler(async (rq, res) => res.json(await intake.decideSignup(idParam(rq), intake.decisionSchema.parse(rq.body)))));

// ----- מעקב חברים חדשים, וכרטיס הקבלה של חבר -----
r.get('/intake/new-members', asyncHandler(async (_rq, res) => res.json(await intake.newMembersReport())));
r.get('/members/:id/intake', asyncHandler(async (rq, res) => res.json(await intake.memberIntake(idParam(rq)))));
