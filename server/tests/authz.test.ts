import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { ensureDefaultUsers } from '../src/auth/users';
import { prisma } from '../src/db';
import { addDays, todayDateOnly } from '../src/lib/dates';
import { resetDb } from './helpers';

const app = createApp();
const NAMES = {
  manager: 'דוד ברוך', lead: 'אורית לביא', ronit: 'רונית כץ', shira: 'שירה אדלר', nurse: 'חוה גולן', mediator: 'אילן שדה', workshop: 'מיכל אורן', coordinator: 'אייל נחום',
} as const;
type Who = keyof typeof NAMES;
let ids: Record<string, number> = {};
let seq = 0;

/** בקשה בשם משתמש הדגמה (כמו כניסה מהמסך) */
const as = (who: Who) => {
  const h = { 'x-demo-user': String(ids[NAMES[who]]) };
  return {
    get: (p: string) => request(app).get(p).set(h),
    post: (p: string, body: unknown = {}) => request(app).post(p).set(h).send(body as object),
    put: (p: string, body: unknown = {}) => request(app).put(p).set(h).send(body as object),
    patch: (p: string, body: unknown = {}) => request(app).patch(p).set(h).send(body as object),
  };
};

beforeAll(() => { process.env.AUTH_DISABLED = '0'; });
afterAll(() => { process.env.AUTH_DISABLED = '1'; });
beforeEach(async () => {
  await resetDb();
  await ensureDefaultUsers();
  ids = Object.fromEntries((await prisma.appUser.findMany()).map((u) => [u.name, u.id]));
});

const mkMember = async () => {
  seq += 1;
  return (await as('manager').post('/api/members', { firstName: 'חבר', lastName: `הרשאה${seq}`, phone: `050-61000${String(seq).padStart(2, '0')}` })).body as { id: number; phone: string };
};
const mkRequest = async (type: string, assignee?: string) => {
  const m = await mkMember();
  const r = await as('manager').post('/api/service-requests', { memberId: m.id, type, subject: `פנייה ${++seq}`, assignee });
  expect(r.status).toBe(201);
  return r.body as { id: number; assignee: string | null; memberId: number };
};

describe('כניסה בלי סיסמה', () => {
  it('בלי משתמש מקבלים 401, והרשימה הציבורית של משתמשי ההדגמה פתוחה', async () => {
    const res = await request(app).get('/api/members');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    const users = await request(app).get('/api/auth/demo-users');
    expect(users.status).toBe(200);
    expect(users.body).toHaveLength(9);
    expect(users.body.find((u: { name: string }) => u.name === NAMES.ronit).roleLabel).toBe('עו"סית');
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('כניסה עם cookie, מי אני, והתנתקות', async () => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ userId: 99999 })).status).toBe(404);
    const login = await agent.post('/api/auth/login').send({ userId: ids[NAMES.nurse] });
    expect(login.body.user).toMatchObject({ name: NAMES.nurse, role: 'NURSE', roleLabel: 'אחות' });
    expect(login.body.permissions).toMatchObject({ members: 1, workshops: 0, requests: 2 });
    expect((await agent.get('/api/members')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.name).toBe(NAMES.nurse);
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/members')).status).toBe(401);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  it('הרשמה ציבורית ודף החבר לא דורשים משתמש', async () => {
    expect((await request(app).get('/api/public/workshops/1')).status).toBe(404); // לא נחסם ב-401
    expect((await request(app).post('/api/me/lookup').send({ phone: '0500000000' })).status).toBe(404);
  });

  it('ensureDefaultUsers בטוח להרצה חוזרת', async () => {
    expect(await ensureDefaultUsers()).toBe(0);
    expect(await prisma.appUser.count()).toBe(9);
  });
});

describe('מטריצת הרשאות לפי תפקיד', () => {
  const GET_PATHS = { members: '/api/members', workshops: '/api/workshops', treatments: '/api/treatments', requests: '/api/service-requests', socialWork: '/api/social-work/processes' } as const;
  // צפייה: 200 או 403, לפי המטריצה שאושרה
  const EXPECT_VIEW: Record<Who, Record<keyof typeof GET_PATHS, boolean>> = {
    manager: { members: true, workshops: true, treatments: true, requests: true, socialWork: true },
    lead: { members: true, workshops: true, treatments: true, requests: true, socialWork: true },
    ronit: { members: true, workshops: true, treatments: true, requests: true, socialWork: true },
    shira: { members: true, workshops: true, treatments: true, requests: true, socialWork: true },
    nurse: { members: true, workshops: false, treatments: false, requests: true, socialWork: false },
    mediator: { members: true, workshops: false, treatments: false, requests: true, socialWork: false },
    workshop: { members: true, workshops: true, treatments: false, requests: false, socialWork: false },
    coordinator: { members: true, workshops: true, treatments: false, requests: false, socialWork: false },
  };

  for (const who of Object.keys(EXPECT_VIEW) as Who[]) {
    it(`צפייה: ${NAMES[who]}`, async () => {
      for (const [area, path] of Object.entries(GET_PATHS)) {
        const res = await as(who).get(path);
        expect(res.status, `${who} ${area}`).toBe(EXPECT_VIEW[who][area as keyof typeof GET_PATHS] ? 200 : 403);
        if (res.status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  }

  it('עריכה: יצירת חבר, סדנה וניהול מטפלים', async () => {
    const member = (who: Who) => as(who).post('/api/members', { firstName: 'א', lastName: 'ב', phone: `052-62${String(++seq).padStart(5, '0')}` });
    const workshop = (who: Who) => as(who).post('/api/workshops', { kind: 'WORKSHOP', name: `סדנה ${++seq}` });
    const therapist = (who: Who) => as(who).post('/api/therapists', { fullName: `מטפל ${++seq}`, type: 'PRIVATE', pricePerSession: 100 });

    // יצירת חבר (חברים: עריכה)
    for (const who of ['manager', 'lead', 'ronit', 'workshop'] as Who[]) expect((await member(who)).status, who).toBe(201);
    for (const who of ['nurse', 'mediator', 'coordinator'] as Who[]) expect((await member(who)).status, who).toBe(403);
    // סדנה (סדנאות: עריכה רק למנהל כללי ולמנהל סדנאות)
    for (const who of ['manager', 'workshop'] as Who[]) expect((await workshop(who)).status, who).toBe(201);
    for (const who of ['lead', 'ronit', 'coordinator'] as Who[]) expect((await workshop(who)).status, who).toBe(403);
    // ניהול מטפלים דורש הרשאת ניהול בשפ"ח
    for (const who of ['manager', 'lead'] as Who[]) expect((await therapist(who)).status, who).toBe(201);
    expect((await therapist('ronit')).status).toBe(403);
    expect((await therapist('ronit')).body.error.message).toContain('ניהול');
  });
});

describe('עו"סית רואה הכל ועורכת את שלה', () => {
  it('פניות: עריכה רק במשויכות אליה או שאינן משויכות; עו"סית ראשית עורכת הכל', async () => {
    const mine = await mkRequest('SUPPORT', NAMES.ronit);
    const hers = await mkRequest('SUPPORT', NAMES.shira);
    const free = await mkRequest('RIGHTS'); // ללא אחראי: ישויך אוטומטית לעו"סית הראשית
    expect(free.assignee).toBe(NAMES.lead);

    expect((await as('ronit').get(`/api/service-requests/${hers.id}`)).status).toBe(200); // רואה הכל
    expect((await as('ronit').post(`/api/service-requests/${mine.id}/notes`, { text: 'הערה' })).status).toBe(201);
    const blocked = await as('ronit').post(`/api/service-requests/${hers.id}/notes`, { text: 'הערה' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('NOT_OWNER');
    expect(blocked.body.error.message).toContain(NAMES.shira);
    expect((await as('ronit').post(`/api/service-requests/${free.id}/notes`, { text: 'x' })).status).toBe(403); // משויכת לעו"סית הראשית
    expect((await as('lead').post(`/api/service-requests/${hers.id}/notes`, { text: 'עריכת עו"סית ראשית' })).status).toBe(201);
    expect((await as('manager').post(`/api/service-requests/${hers.id}/notes`, { text: 'מנהל' })).status).toBe(201);

    // עו"סית מקבלת לעצמה פנייה חדשה שהיא פותחת בלי לבחור אחראי
    const m = await mkMember();
    const created = await as('shira').post('/api/service-requests', { memberId: m.id, type: 'SUPPORT', subject: 'נפתחה על ידי עו"סית' });
    expect(created.body.assignee).toBe(NAMES.shira);
    expect((await as('shira').post(`/api/service-requests/${created.body.id}/notes`, { text: 'המשך' })).status).toBe(201);
  });

  it('ליווי עו"ס ושפ"ח: עריכה לפי שיוך, ואישורי תשלום לניהול בלבד', async () => {
    const m = await mkMember();
    const proc = (await as('manager').post('/api/social-work/processes', { memberId: m.id, kinds: ['SUPPORT'], socialWorker: NAMES.shira, goal: 'ליווי' })).body;
    const meeting = (who: Who) => as(who).post(`/api/social-work/processes/${proc.id}/meetings`, { date: '2026-10-20', time: '10:00', subject: 'פגישה' });
    expect((await meeting('ronit')).status).toBe(403);
    expect((await meeting('shira')).status).toBe(201);
    expect((await as('ronit').get(`/api/social-work/processes/${proc.id}/meetings`)).status).toBe(200);

    const th = (await as('manager').post('/api/therapists', { fullName: 'מטפל', type: 'PRIVATE', pricePerSession: 100 })).body;
    const t = (await as('manager').post('/api/treatments', { memberId: m.id, approvedSessions: 10, copayPerSession: 0, socialWorker: NAMES.ronit, yehudaApproval: true, track: 'PRIVATE', therapistId: th.id })).body;
    await as('ronit').post(`/api/treatments/${t.id}/sign-demo`);
    expect((await as('shira').post(`/api/treatments/${t.id}/notes`, { description: 'x' })).status).toBe(403);
    const rep = await as('ronit').post(`/api/treatments/${t.id}/reports`, { therapistId: th.id, year: 2026, month: 5, sessionsHeld: 2, paidCancellations: 0 });
    expect(rep.status).toBe(201);
    expect((await as('ronit').post(`/api/treatment-reports/${rep.body.id}/approve`)).status).toBe(200);
    // סטטוס תשלום דורש ניהול: עו"סית רגילה נחסמת, עו"סית ראשית מאשרת
    expect((await as('ronit').patch(`/api/treatment-reports/${rep.body.id}/payment`, { copayPaymentStatus: 'PAID' })).status).toBe(403);
    expect((await as('lead').patch(`/api/treatment-reports/${rep.body.id}/payment`, { copayPaymentStatus: 'PAID' })).status).toBe(200);
  });
});

describe('אחות ומגשר: רק הקטגוריה שלהם', () => {
  it('רשימות, כרטיסים ויצירה מוגבלים לקטגוריה, ושיוך אוטומטי לפי קטגוריה', async () => {
    const health = await mkRequest('HEALTH');
    const mediation = await mkRequest('FAMILY_MEDIATION');
    const support = await mkRequest('SUPPORT');
    expect(health.assignee).toBe(NAMES.nurse);
    expect(mediation.assignee).toBe(NAMES.mediator);
    expect(support.assignee).toBe(NAMES.lead);

    const nurseList = (await as('nurse').get('/api/service-requests')).body as { id: number; type: string }[];
    expect(nurseList.map((r) => r.type)).toEqual(['HEALTH']);
    const mediatorList = (await as('mediator').get('/api/service-requests')).body as { type: string }[];
    expect(mediatorList.map((r) => r.type)).toEqual(['FAMILY_MEDIATION']);
    expect((await as('manager').get('/api/service-requests')).body).toHaveLength(3);

    expect((await as('nurse').get(`/api/service-requests/${health.id}`)).status).toBe(200);
    expect((await as('nurse').get(`/api/service-requests/${support.id}`)).status).toBe(403);
    expect((await as('nurse').post(`/api/service-requests/${support.id}/notes`, { text: 'x' })).status).toBe(403);
    expect((await as('nurse').post(`/api/service-requests/${health.id}/notes`, { text: 'ייעוץ' })).status).toBe(201);

    const m = await mkMember();
    expect((await as('nurse').post('/api/service-requests', { memberId: m.id, type: 'SUPPORT', subject: 'לא שלי' })).status).toBe(403);
    expect((await as('nurse').post('/api/service-requests', { memberId: m.id, type: 'HEALTH', subject: 'שלי' })).status).toBe(201);
    // פניות החבר בכרטיסו מסוננות גם הן
    expect(((await as('mediator').get(`/api/members/${mediation.memberId}/service-requests`)).body as unknown[]).length).toBe(1);
    expect(((await as('mediator').get(`/api/members/${support.memberId}/service-requests`)).body as unknown[]).length).toBe(0);
    // אחות אינה רואה שפ"ח וליווי של החבר
    expect((await as('nurse').get(`/api/members/${support.memberId}/treatments`)).status).toBe(403);
    expect((await as('nurse').get(`/api/members/${support.memberId}/social-work`)).status).toBe(403);
  });
});

describe('רישום מבצע הפעולה ורשימות עובדים', () => {
  it('היסטוריות והערות נרשמות על שם המשתמש המחובר', async () => {
    const req = await mkRequest('SUPPORT', NAMES.ronit);
    await as('ronit').post(`/api/service-requests/${req.id}/status`, { status: 'REVIEW' });
    const events = (await as('ronit').get(`/api/service-requests/${req.id}/events`)).body as { type: string; performedBy: string | null }[];
    expect(events.find((e) => e.type === 'STATUS_CHANGE')!.performedBy).toBe(NAMES.ronit);
    expect(events.find((e) => e.type === 'CREATED')!.performedBy).toBe(NAMES.manager);

    const proc = (await as('ronit').post('/api/social-work/processes', { memberId: req.memberId, kinds: ['SUPPORT'], socialWorker: NAMES.ronit, goal: 'x' })).body;
    await as('ronit').post(`/api/social-work/processes/${proc.id}/activate`);
    const swEvents = (await as('ronit').get(`/api/social-work/processes/${proc.id}/events`)).body as { performedBy: string }[];
    expect(swEvents.every((e) => e.performedBy === NAMES.ronit)).toBe(true);

    const notes = (await as('lead').post(`/api/members/${req.memberId}/notes`, { text: 'הערה בכרטיס' })).body as { author: string }[];
    expect(notes[0].author).toBe(NAMES.lead);
  });

  it('רשימות השיוך מגיעות מהמשתמשים', async () => {
    const staff = (await as('ronit').get('/api/service-meta')).body.staff as string[];
    expect(staff).toEqual([NAMES.lead, NAMES.ronit, NAMES.shira, NAMES.nurse, NAMES.mediator]);
    const sw = (await as('ronit').get('/api/treatment-meta')).body.socialWorkers as string[];
    expect(sw).toEqual([NAMES.lead, NAMES.ronit, NAMES.shira]);
    // גם מנהל סדנאות (בלי הרשאה לפניות) יכול לקבל את הרשימה לצורך התצוגה
    expect((await as('workshop').get('/api/service-meta')).status).toBe(200);
  });
});

describe('דף החבר "האירועים שאני רשום אליהם"', () => {
  it('צפייה בטלפון בלבד, וביטול דורש קוד חד-פעמי (בהדגמה מוצג על המסך)', async () => {
    const member = await mkMember();
    const other = await mkMember();
    const w = (await as('manager').post('/api/workshops', { kind: 'WORKSHOP', name: 'סדנה לדף החבר', format: 'SINGLE', startDate: addDays(todayDateOnly(), 10) })).body;
    const reg = (await as('manager').post(`/api/workshops/${w.id}/registrations`, { memberId: member.id })).body;
    const otherReg = (await as('manager').post(`/api/workshops/${w.id}/registrations`, { memberId: other.id })).body;

    expect((await request(app).post('/api/me/lookup').send({ phone: '0509999999' })).status).toBe(404);
    const view = await request(app).post('/api/me/lookup').send({ phone: member.phone });
    expect(view.status).toBe(200);
    expect(view.body.events.map((e: { name: string }) => e.name)).toEqual(['סדנה לדף החבר']);
    expect(JSON.stringify(view.body)).not.toContain(other.phone);

    expect((await request(app).post('/api/me/cancel').send({ phone: member.phone, registrationId: reg.id, code: '000000' })).status).toBe(403);
    expect((await request(app).post('/api/me/cancel').send({ phone: member.phone, registrationId: otherReg.id, code: view.body.demoCode })).status).toBe(404); // לא של החבר
    const cancelled = await request(app).post('/api/me/cancel').send({ phone: member.phone, registrationId: reg.id, code: view.body.demoCode });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.events).toHaveLength(0);
    // הביטול נשמר כהיסטוריה (לא נמחק) וגלוי לצוות
    const regs = (await as('manager').get(`/api/workshops/${w.id}/registrations`).then((r) => r)).body as unknown[];
    expect(regs).toHaveLength(1);
  });
});
