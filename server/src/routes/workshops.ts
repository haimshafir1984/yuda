import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as workshops from '../services/workshopService';
import * as regs from '../services/registrationService';
import {
  attendanceSchema,
  cancelSchema,
  questionSchema,
  registerSchema,
  sessionSchema,
  workshopCreateSchema,
  workshopUpdateSchema,
} from '../validation';

export const workshopsRouter = Router();

workshopsRouter.get(
  '/workshops',
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await workshops.listWorkshops({
        q: q.q as string | undefined,
        status: q.status as string | undefined,
        kind: q.kind as string | undefined,
        sort: q.sort as string | undefined,
        order: q.order as string | undefined,
      }),
    );
  }),
);

workshopsRouter.post(
  '/workshops',
  asyncHandler(async (req, res) => {
    res.status(201).json(await workshops.createWorkshop(workshopCreateSchema.parse(req.body)));
  }),
);

workshopsRouter.get('/workshops/:id', asyncHandler(async (req, res) => res.json(await workshops.getWorkshop(idParam(req)))));

workshopsRouter.put(
  '/workshops/:id',
  asyncHandler(async (req, res) => {
    res.json(await workshops.updateWorkshop(idParam(req), workshopUpdateSchema.parse(req.body)));
  }),
);

/** פרסום מדומה: משנה סטטוס בתוך המערכת בלבד */
workshopsRouter.post(
  '/workshops/:id/publish',
  asyncHandler(async (req, res) => {
    res.json(await workshops.updateWorkshop(idParam(req), { status: 'PUBLISHED' }));
  }),
);

// מפגשים
workshopsRouter.get('/workshops/:id/sessions', asyncHandler(async (req, res) => res.json(await workshops.listSessions(idParam(req)))));

workshopsRouter.post(
  '/workshops/:id/sessions',
  asyncHandler(async (req, res) => {
    await workshops.addSession(idParam(req), sessionSchema.parse(req.body));
    res.status(201).json(await workshops.listSessions(idParam(req)));
  }),
);

workshopsRouter.put(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const s = await workshops.updateSession(idParam(req), sessionSchema.parse(req.body));
    res.json(await workshops.listSessions(s.workshopId));
  }),
);

workshopsRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    await workshops.deleteSession(idParam(req));
    res.status(204).end();
  }),
);

// נוכחות
workshopsRouter.get('/sessions/:id/attendance', asyncHandler(async (req, res) => res.json(await regs.getSessionAttendance(idParam(req)))));

workshopsRouter.put(
  '/sessions/:id/attendance',
  asyncHandler(async (req, res) => {
    const body = attendanceSchema.parse(req.body);
    res.json(await regs.setAttendance(idParam(req), body.registrationId, body.status));
  }),
);

// שאלות הרשמה
workshopsRouter.get('/workshops/:id/questions', asyncHandler(async (req, res) => res.json(await workshops.listQuestions(idParam(req)))));

workshopsRouter.post(
  '/workshops/:id/questions',
  asyncHandler(async (req, res) => {
    res.status(201).json(await workshops.addQuestion(idParam(req), questionSchema.parse(req.body)));
  }),
);

workshopsRouter.put(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    res.json(await workshops.updateQuestion(idParam(req), questionSchema.parse(req.body)));
  }),
);

workshopsRouter.delete(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    await workshops.deleteQuestion(idParam(req));
    res.status(204).end();
  }),
);

// הרשמות
workshopsRouter.get(
  '/workshops/:id/registrations',
  asyncHandler(async (req, res) => {
    res.json(await regs.listWorkshopRegistrations(idParam(req), req.query.includeCancelled === 'true'));
  }),
);

workshopsRouter.post(
  '/workshops/:id/registrations',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const reg = await regs.registerMember(body.memberId, idParam(req), body.answers, { source: 'ADMIN' });
    res.status(201).json({ id: reg.id });
  }),
);

/** בדיקת הגבלות והתאמה לפני הצגת שאלות ההרשמה (ללא יצירת הרשמה) */
workshopsRouter.post(
  '/workshops/:id/registrations/check',
  asyncHandler(async (req, res) => {
    const { memberId } = registerSchema.pick({ memberId: true }).parse(req.body);
    await regs.precheckRegistration(memberId, idParam(req));
    res.json({ ok: true });
  }),
);

workshopsRouter.get('/registrations/:id', asyncHandler(async (req, res) => res.json(await regs.getRegistrationDetails(idParam(req)))));

workshopsRouter.post(
  '/registrations/:id/cancel',
  asyncHandler(async (req, res) => {
    await regs.cancelRegistration(idParam(req), cancelSchema.parse(req.body ?? {}).reason);
    res.json({ ok: true });
  }),
);
