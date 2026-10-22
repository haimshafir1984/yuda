import { createApp } from './app';

const port = Number(process.env.SERVER_PORT ?? 3001);
createApp().listen(port, () => {
  console.log(`CRM server listening on http://localhost:${port}`);
});
