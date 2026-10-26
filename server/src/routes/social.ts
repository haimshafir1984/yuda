import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as req from '../services/serviceRequestService';
import * as sw from '../services/socialWorkService';
import { SOCIAL_WORKERS } from '../services/treatmentService';
import {
  assignSchema, contactSchema, decisionSchema, finishSocialSchema, interventionSchema, linkTreatmentSchema, meetingSchema, noteOptSchema,
  openFromRequestSchema, processCreateSchema, processUpdateSchema, requestCreateSchema, requestNoteSchema, requestStatusSchema, requestUpdateSchema, swReportSchema,
} from '../socialValidation';

export const socialRouter = Router();
const r = socialRouter;
const q = (v: unknown) => (typeof v === 'string' ? v : undefined);

r.get('/service-meta', asyncHandler(async (_req, res) => res.json({ staff: SOCIAL_WORKERS })));

// ----- פניות -----
r.get('/service-requests', asyncHandler(async (rq, res) => {
  const x = rq.query;
  res.json(await req.listRequests({ q: q(x.q), status: q(x.status), type: q(x.type), assignee: q(x.assignee), from: q(x.from), to: q(x.to), sort: q(x.sort), order: q(x.order) }));
}));
r.post('/service-requests', asyncHandler(async (rq, res) => res.status(201).json(await req.createRequest(requestCreateSchema.parse(rq.body)))));
r.get('/service-requests/:id', asyncHandler(async (rq, res) => res.json(await req.getRequest(idParam(rq)))));
r.put('/service-requests/:id', asyncHandler(async (rq, res) => res.json(await req.updateRequest(idParam(rq), requestUpdateSchema.parse(rq.body)))));
r.get('/service-requests/:id/events', asyncHandler(async (rq, res) => res.json(await req.listRequestEvents(idParam(rq)))));
r.get('/service-requests/:id/related', asyncHandler(async (rq, res) => res.json(await req.getRelated(idParam(rq)))));
r.post('/service-requests/:id/assign', asyncHandler(async (rq, res) => res.json(await req.assignRequest(idParam(rq), assignSchema.parse(rq.body)))));
r.post('/service-requests/:id/status', asyncHandler(async (rq, res) => res.json(await req.changeRequestStatus(idParam(rq), requestStatusSchema.parse(rq.body)))));
r.post('/service-requests/:id/notes', asyncHandler(async (rq, res) => res.status(201).json(await req.addRequestNote(idParam(rq), requestNoteSchema.parse(rq.body)))));
r.post('/service-requests/:id/contacts', asyncHandler(async (rq, res) => res.status(201).json(await req.addContact(idParam(rq), contactSchema.parse(rq.body)))));
r.post('/service-requests/:id/decision', asyncHandler(async (rq, res) => res.json(await req.setDecision(idParam(rq), decisionSchema.parse(rq.body)))));
r.post('/service-requests/:id/open-social-work', asyncHandler(async (rq, res) => res.status(201).json(await req.openSocialWork(idParam(rq), openFromRequestSchema.parse(rq.body)))));
r.post('/service-requests/:id/link-treatment', asyncHandler(async (rq, res) => res.json(await req.linkTreatment(idParam(rq), linkTreatmentSchema.parse(rq.body).treatmentId))));

// ----- ליווי עו"ס -----
r.get('/social-work/processes', asyncHandler(async (rq, res) => {
  const x = rq.query;
  res.json(await sw.listProcesses({ q: q(x.q), status: q(x.status), kind: q(x.kind), worker: q(x.worker), sort: q(x.sort), order: q(x.order) }));
}));
r.post('/social-work/processes', asyncHandler(async (rq, res) => res.status(201).json(await sw.createProcess(processCreateSchema.parse(rq.body)))));
r.get('/social-work/processes/:id', asyncHandler(async (rq, res) => res.json(await sw.getProcess(idParam(rq)))));
r.put('/social-work/processes/:id', asyncHandler(async (rq, res) => res.json(await sw.updateProcess(idParam(rq), processUpdateSchema.parse(rq.body)))));
r.get('/social-work/processes/:id/events', asyncHandler(async (rq, res) => res.json(await sw.listEvents(idParam(rq)))));
r.get('/social-work/processes/:id/related', asyncHandler(async (rq, res) => res.json(await sw.getRelated(idParam(rq)))));
r.post('/social-work/processes/:id/activate', asyncHandler(async (rq, res) => res.json(await sw.activateProcess(idParam(rq)))));
r.post('/social-work/processes/:id/freeze', asyncHandler(async (rq, res) => res.json(await sw.freezeProcess(idParam(rq), noteOptSchema.parse(rq.body ?? {}).note))));
r.post('/social-work/processes/:id/unfreeze', asyncHandler(async (rq, res) => res.json(await sw.unfreezeProcess(idParam(rq)))));
r.post('/social-work/processes/:id/finish', asyncHandler(async (rq, res) => res.json(await sw.finishProcess(idParam(rq), finishSocialSchema.parse(rq.body)))));
r.post('/social-work/processes/:id/reopen', asyncHandler(async (rq, res) => res.json(await sw.reopenProcess(idParam(rq), noteOptSchema.parse(rq.body ?? {}).note))));
r.post('/social-work/processes/:id/link-treatment', asyncHandler(async (rq, res) => res.json(await sw.linkTreatment(idParam(rq), linkTreatmentSchema.parse(rq.body).treatmentId))));
r.delete('/social-work/processes/:id/link-treatment/:treatmentId', asyncHandler(async (rq, res) => res.json(await sw.unlinkTreatment(idParam(rq), idParam(rq, 'treatmentId')))));

r.get('/social-work/processes/:id/meetings', asyncHandler(async (rq, res) => res.json(await sw.listMeetings(idParam(rq)))));
r.post('/social-work/processes/:id/meetings', asyncHandler(async (rq, res) => res.status(201).json(await sw.addMeeting(idParam(rq), meetingSchema.parse(rq.body)))));
r.put('/social-work/meetings/:id', asyncHandler(async (rq, res) => res.json(await sw.updateMeeting(idParam(rq), meetingSchema.parse(rq.body)))));
r.get('/social-work/processes/:id/interventions', asyncHandler(async (rq, res) => res.json(await sw.listInterventions(idParam(rq)))));
r.post('/social-work/processes/:id/interventions', asyncHandler(async (rq, res) => res.status(201).json(await sw.addIntervention(idParam(rq), interventionSchema.parse(rq.body)))));
r.put('/social-work/interventions/:id', asyncHandler(async (rq, res) => res.json(await sw.updateIntervention(idParam(rq), interventionSchema.parse(rq.body)))));
r.get('/social-work/processes/:id/reports', asyncHandler(async (rq, res) => res.json(await sw.listReports(idParam(rq)))));
r.post('/social-work/processes/:id/reports', asyncHandler(async (rq, res) => res.status(201).json(await sw.addReport(idParam(rq), swReportSchema.parse(rq.body)))));
r.put('/social-work/reports/:id', asyncHandler(async (rq, res) => res.json(await sw.updateReport(idParam(rq), swReportSchema.parse(rq.body)))));

// ----- שילוב בכרטיס חבר ובכרטיס שפ"ח -----
r.get('/members/:id/service-requests', asyncHandler(async (rq, res) => res.json(await req.memberRequests(idParam(rq)))));
r.get('/members/:id/social-work', asyncHandler(async (rq, res) => res.json(await sw.memberProcesses(idParam(rq)))));
r.get('/treatments/:id/links', asyncHandler(async (rq, res) => res.json(await sw.treatmentLinks(idParam(rq)))));
