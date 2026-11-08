import { ensureUsersOnStartup } from './auth/users';
import { createApp } from './app';
import { ensureDefaultTemplates } from './messaging/templates';
import { startScheduler } from './messaging/scheduler';
import './messaging/workshopMessages';

const port = Number(process.env.SERVER_PORT ?? 3001);
// האזנה מקומית בלבד כברירת מחדל (מידע טיפולי רגיש). סביבת Render מגדירה RENDER ולכן מאזינה לכל הממשקים.
const host = process.env.HOST ?? (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');

async function main() {
  // מסד חדש בלי משתמשים: יוצרים את משתמשי ההדגמה, כדי שתמיד אפשר להיכנס
  await ensureUsersOnStartup().catch(() => undefined);
  await ensureDefaultTemplates().catch(() => undefined);
  createApp().listen(port, host, () => {
    console.log(`CRM server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    startScheduler();
  });
}
void main();
