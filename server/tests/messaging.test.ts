import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { addDays, todayDateOnly } from '../src/lib/dates';
import { sendToMember } from '../src/messaging/messageService';
import { demoProvider, setProvider } from '../src/messaging/provider';
import { backgroundTick, runDueJobs, scheduleJob } from '../src/messaging/scheduler';
import { ensureDefaultTemplates, renderText } from '../src/messaging/templates';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
let seq = 0;

const mkMember = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/members').send({ firstName: 'דנה', lastName: `הודעה${seq}`, phone: `054-70000${String(seq).padStart(2, '0')}`, gender: 'FEMALE', birthYear: 1960, ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number };
};
const mkPublished = async (days = 10) => {
  seq += 1;
  const w = await api().post('/api/workshops').send({ kind: 'WORKSHOP', name: `סדנת הודעות ${seq}`, format: 'SINGLE', startDate: addDays(todayDateOnly(), days), startTime: '10:00', endTime: '12:00' });
  await api().post(`/api/workshops/${w.body.id}/publish`);
  return w.body as { id: number };
};

beforeEach(async () => {
  await resetDb();
  await ensureDefaultTemplates();
  setProvider(demoProvider);
});
afterEach(() => setProvider(demoProvider));

describe('מנוע הודעות', () => {
  it('מחליף משתנים בתבנית, ומשתנה לא ידוע נשאר ריק', () => {
    expect(renderText('שלום {{שם}} {{לא קיים}}!', { שם: 'דנה' })).toBe('שלום דנה !');
  });

  it('הרשמה שולחת אישור בערוץ המועדף (SMS) ומתזמנת תזכורת', async () => {
    const m = await mkMember();
    const w = await mkPublished();
    expect((await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id })).status).toBe(201);
    const out = await prisma.outboxMessage.findMany({ where: { memberId: m.id } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: 'SMS', templateKey: 'registration.confirmed', status: 'SENT', attempts: 1 });
    expect(out[0].body).toContain('דנה');
    expect(out[0].body).toContain('סדנת הודעות');
    const jobs = await prisma.scheduledJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: 'workshop.reminder', status: 'PENDING' });
  });

  it('ערוץ מייל בלי כתובת: ההודעה נרשמת כדולגה עם סיבה, ולא נכשלת', async () => {
    const m = await mkMember({ preferredChannel: 'EMAIL' });
    await sendToMember({ memberId: m.id, templateKey: 'registration.confirmed', vars: { פעילות: 'x', תאריך: '', שעה: '' } });
    const out = await prisma.outboxMessage.findFirst({ where: { memberId: m.id } });
    expect(out).toMatchObject({ channel: 'EMAIL', status: 'SKIPPED' });
    expect(out?.error).toContain('מייל');
  });

  it('תבנית כבויה: לא נשלחת הודעה', async () => {
    const m = await mkMember();
    await prisma.messageTemplate.update({ where: { key: 'registration.confirmed' }, data: { active: false } });
    const r = await sendToMember({ memberId: m.id, templateKey: 'registration.confirmed', vars: {} });
    expect(r).toBeNull();
    expect(await prisma.outboxMessage.count()).toBe(0);
  });

  it('כשל ספק נשמר, והניסיון החוזר מצליח', async () => {
    const m = await mkMember();
    let fail = true;
    setProvider({ name: 'flaky', send: async () => { if (fail) throw new Error('ספק לא זמין'); } });
    await sendToMember({ memberId: m.id, templateKey: 'registration.confirmed', vars: {} });
    let row = await prisma.outboxMessage.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1, error: 'ספק לא זמין' });
    fail = false;
    await backgroundTick();
    row = await prisma.outboxMessage.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('כשל בשליחה לא מפיל הרשמה', async () => {
    const m = await mkMember();
    const w = await mkPublished();
    setProvider({ name: 'down', send: async () => { throw new Error('נפל'); } });
    expect((await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id })).status).toBe(201);
    expect((await prisma.outboxMessage.findFirstOrThrow()).status).toBe('FAILED');
  });
});

describe('מתזמן', () => {
  it('תזכורת רצה במועדה, פעם אחת בלבד', async () => {
    const m = await mkMember();
    const w = await mkPublished(5);
    await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id });
    const job = await prisma.scheduledJob.findFirstOrThrow();
    expect((await runDueJobs(new Date())).done).toBe(0); // עוד לא הגיע הזמן
    await runDueJobs(new Date(job.runAt.getTime() + 1000));
    await runDueJobs(new Date(job.runAt.getTime() + 2000));
    const reminders = await prisma.outboxMessage.findMany({ where: { templateKey: 'workshop.reminder' } });
    expect(reminders).toHaveLength(1);
    expect((await prisma.scheduledJob.findFirstOrThrow()).status).toBe('DONE');
  });

  it('ביטול הרשמה מבטל את התזכורת ושולח הודעת ביטול', async () => {
    const m = await mkMember();
    const w = await mkPublished(5);
    const reg = await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id });
    await api().post(`/api/registrations/${reg.body.id}/cancel`).send({});
    expect((await prisma.scheduledJob.findFirstOrThrow()).status).toBe('CANCELLED');
    expect(await prisma.outboxMessage.count({ where: { templateKey: 'registration.cancelled' } })).toBe(1);
    await runDueJobs(new Date(Date.now() + 30 * 86_400_000));
    expect(await prisma.outboxMessage.count({ where: { templateKey: 'workshop.reminder' } })).toBe(0);
  });

  it('משימה שנכשלת מנסה שוב, ואחרי 3 ניסיונות נכשלת סופית', async () => {
    await scheduleJob('unknown.type', new Date(Date.now() - 1000), {}, 'k1');
    let now = new Date();
    for (let i = 0; i < 3; i++) {
      await runDueJobs(now);
      now = new Date(now.getTime() + 60 * 60_000);
    }
    const j = await prisma.scheduledJob.findFirstOrThrow();
    expect(j).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(j.lastError).toContain('unknown.type');
  });

  it('אותו מפתח כפילות לא יוצר משימה שנייה', async () => {
    await scheduleJob('x', new Date(Date.now() + 1000), {}, 'dup');
    await scheduleJob('x', new Date(Date.now() + 2000), {}, 'dup');
    expect(await prisma.scheduledJob.count()).toBe(1);
  });
});

describe('ממשק ניהול', () => {
  it('עריכת תבנית, תיבת יוצאות ושליחה חוזרת', async () => {
    const t = (await api().get('/api/messages/templates')).body;
    expect(t.length).toBeGreaterThanOrEqual(3);
    const upd = await api().put(`/api/messages/templates/${t[0].id}`).send({ body: 'שלום {{שם}}, מחכים לך!' });
    expect(upd.body.body).toContain('מחכים');
    expect((await api().put(`/api/messages/templates/${t[0].id}`).send({ body: '  ' })).status).toBe(400);

    const m = await mkMember();
    setProvider({ name: 'down', send: async () => { throw new Error('נפל'); } });
    await sendToMember({ memberId: m.id, templateKey: 'registration.confirmed', vars: {} });
    setProvider(demoProvider);
    const out = (await api().get('/api/messages/outbox?status=FAILED')).body;
    expect(out).toHaveLength(1);
    expect((await api().post(`/api/messages/outbox/${out[0].id}/resend`)).body.status).toBe('SENT');
  });
});
