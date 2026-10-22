import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as pub from '../services/publicService';
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
