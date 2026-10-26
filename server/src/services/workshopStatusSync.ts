import { prisma } from '../db';

const pad = (n: number) => String(n).padStart(2, '0');

/** שעה מקומית של השרת, בפורמט YYYY-MM-DDTHH:mm. מועדי המפגשים נשמרים כמועדים מקומיים ללא אזור זמן */
export const localNowString = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * מעברי סטטוס אוטומטיים לפי מסמך הדרישות:
 * מפורסם -> מתקיים כעת בשעת תחילת המפגש הראשון; מתקיים כעת/מפורסם -> הסתיים אחרי סיום המפגש האחרון.
 * טיוטה ובוטל לא משתנים אוטומטית. עם סימון "סגירה אוטומטית של הרישום" הרישום נסגר בתחילת הסדנה.
 * המעבר הידני עדיין אפשרי בכל עת.
 */
export async function syncWorkshopStatuses(now: string = localNowString()) {
  const rows = await prisma.workshop.findMany({
    where: { status: { in: ['PUBLISHED', 'ONGOING'] } },
    include: { sessions: { orderBy: { date: 'asc' } } },
  });
  let started = 0;
  let finished = 0;
  for (const w of rows) {
    if (!w.sessions.length) continue;
    const first = w.sessions[0];
    const last = w.sessions[w.sessions.length - 1];
    const startsAt = `${first.date.toISOString().slice(0, 10)}T${first.startTime ?? '00:00'}`;
    const endsAt = `${last.date.toISOString().slice(0, 10)}T${last.endTime ?? last.startTime ?? '23:59'}`;
    // בלי שעת סיום ידועה, הפעילות נחשבת כמסתיימת בסוף אותו יום
    const endsAtEffective = last.endTime ? endsAt : `${last.date.toISOString().slice(0, 10)}T23:59`;

    if (now > endsAtEffective) {
      await prisma.workshop.update({ where: { id: w.id }, data: { status: 'FINISHED' } });
      finished += 1;
    } else if (w.status === 'PUBLISHED' && now >= startsAt) {
      await prisma.workshop.update({
        where: { id: w.id },
        data: { status: 'ONGOING', ...(w.autoCloseRegistration ? { registrationOpen: false } : {}) },
      });
      started += 1;
    }
  }
  return { started, finished };
}

/** מפעיל בדיקה בעלייה ואחת לדקה. לא רץ בבדיקות האוטומטיות */
export function startWorkshopStatusSync() {
  if (process.env.VITEST) return;
  const run = () => syncWorkshopStatuses().catch(() => undefined); // ללא פירוט שגיאה בלוג
  void run();
  setInterval(run, 60_000).unref();
}
