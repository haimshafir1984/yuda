import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { AppError } from '../errors';
import { AuthUser, currentUser, runWithUser } from './context';
import { AREA_LABEL, LEVEL, MATRIX, REQUEST_SCOPE, areaOfPath, isRole, requiredLevel } from './permissions';

export const COOKIE_NAME = 'crm_user';

const readCookie = (req: Request, name: string): string | undefined => {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
};

const authDisabled = () => process.env.AUTH_DISABLED === '1';

/** מזהה את המשתמש מ-cookie (או מכותרת x-demo-user, לבדיקות וכלים) ומפעיל את שאר הבקשה בהקשר שלו */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = (req.headers['x-demo-user'] as string | undefined) ?? readCookie(req, COOKIE_NAME);
    const id = raw ? Number(raw) : NaN;
    let user: AuthUser | null = null;
    if (Number.isInteger(id) && id > 0) {
      const row = await prisma.appUser.findUnique({ where: { id } });
      if (row && row.active && isRole(row.role)) user = { id: row.id, name: row.name, role: row.role };
    }
    if (!user && authDisabled()) user = { id: 0, name: '', role: 'GENERAL_MANAGER', synthetic: true };
    runWithUser(user, () => next());
  } catch (e) {
    next(e);
  }
}

// ---------- בעלות: "רואה הכל, עורכת את שלה" ----------

interface Owner {
  owner: string | null; // שם העובד המשויך, או null אם לא משויך
  requestType?: string;
}

const OWNER_LOADERS: { re: RegExp; load: (id: number) => Promise<Owner | null> }[] = [
  { re: /^\/service-requests\/(\d+)/, load: async (id) => { const r = await prisma.serviceRequest.findUnique({ where: { id } }); return r && { owner: r.assignee, requestType: r.type }; } },
  { re: /^\/social-work\/processes\/(\d+)/, load: async (id) => { const p = await prisma.socialWorkProcess.findUnique({ where: { id } }); return p && { owner: p.socialWorker }; } },
  { re: /^\/social-work\/meetings\/(\d+)/, load: async (id) => { const m = await prisma.socialWorkMeeting.findUnique({ where: { id }, include: { process: true } }); return m && { owner: m.process.socialWorker }; } },
  { re: /^\/social-work\/interventions\/(\d+)/, load: async (id) => { const m = await prisma.socialWorkIntervention.findUnique({ where: { id }, include: { process: true } }); return m && { owner: m.process.socialWorker }; } },
  { re: /^\/social-work\/reports\/(\d+)/, load: async (id) => { const m = await prisma.socialWorkReport.findUnique({ where: { id }, include: { process: true } }); return m && { owner: m.process.socialWorker }; } },
  { re: /^\/treatments\/(\d+)/, load: async (id) => { const t = await prisma.psychologicalTreatment.findUnique({ where: { id } }); return t && { owner: t.socialWorker }; } },
  { re: /^\/treatment-reports\/(\d+)/, load: async (id) => { const r = await prisma.treatmentMonthlyReport.findUnique({ where: { id }, include: { treatment: true } }); return r && { owner: r.treatment.socialWorker }; } },
  { re: /^\/treatment-tasks\/(\d+)/, load: async (id) => { const t = await prisma.treatmentTask.findUnique({ where: { id }, include: { treatment: true } }); return t && { owner: t.treatment.socialWorker }; } },
  { re: /^\/social-reports\/(\d+)/, load: async (id) => { const r = await prisma.treatmentSocialWorkerReport.findUnique({ where: { id }, include: { treatment: true } }); return r && { owner: r.treatment.socialWorker }; } },
];

async function loadOwner(path: string): Promise<Owner | null> {
  for (const { re, load } of OWNER_LOADERS) {
    const m = re.exec(path);
    if (m) return load(Number(m[1]));
  }
  return null;
}

/**
 * אכיפת הרשאות על כל נתיבי ה-API (חוץ מכניסה, דף החבר והרישום הציבורי):
 * 1. חייב משתמש מזוהה. 2. רמת ההרשאה של התפקיד באזור (צפייה, עריכה, ניהול).
 * 3. אחות ומגשר: רק פניות מהקטגוריה שלהם. 4. עו"סית: עריכה רק ברשומות המשויכות אליה או שאינן משויכות.
 */
export async function requireAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = currentUser();
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'יש להיכנס למערכת');

    const area = areaOfPath(req.path);
    if (area === null) throw new AppError(404, 'NOT_FOUND', 'הנתיב לא נמצא');
    if (area === 'staff') return next();

    const level = MATRIX[user.role][area];
    const needed = requiredLevel(req.method, req.path);
    if (level < needed)
      throw new AppError(403, 'FORBIDDEN', needed === LEVEL.VIEW ? `אין לך הרשאה לצפות באזור "${AREA_LABEL[area]}"` : `אין לך הרשאה לבצע שינויים באזור "${AREA_LABEL[area]}" (נדרשת הרשאת ${needed === LEVEL.MANAGE ? 'ניהול' : 'עריכה'})`);

    // אחות ומגשר: גישה לפניות מהקטגוריה שלהם בלבד
    const scope = REQUEST_SCOPE[user.role];
    if (area === 'requests' && scope) {
      if (req.method === 'POST' && req.path === '/service-requests') {
        if (req.body?.type !== scope) throw new AppError(403, 'FORBIDDEN', 'אפשר לפתוח רק פניות מהקטגוריה שלך');
      } else {
        const found = await loadOwner(req.path);
        if (found && found.requestType !== scope) throw new AppError(403, 'FORBIDDEN', 'אין לך הרשאה לפנייה מקטגוריה זו');
      }
    }

    // עו"סית: רואה הכל, עורכת רק את שלה
    if (user.role === 'SOCIAL_WORKER' && needed >= LEVEL.EDIT) {
      const found = await loadOwner(req.path);
      if (found && found.owner && found.owner !== user.name)
        throw new AppError(403, 'NOT_OWNER', `הרשומה משויכת ל${found.owner}. אפשר לערוך רק רשומות המשויכות אליך או שאינן משויכות`);
    }
    next();
  } catch (e) {
    next(e);
  }
}
