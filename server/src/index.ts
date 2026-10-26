import { createApp } from './app';
import { startWorkshopStatusSync } from './services/workshopStatusSync';

const port = Number(process.env.SERVER_PORT ?? 3001);
// האזנה מקומית בלבד כברירת מחדל (מידע טיפולי רגיש). סביבת Render מגדירה RENDER ולכן מאזינה לכל הממשקים.
const host = process.env.HOST ?? (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
createApp().listen(port, host, () => {
  console.log(`CRM server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  startWorkshopStatusSync();
});
