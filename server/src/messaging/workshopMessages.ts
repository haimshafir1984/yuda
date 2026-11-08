import { prisma } from '../db';
import { sendToMember } from './messageService';
import { cancelJob, registerJobHandler, scheduleJob } from './scheduler';

const REMINDER_HOURS_BEFORE = 24;
const reminderKey = (registrationId: number) => `reminder:registration:${registrationId}`;
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/** מועד התחלה (שעה מקומית של השרת) של מפגש. בלי שעה: 09:00 */
const sessionStart = (date: Date, startTime: string | null) => {
  const [h, m] = (startTime ?? '09:00').split(':').map(Number);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h || 0, m || 0);
};

async function context(registrationId: number) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { workshop: { include: { sessions: { orderBy: { date: 'asc' } } } } },
  });
  if (!reg) return null;
  const now = new Date();
  const upcoming = reg.workshop.sessions.find((s) => sessionStart(s.date, s.startTime) > now) ?? reg.workshop.sessions[0];
  const vars = {
    פעילות: reg.workshop.name,
    תאריך: upcoming ? fmtDate(upcoming.date) : 'יימסר בהמשך',
    שעה: upcoming?.startTime ?? '',
  };
  return { reg, vars, start: upcoming ? sessionStart(upcoming.date, upcoming.startTime) : null };
}

/** אישור הרשמה מיידי + תזכורת 24 שעות לפני המפגש הקרוב. כשל בהודעות לא מפיל את ההרשמה */
export async function afterRegistration(registrationId: number) {
  try {
    const c = await context(registrationId);
    if (!c) return;
    await sendToMember({ memberId: c.reg.memberId, templateKey: 'registration.confirmed', vars: c.vars, related: { type: 'REGISTRATION', id: registrationId } });
    if (c.start) {
      const runAt = new Date(c.start.getTime() - REMINDER_HOURS_BEFORE * 3_600_000);
      if (runAt > new Date()) await scheduleJob('workshop.reminder', runAt, { registrationId }, reminderKey(registrationId));
    }
  } catch {
    /* ההרשמה כבר נשמרה. הכשל נראה בתיבת היוצאות או במשימות */
  }
}

export async function afterCancellation(registrationId: number) {
  try {
    await cancelJob(reminderKey(registrationId));
    const c = await context(registrationId);
    if (!c) return;
    await sendToMember({ memberId: c.reg.memberId, templateKey: 'registration.cancelled', vars: c.vars, related: { type: 'REGISTRATION', id: registrationId } });
  } catch {
    /* ראו הערה למעלה */
  }
}

registerJobHandler('workshop.reminder', async ({ registrationId }: { registrationId: number }) => {
  const c = await context(registrationId);
  if (!c || c.reg.status !== 'ACTIVE') return; // בוטלה בינתיים
  if (c.reg.workshop.status === 'CANCELLED' || c.reg.workshop.status === 'FINISHED') return;
  await sendToMember({ memberId: c.reg.memberId, templateKey: 'workshop.reminder', vars: c.vars, related: { type: 'REGISTRATION', id: registrationId } });
});
