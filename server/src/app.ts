import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { errorHandler } from './http';
import { membersRouter } from './routes/members';
import { publicRouter } from './routes/public';
import { socialRouter } from './routes/social';
import { treatmentsRouter } from './routes/treatments';
import { workshopsRouter } from './routes/workshops';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/members', membersRouter);
  app.use('/api/public', publicRouter);
  app.use('/api', workshopsRouter);
  app.use('/api', treatmentsRouter);
  app.use('/api', socialRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'הנתיב לא נמצא' } }));

  // הגשת הלקוח הבנוי (npm start) מאותו שרת
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
