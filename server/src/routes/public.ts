import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as pub from '../services/publicService';
import * as intake from '../intake/intakeService';
import { questionnaireSchema } from '../intake/questionnaire';
import { publicPhoneSchema, publicRegisterSchema } from '../validation';

export const publicRouter = Router();

publicRouter.get('/workshops/:id', asyncHandler(async (req, res) => res.json(await pub.getPublicWorkshop(idParam(req)))));

publicRouter.post(
  '/workshops/:id/check',
  asyncHandler(async (req, res) => {
    res.json(await pub.publicCheck(idParam(req), publicPhoneSchema.parse(req.body).phone));
  }),
);

publicRouter.post(
  '/workshops/:id/register',
  asyncHandler(async (req, res) => {
    const body = publicRegisterSchema.parse(req.body);
    res.status(201).json(await pub.publicRegister(idParam(req), body.phone, body.answers));
  }),
);

// ----- קבלת חברים: טופס הצטרפות, תגובה להזמנה ושאלון היכרות (קישורים אישיים, בלי כניסת צוות) -----
publicRouter.post('/join', asyncHandler(async (req, res) => {
  const r = await intake.submitJoin(intake.joinSchema.parse(req.body));
  res.status(201).json({ ok: true, id: r.id }); // לא מחזירים את תוצאת הסינון למגיש
}));
publicRouter.get('/invitations/:token', asyncHandler(async (req, res) => res.json(await intake.getInvitation(String(req.params.token)))));
publicRouter.post('/invitations/:token/respond', asyncHandler(async (req, res) => res.json(await intake.respondInvitation(String(req.params.token), intake.respondSchema.parse(req.body)))));
publicRouter.get('/questionnaires/:token', asyncHandler(async (req, res) => res.json(await intake.getQuestionnaire(String(req.params.token)))));
publicRouter.post('/questionnaires/:token', asyncHandler(async (req, res) => res.json(await intake.submitQuestionnaire(String(req.params.token), questionnaireSchema.parse(req.body)))));
