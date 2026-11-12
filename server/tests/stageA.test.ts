import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { addDays, todayDateOnly } from '../src/lib/dates';
import { ensureDefaultTemplates } from '../src/messaging/templates';
import { demoProvider, setProvider } from '../src/messaging/provider';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
let seq = 0;

const mkMember = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/members').send({ firstName: 'רינה', lastName: `שלבא${seq}`, phone: `052-80000${String(seq).padStart(2, '0')}`, gender: 'FEMALE', birthYear: 1990, ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number; status: string };
};
const mkWorkshop = async () => {
  seq += 1;
  const w = await api().post('/api/workshops').send({ kind: 'WORKSHOP', name: `סדנה ${seq}`, format: 'SINGLE', startDate: addDays(todayDateOnly(), 10), startTime: '10:00', endTime: '12:00' });
  await api().post(`/api/workshops/${w.body.id}/publish`);
  return w.body as { id: number };
};

beforeEach(async () => {
  await resetDb();
  await ensureDefaultTemplates();
  setProvider(demoProvider);
});

describe('סטטוס חבר והרחקות', () => {
  it('חבר חדש פעיל', async () => {
    expect((await mkMember()).status).toBe('ACTIVE');
  });

  it('הרחקה זמנית דורשת תאריך סיום, הרחקה על תנאי דורשת תנאי', async () => {
    const m = await mkMember();
    const a = await api().post(`/api/members/${m.id}/removals`).send({ kind: 'TEMPORARY', reason: 'התנהגות' });
    expect(a.status).toBe(400);
    expect(a.body.error.details.fields.endDate).toBeTruthy();
    const b = await api().post(`/api/members/${m.id}/removals`).send({ kind: 'CONDITIONAL', reason: 'מצב נפשי' });
    expect(b.status).toBe(400);
    expect(b.body.error.details.fields.condition).toBeTruthy();
  });

  it('הרחקה משנה את הסטטוס וחוסמת הרשמה; החזרה ידנית משחררת', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const rm = await api().post(`/api/members/${m.id}/removals`).send({ kind: 'TEMPORARY', reason: 'אלימות מילולית', endDate: addDays(todayDateOnly(), 30) });
    expect(rm.status).toBe(201);
    expect((await api().get(`/api/members/${m.id}`)).body.status).toBe('REMOVED_TEMP');
    const reg = await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id });
    expect(reg.status).toBe(403);
    expect(reg.body.error.code).toBe('MEMBER_REMOVED');
    // לא ניתן להרחיק פעמיים
    expect((await api().post(`/api/members/${m.id}/removals`).send({ kind: 'PERMANENT', reason: 'x' })).status).toBe(409);
    const removalId = rm.body[0].id;
    const back = await api().post(`/api/members/${m.id}/removals/${removalId}/return`).send({ note: 'פגישה התקיימה' });
    expect(back.status).toBe(200);
    expect((await api().get(`/api/members/${m.id}`)).body.status).toBe('ACTIVE');
    expect((await api().post(`/api/workshops/${w.id}/registrations`).send({ memberId: m.id })).status).toBe(201);
  });

  it('הרחקה זמנית שעבר תאריך הסיום שלה לא משתנה אוטומטית', async () => {
    const m = await mkMember();
    await api().post(`/api/members/${m.id}/removals`).send({ kind: 'TEMPORARY', reason: 'x', date: addDays(todayDateOnly(), -20), endDate: addDays(todayDateOnly(), -5) });
    expect((await api().get(`/api/members/${m.id}`)).body.status).toBe('REMOVED_TEMP');
    const list = await api().get(`/api/members/${m.id}/removals`);
    expect(list.body[0].endDatePassed).toBe(true);
    expect(list.body[0].active).toBe(true);
  });

  it('סינון רשימת החברים לפי סטטוס', async () => {
    const a = await mkMember();
    await mkMember();
    await api().post(`/api/members/${a.id}/removals`).send({ kind: 'PERMANENT', reason: 'x' });
    const removed = await api().get('/api/members?status=REMOVED');
    expect(removed.body.total).toBe(1);
    expect((await api().get('/api/members?status=ACTIVE')).body.total).toBe(1);
  });

  it('מעבר ללא פעיל ובחזרה; חבר מורחק לא משנה סטטוס כך', async () => {
    const m = await mkMember();
    expect((await api().patch(`/api/members/${m.id}/status`).send({ status: 'INACTIVE' })).body.status).toBe('INACTIVE');
    expect((await api().patch(`/api/members/${m.id}/status`).send({ status: 'ACTIVE' })).body.status).toBe('ACTIVE');
    await api().post(`/api/members/${m.id}/removals`).send({ kind: 'PERMANENT', reason: 'x' });
    expect((await api().patch(`/api/members/${m.id}/status`).send({ status: 'ACTIVE' })).status).toBe(409);
  });

  it('דוח לא פעילים: פעיל שהצטרף לפני יותר משנה ולא השתתף', async () => {
    const old = await mkMember({ joinDate: addDays(todayDateOnly(), -400) });
    await mkMember({ joinDate: addDays(todayDateOnly(), -10) });
    const r = await api().get('/api/members/reports/inactive');
    expect(r.status).toBe(200);
    expect(r.body.map((x: { id: number }) => x.id)).toEqual([old.id]);
  });

  it('הערות צוות נפרדות מהערות העו"סית', async () => {
    const m = await mkMember();
    await api().post(`/api/members/${m.id}/staff-notes`).send({ text: 'הערה כללית' });
    await api().post(`/api/members/${m.id}/notes`).send({ text: 'הערת עו"ס' });
    const staff = await api().get(`/api/members/${m.id}/staff-notes`);
    const social = await api().get(`/api/members/${m.id}/notes`);
    expect(staff.body.map((n: { text: string }) => n.text)).toEqual(['הערה כללית']);
    expect(social.body.map((n: { text: string }) => n.text)).toEqual(['הערת עו"ס']);
  });
});

describe('דיווחים ותלונות', () => {
  it('יוצר תלונה עם תאריך אחורה ומחייב מתלונן', async () => {
    const subject = await mkMember();
    const bad = await api().post('/api/complaints').send({ complainantType: 'STAFF', subjectMemberId: subject.id, text: 'x' });
    expect(bad.status).toBe(400);
    const ok = await api().post('/api/complaints').send({ complainantType: 'STAFF', complainantName: 'מיכל', subjectMemberId: subject.id, text: 'צעקות בסדנה', receivedAt: addDays(todayDateOnly(), -200) });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'NEW', receivedAt: addDays(todayDateOnly(), -200), repeat: false });
  });

  it('תלונה חוזרת מציגה את הקודמות', async () => {
    const subject = await mkMember();
    const reporter = await mkMember();
    const first = await api().post('/api/complaints').send({ complainantType: 'MEMBER', complainantMemberId: reporter.id, subjectMemberId: subject.id, text: 'ראשונה' });
    const second = await api().post('/api/complaints').send({ complainantType: 'STAFF', complainantName: 'מיכל', subjectMemberId: subject.id, text: 'שנייה' });
    expect(second.body.repeat).toBe(true);
    expect(second.body.previous.map((p: { id: number }) => p.id)).toEqual([first.body.id]);
    const byMember = await api().get(`/api/members/${subject.id}/complaints`);
    expect(byMember.body.about).toHaveLength(2);
    expect((await api().get(`/api/members/${reporter.id}/complaints`)).body.by).toHaveLength(1);
  });

  it('תיעוד טיפול מעביר ל"בטיפול", ונחסם אחרי "טופל"', async () => {
    const subject = await mkMember();
    const c = await api().post('/api/complaints').send({ complainantType: 'STAFF', complainantName: 'מיכל', subjectMemberId: subject.id, text: 't' });
    const e = await api().post(`/api/complaints/${c.body.id}/entries`).send({ kind: 'MEETING', text: 'נפגשנו' });
    expect(e.body.status).toBe('IN_PROGRESS');
    expect(e.body.entries).toHaveLength(1);
    await api().post(`/api/complaints/${c.body.id}/status`).send({ status: 'HANDLED' });
    expect((await api().post(`/api/complaints/${c.body.id}/entries`).send({ kind: 'CALL', text: 'עוד' })).status).toBe(409);
    expect((await api().post(`/api/complaints/${c.body.id}/status`).send({ status: 'NEW' })).status).toBe(409);
    await api().post(`/api/complaints/${c.body.id}/status`).send({ status: 'IN_PROGRESS' });
    expect((await api().post(`/api/complaints/${c.body.id}/entries`).send({ kind: 'CALL', text: 'עוד' })).status).toBe(201);
  });

  it('פעולה של הרחקה בעקבות תלונה יוצרת הרחקה בכרטיס החבר ומקשרת אליה', async () => {
    const subject = await mkMember();
    const c = await api().post('/api/complaints').send({ complainantType: 'STAFF', complainantName: 'מיכל', subjectMemberId: subject.id, text: 'חמורה' });
    const r = await api().post(`/api/complaints/${c.body.id}/action`).send({ action: 'REMOVAL_PERMANENT' });
    expect(r.status).toBe(200);
    expect(r.body.actionTaken).toBe('REMOVAL_PERMANENT');
    expect(r.body.removals).toHaveLength(1);
    expect((await api().get(`/api/members/${subject.id}`)).body.status).toBe('REMOVED_PERMANENT');
  });
});

describe('גישור משפחתי', () => {
  const body = (memberId: number, over: Record<string, unknown> = {}) => ({ memberId, mediator: 'חוי', parents: ['FATHER', 'MOTHER'], initiatedBy: 'MEMBER', need: 'נתק', goal: 'שיחה', ...over });

  it('יוצר כרטיס, מונע כרטיס פעיל שני, ומחייב פירוט כשנבחר "אחר"', async () => {
    const m = await mkMember();
    expect((await api().post('/api/mediations').send(body(m.id, { parents: ['OTHER'] }))).status).toBe(400);
    const ok = await api().post('/api/mediations').send(body(m.id));
    expect(ok.status).toBe(201);
    expect(ok.body.parents).toEqual(['FATHER', 'MOTHER']);
    expect((await api().post('/api/mediations').send(body(m.id))).status).toBe(409);
    expect((await api().get(`/api/members/${m.id}/mediations`)).body).toHaveLength(1);
  });

  it('תיעוד שיחות, פגישות ומפגש הורים חיצוני, וסיום עם יעד', async () => {
    const m = await mkMember();
    const c = await api().post('/api/mediations').send(body(m.id));
    const id = c.body.id;
    await api().post(`/api/mediations/${id}/contacts`).send({ kind: 'CALL', date: todayDateOnly(), withWhom: 'MOTHER', summary: 'שיחה ראשונה' });
    await api().post(`/api/mediations/${id}/contacts`).send({ kind: 'EXTERNAL_PARENTS_MEETING', date: todayDateOnly(), place: 'ירושלים', effect: 'נפתחה' });
    const got = await api().get(`/api/mediations/${id}`);
    expect(got.body.contacts).toHaveLength(2);
    expect((await api().post(`/api/mediations/${id}/finish`).send({})).status).toBe(400);
    const fin = await api().post(`/api/mediations/${id}/finish`).send({ goalAchieved: true, endSummary: 'הושג' });
    expect(fin.body).toMatchObject({ status: 'FINISHED', goalAchieved: true });
    expect((await api().post(`/api/mediations/${id}/contacts`).send({ kind: 'CALL', date: todayDateOnly() })).status).toBe(409);
    expect((await api().post(`/api/mediations/${id}/reopen`)).body.status).toBe('ACTIVE');
  });
});

describe('כרטיס תכנית (ביטוח לאומי) ופגישות', () => {
  it('כרטיס תכנית נשמר רק לחבר ביטוח לאומי', async () => {
    const plain = await mkMember({ nationalInsurance: false });
    const ni = await mkMember({ nationalInsurance: true });
    const mk = async (memberId: number) => (await api().post('/api/social-work/processes').send({ memberId, kinds: ['RIGHTS'] })).body.id as number;
    const p1 = await mk(plain.id);
    const p2 = await mk(ni.id);
    expect((await api().put(`/api/social-work/processes/${p1}`).send({ needs: ['STUDIES'] })).status).toBe(422);
    const ok = await api().put(`/api/social-work/processes/${p2}`).send({ needs: ['STUDIES', 'RIGHTS'], responses: ['WORKSHOPS'], externalResponses: 'מלגת שיקום', programStartDate: todayDateOnly() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ needs: ['STUDIES', 'RIGHTS'], responses: ['WORKSHOPS'], externalResponses: 'מלגת שיקום' });
  });

  it('הודעה כסוג מגע ותביעה עם סוג', async () => {
    const m = await mkMember({ nationalInsurance: true });
    const p = (await api().post('/api/social-work/processes').send({ memberId: m.id, kinds: ['RIGHTS'] })).body.id;
    const msg = await api().post(`/api/social-work/processes/${p}/meetings`).send({ date: todayDateOnly(), time: '10:00', mode: 'MESSAGE', topics: ['HOUSING'], meetingActions: ['CLAIM'], claimType: 'REHAB_BASKET' });
    expect(msg.status).toBe(201);
    expect(msg.body[0]).toMatchObject({ mode: 'MESSAGE', claimType: 'REHAB_BASKET', durationMinutes: null });
  });
});

describe('סוג אירוע', () => {
  it('לאירוע נשמר סוג (ברירת מחדל רגיל); לסדנה אין', async () => {
    const ev = await api().post('/api/workshops').send({ kind: 'EVENT', name: 'יום סטודנטים', eventType: 'STUDENT_DAY', startDate: addDays(todayDateOnly(), 5), startTime: '10:00', endTime: '12:00' });
    expect(ev.body.eventType).toBe('STUDENT_DAY');
    const ev2 = await api().post('/api/workshops').send({ kind: 'EVENT', name: 'אירוע', startDate: addDays(todayDateOnly(), 5), startTime: '10:00', endTime: '12:00' });
    expect(ev2.body.eventType).toBe('REGULAR');
    const ws = await api().post('/api/workshops').send({ kind: 'WORKSHOP', name: 'סדנה', eventType: 'YODIT', startDate: addDays(todayDateOnly(), 5), startTime: '10:00', endTime: '12:00' });
    expect(ws.body.eventType).toBeNull();
    const upd = await api().put(`/api/workshops/${ev.body.id}`).send({ eventType: 'SCHOLARSHIP_FAIR' });
    expect(upd.body.eventType).toBe('SCHOLARSHIP_FAIR');
  });
});

describe('שליחת הודעה ידנית', () => {
  it('לפי תבנית עם ערכים למשתנים, ובנוסח חופשי', async () => {
    const a = await mkMember();
    const b = await mkMember({ preferredChannel: 'EMAIL' }); // אין מייל
    const r = await api().post('/api/messages/send').send({ memberIds: [a.id, b.id], templateKey: 'workshop.reminder', vars: { פעילות: 'סדנת ציור', תאריך: '1.12', שעה: '18:00' } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sent: 1, skipped: 1 });
    const out = await prisma.outboxMessage.findMany({ where: { memberId: a.id } });
    expect(out[0].body).toContain('סדנת ציור');
    expect(out[0].relatedType).toBe('MANUAL');
    const free = await api().post('/api/messages/send').send({ memberIds: [a.id], body: 'שלום {{שם}}, מחר סגור' });
    expect(free.body.sent).toBe(1);
    expect((await prisma.outboxMessage.findMany({ where: { memberId: a.id }, orderBy: { id: 'desc' } }))[0].body).toBe('שלום רינה, מחר סגור');
    expect((await api().post('/api/messages/send').send({ memberIds: [a.id] })).status).toBe(400);
  });
});

describe('הרשאות לשלב א׳', () => {
  const as = async (role: string) => {
    process.env.AUTH_DISABLED = '0';
    const u = await prisma.appUser.create({ data: { name: `${role}-א`, role } });
    return String(u.id);
  };

  it('אחות לא ניגשת לגישור ולתלונות; מגשר ניגש לגישור אך לא לתלונות', async () => {
    const nurse = await as('NURSE');
    const mediator = await as('MEDIATOR');
    try {
      expect((await api().get('/api/mediations').set('x-demo-user', nurse)).status).toBe(403);
      expect((await api().get('/api/complaints').set('x-demo-user', nurse)).status).toBe(403);
      expect((await api().get('/api/mediations').set('x-demo-user', mediator)).status).toBe(200);
      expect((await api().get('/api/complaints').set('x-demo-user', mediator)).status).toBe(403);
    } finally {
      process.env.AUTH_DISABLED = '1';
    }
  });

  it('הרשאת תצוגה בלבד לא יכולה להרחיק חבר', async () => {
    const m = await mkMember();
    const coord = await as('PROGRAM_COORDINATOR'); // חברים: צפייה בלבד
    try {
      expect((await api().post(`/api/members/${m.id}/removals`).set('x-demo-user', coord).send({ kind: 'PERMANENT', reason: 'x' })).status).toBe(403);
    } finally {
      process.env.AUTH_DISABLED = '1';
    }
  });
});
