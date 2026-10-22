import { Router } from 'express';
import { asyncHandler, idParam } from '../http';
import * as members from '../services/memberService';
import { memberSchema, preferencesSchema, restrictionSchema } from '../validation';

export const membersRouter = Router();

membersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await members.listMembers({
        q: q.q as string | undefined,
        gender: q.gender as string | undefined,
        nationalInsurance: q.nationalInsurance as string | undefined,
        sort: q.sort as string | undefined,
        order: q.order as string | undefined,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      }),
    );
  }),
);

membersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await members.createMember(memberSchema.parse(req.body)));
  }),
);

membersRouter.get('/:id', asyncHandler(async (req, res) => res.json(await members.getMember(idParam(req)))));

membersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await members.updateMember(idParam(req), memberSchema.parse(req.body)));
  }),
);

membersRouter.patch(
  '/:id/preferences',
  asyncHandler(async (req, res) => {
    res.json(await members.updatePreferences(idParam(req), preferencesSchema.parse(req.body).preferredChannel));
  }),
);

membersRouter.get('/:id/activity', asyncHandler(async (req, res) => res.json(await members.memberActivity(idParam(req)))));
membersRouter.get('/:id/session-attendance', asyncHandler(async (req, res) => res.json(await members.memberSessionAttendance(idParam(req)))));
membersRouter.get('/:id/exceptions', asyncHandler(async (req, res) => res.json(await members.memberExceptions(idParam(req)))));

membersRouter.get('/:id/restrictions', asyncHandler(async (req, res) => res.json(await members.listRestrictions(idParam(req)))));

membersRouter.post(
  '/:id/restrictions',
  asyncHandler(async (req, res) => {
    const body = restrictionSchema.parse(req.body);
    await members.addRestriction(idParam(req), body.workshopId, body.reason);
    res.status(201).json(await members.listRestrictions(idParam(req)));
  }),
);

membersRouter.delete(
  '/:id/restrictions/:restrictionId',
  asyncHandler(async (req, res) => {
    await members.removeRestriction(idParam(req), Number(req.params.restrictionId));
    res.json(await members.listRestrictions(idParam(req)));
  }),
);
