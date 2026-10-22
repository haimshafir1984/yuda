import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './errors';

export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const idParam = (req: Request, name = 'id'): number => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, 'VALIDATION', 'מזהה לא תקין');
  return n;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message === 'Required' ? 'שדה חובה' : issue.message;
    }
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'יש לתקן את השדות המסומנים', details: { fields } } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'הפעולה מתנגשת עם נתון קיים' } });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'בקשה לא תקינה' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'אירעה שגיאת שרת. נסו שוב מאוחר יותר' } });
}
