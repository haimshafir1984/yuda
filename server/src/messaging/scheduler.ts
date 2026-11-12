import { prisma } from '../db';
import { syncWorkshopStatuses, localNowString } from '../services/workshopStatusSync';
import { retryFailedMessages } from './messageService';

export type JobHandler = (payload: any) => Promise<void>;
const handlers = new Map<string, JobHandler>();
export const registerJobHandler = (type: string, h: JobHandler) => void handlers.set(type, h);

export const MAX_JOB_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 5;

/** יוצר משימה מתוזמנת. עם dedupeKey קיים: לא יוצר כפילות, ומעדכן מועד אם המשימה עדיין ממתינה */
export async function scheduleJob(type: string, runAt: Date, payload: unknown, dedupeKey?: string) {
  if (dedupeKey) {
    const existing = await prisma.scheduledJob.findUnique({ where: { dedupeKey } });
    if (existing) {
      if (existing.status === 'PENDING') return prisma.scheduledJob.update({ where: { id: existing.id }, data: { runAt, payload: JSON.stringify(payload) } });
      return existing;
    }
  }
  return prisma.scheduledJob.create({ data: { type, runAt, payload: JSON.stringify(payload), dedupeKey } });
}

export async function cancelJob(dedupeKey: string) {
  await prisma.scheduledJob.updateMany({ where: { dedupeKey, status: 'PENDING' }, data: { status: 'CANCELLED' } });
}

/** מריץ משימות שמועדן הגיע. כישלון: ניסיון חוזר אחרי כמה דקות, ואחרי MAX_JOB_ATTEMPTS נכשלות סופית */
export async function runDueJobs(now: Date = new Date()) {
  const due = await prisma.scheduledJob.findMany({ where: { status: 'PENDING', runAt: { lte: now } }, orderBy: { runAt: 'asc' }, take: 100 });
  let done = 0;
  let failed = 0;
  for (const job of due) {
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`אין מטפל למשימה מסוג ${job.type}`);
      await handler(JSON.parse(job.payload));
      await prisma.scheduledJob.update({ where: { id: job.id }, data: { status: 'DONE', doneAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      done += 1;
    } catch (e) {
      const attempts = job.attempts + 1;
      const final = attempts >= MAX_JOB_ATTEMPTS;
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          attempts,
          lastError: e instanceof Error ? e.message : 'שגיאה',
          status: final ? 'FAILED' : 'PENDING',
          runAt: final ? job.runAt : new Date(now.getTime() + RETRY_DELAY_MIN * 60_000 * attempts),
        },
      });
      failed += 1;
    }
  }
  return { done, failed };
}

export async function listJobs(status?: string) {
  const rows = await prisma.scheduledJob.findMany({ where: status ? { status } : {}, orderBy: { runAt: 'desc' }, take: 100 });
  return rows.map((j) => ({ id: j.id, type: j.type, runAt: j.runAt.toISOString(), status: j.status, attempts: j.attempts, lastError: j.lastError, payload: JSON.parse(j.payload) }));
}

/** מחזור רקע אחד: סטטוסי סדנאות, משימות מתוזמנות וניסיון חוזר להודעות */
/** פעולות תקופתיות נוספות (למשל סריקת מועמדים) נרשמות כאן, כדי לא ליצור תלות מעגלית */
const tickHooks: ((now: Date) => Promise<unknown>)[] = [];
export const registerTickHook = (fn: (now: Date) => Promise<unknown>) => void tickHooks.push(fn);

export async function backgroundTick(now: Date = new Date()) {
  await syncWorkshopStatuses(localNowString(now));
  const jobs = await runDueJobs(now);
  const retried = await retryFailedMessages();
  for (const h of tickHooks) await h(now).catch(() => undefined);
  return { ...jobs, retried };
}

/** מפעיל את המחזור בעלייה ואחת לדקה. לא רץ בבדיקות האוטומטיות */
export function startScheduler() {
  if (process.env.VITEST) return;
  const run = () => backgroundTick().catch(() => undefined); // ללא פירוט שגיאה בלוג
  void run();
  setInterval(run, 60_000).unref();
}
