import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as svc from '../services/treatmentService';
import {
  assignSchema, changeTherapistSchema, exceptionSchema, extensionSchema, finishSchema, freezeSchema, noteSchema, pauseSchema,
  paymentSchema, reportSchema, socialReportSchema, taskDoneSchema, taskSchema, therapistSchema, treatmentCreateSchema, treatmentMeetingSchema, treatmentUpdateSchema,
} from '../treatmentValidation';

export const treatmentsRouter = Router();
const r = treatmentsRouter;

// מטפלים
r.get('/therapists', asyncHandler(async (req, res) => res.json(await svc.listTherapists(req.query.activeOnly === 'true'))));
r.post('/therapists', asyncHandler(async (req, res) => res.status(201).json(await svc.createTherapist(therapistSchema.parse(req.body)))));
r.put('/therapists/:id', asyncHandler(async (req, res) => res.json(await svc.updateTherapist(idParam(req), therapistSchema.parse(req.body)))));
r.get('/treatment-meta', asyncHandler(async (_req, res) => res.json({ socialWorkers: svc.SOCIAL_WORKERS })));

// תהליכי שפ"ח
r.get(
  '/treatments',
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(await svc.listTreatments({ q: q.q as string, status: q.status as string, track: q.track as string, sort: q.sort as string, order: q.order as string }));
  }),
);
r.post('/treatments', asyncHandler(async (req, res) => res.status(201).json(await svc.createTreatment(treatmentCreateSchema.parse(req.body)))));
r.get('/treatments/:id', asyncHandler(async (req, res) => res.json(await svc.getTreatment(idParam(req)))));
r.put('/treatments/:id', asyncHandler(async (req, res) => res.json(await svc.updateTreatment(idParam(req), treatmentUpdateSchema.parse(req.body)))));

r.get('/treatments/:id/timeline', asyncHandler(async (req, res) => res.json(await svc.getTimeline(idParam(req)))));
r.get('/treatments/:id/events', asyncHandler(async (req, res) => res.json(await svc.getEvents(idParam(req)))));
r.get('/treatments/:id/history', asyncHandler(async (req, res) => res.json(await svc.getHistory(idParam(req)))));

// פעולות
r.post('/treatments/:id/assign-therapist', asyncHandler(async (req, res) => res.json(await svc.assignTherapist(idParam(req), assignSchema.parse(req.body)))));
r.post('/treatments/:id/change-therapist', asyncHandler(async (req, res) => res.json(await svc.changeTherapist(idParam(req), changeTherapistSchema.parse(req.body)))));
r.post('/treatments/:id/sign-demo', asyncHandler(async (req, res) => res.json(await svc.signDemo(idParam(req)))));
r.post('/treatments/:id/pause', asyncHandler(async (req, res) => res.json(await svc.pauseTreatment(idParam(req), pauseSchema.parse(req.body)))));
r.post('/treatments/:id/resume', asyncHandler(async (req, res) => res.json(await svc.resumeTreatment(idParam(req)))));
r.post('/treatments/:id/freeze', asyncHandler(async (req, res) => res.json(await svc.freezeTreatment(idParam(req), freezeSchema.parse(req.body)))));
r.post('/treatments/:id/unfreeze', asyncHandler(async (req, res) => res.json(await svc.unfreezeTreatment(idParam(req)))));
r.post('/treatments/:id/finish', asyncHandler(async (req, res) => res.json(await svc.finishTreatment(idParam(req), finishSchema.parse(req.body)))));
r.post('/treatments/:id/extensions', asyncHandler(async (req, res) => res.status(201).json(await svc.addExtension(idParam(req), extensionSchema.parse(req.body)))));
r.post('/treatments/:id/notes', asyncHandler(async (req, res) => res.status(201).json(await svc.addNote(idParam(req), noteSchema.parse(req.body)))));
r.post('/treatments/:id/exceptions', asyncHandler(async (req, res) => res.status(201).json(await svc.addException(idParam(req), exceptionSchema.parse(req.body)))));

// דיווחים חודשיים
r.post('/treatments/:id/reports', asyncHandler(async (req, res) => res.status(201).json(await svc.createReport(idParam(req), reportSchema.parse(req.body)))));
r.put('/treatment-reports/:id', asyncHandler(async (req, res) => res.json(await svc.updateReport(idParam(req), reportSchema.parse(req.body)))));
r.delete('/treatment-reports/:id', asyncHandler(async (req, res) => { await svc.deleteReport(idParam(req)); res.status(204).end(); }));
r.post('/treatment-reports/:id/submit', asyncHandler(async (req, res) => res.json(await svc.submitReport(idParam(req)))));
r.post('/treatment-reports/:id/approve', asyncHandler(async (req, res) => res.json(await svc.approveReport(idParam(req)))));
r.patch('/treatment-reports/:id/payment', asyncHandler(async (req, res) => res.json(await svc.setPayment(idParam(req), paymentSchema.parse(req.body)))));

// דוחות עו"סית
r.get('/treatments/:id/social-reports', asyncHandler(async (req, res) => res.json(await svc.listSocialReports(idParam(req)))));
r.post('/treatments/:id/social-reports', asyncHandler(async (req, res) => res.status(201).json(await svc.createSocialReport(idParam(req), socialReportSchema.parse(req.body)))));
r.put('/social-reports/:id', asyncHandler(async (req, res) => res.json(await svc.updateSocialReport(idParam(req), socialReportSchema.parse(req.body)))));

// שילוב בכרטיס החבר
r.get('/members/:id/treatments', asyncHandler(async (req, res) => res.json(await svc.memberTreatments(idParam(req)))));
r.get('/members/:id/treatment-copay', asyncHandler(async (req, res) => res.json(await svc.memberCopay(idParam(req)))));
r.get('/members/:id/treatment-exceptions', asyncHandler(async (req, res) => res.json(await svc.memberTreatmentExceptions(idParam(req)))));

// חתימת הארכה (הדגמה), פגישות עם המטופל ומשימות לעו"סית
r.post('/treatments/:id/extensions/:extensionId/sign', asyncHandler(async (req, res) => res.json(await svc.signExtension(idParam(req), idParam(req, 'extensionId')))));
r.get('/treatments/:id/meetings', asyncHandler(async (req, res) => res.json(await svc.listTreatmentMeetings(idParam(req)))));
r.post('/treatments/:id/meetings', asyncHandler(async (req, res) => res.status(201).json(await svc.addTreatmentMeeting(idParam(req), treatmentMeetingSchema.parse(req.body)))));
r.get('/treatments/:id/tasks', asyncHandler(async (req, res) => res.json(await svc.listTasks(idParam(req)))));
r.post('/treatments/:id/tasks', asyncHandler(async (req, res) => res.status(201).json(await svc.addTask(idParam(req), taskSchema.parse(req.body)))));
r.patch('/treatment-tasks/:id', asyncHandler(async (req, res) => res.json(await svc.setTaskDone(idParam(req), taskDoneSchema.parse(req.body).done))));
