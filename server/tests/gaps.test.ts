import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { addDays, todayDateOnly } from '../src/lib/dates';
import { syncWorkshopStatuses } from '../src/services/workshopStatusSync';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
const year = new Date().getFullYear();
let seq = 0;

const mkMember = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/members').send({ firstName: 'חבר', lastName: `פער${seq}`, phone: `054-60000${String(seq).padStart(2, '0')}`, gender: 'FEMALE', birthYear: year - 65, ...over });
  return r.body as { id: number; phone: string };
};
const mkWorkshop = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/workshops').send({ kind: 'WORKSHOP', name: `פעילות ${seq}`, format: 'SINGLE', startDate: addDays(todayDateOnly(), 10), startTime: '10:00', endTime: '12:00', ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number };
};
const publish = (id: number) => api().post(`/api/workshops/${id}/publish`);
const register = (wid: number, memberId: number, answers: unknown[] = []) => api().post(`/api/workshops/${wid}/registrations`).send({ memberId, answers });

beforeEach(resetDb);

describe('חברים: הגבלות והערות', () => {
  it('הגבלה לפי סוג פעילות חוסמת אירועים בלבד', async () => {
    const m = await mkMember();
    const workshop = await mkWorkshop({ kind: 'WORKSHOP' });
    const event = await mkWorkshop({ kind: 'EVENT' });
    const added = await api().post(`/api/members/${m.id}/restrictions`).send({ kind: 'EVENT', reason: 'בדיקה' });
    expect(added.body[0]).toMatchObject({ scope: 'KIND', kind: 'EVENT' });
    const blocked = await register(event.id, m.id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toContain('אירועים');
    expect((await register(workshop.id, m.id)).status).toBe(201);
    // כפילות והגבלה כפולה לא מותרות
    expect((await api().post(`/api/members/${m.id}/restrictions`).send({ kind: 'EVENT' })).status).toBe(409);
    expect((await api().post(`/api/members/${m.id}/restrictions`).send({ kind: 'EVENT', workshopId: workshop.id })).status).toBe(400);
  });

  it('הגבלה לפעילות ספציפית אפשרית רק לפעילות שטרם התקיימה', async () => {
    const m = await mkMember();
    const upcoming = await mkWorkshop();
    const past = await mkWorkshop();
    await api().put(`/api/workshops/${past.id}`).send({ status: 'FINISHED' });
    expect((await api().post(`/api/members/${m.id}/restrictions`).send({ workshopId: upcoming.id })).status).toBe(201);
    const bad = await api().post(`/api/members/${m.id}/restrictions`).send({ workshopId: past.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('WORKSHOP_PAST');
  });

  it('הערות עו"סית בכרטיס החבר נשמרות בטבלה נפרדת', async () => {
    const m = await mkMember();
    expect((await api().post(`/api/members/${m.id}/notes`).send({ text: '' })).status).toBe(400);
    const list = (await api().post(`/api/members/${m.id}/notes`).send({ text: 'שוחחתי עם החברה', author: 'אורית לביא' })).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ text: 'שוחחתי עם החברה', author: 'אורית לביא' });
    expect((await api().get(`/api/members/${m.id}`)).body).not.toHaveProperty('notes');
  });
});

describe('סדנאות: חובת רישום, מחיר, שאלות והגבלות', () => {
  it('חובת רישום בשלוש אפשרויות באירוע בלבד; בסדנה תמיד חובה', async () => {
    const ev = await mkWorkshop({ kind: 'EVENT', registrationMode: 'RECOMMENDED' });
    expect((await api().get(`/api/workshops/${ev.id}`)).body).toMatchObject({ registrationMode: 'RECOMMENDED', registrationRequired: false });
    expect((await api().put(`/api/workshops/${ev.id}`).send({ registrationMode: 'NOT_NEEDED' })).body.registrationMode).toBe('NOT_NEEDED');
    const ws = await mkWorkshop({ kind: 'WORKSHOP', registrationMode: 'NOT_NEEDED' }); // מתעלמים: סדנה תמיד חובה
    expect((await api().get(`/api/workshops/${ws.id}`)).body.registrationMode).toBe('REQUIRED');
    const bad = await api().put(`/api/workshops/${ws.id}`).send({ registrationMode: 'RECOMMENDED' });
    expect(bad.status).toBe(422);
  });

  it('סוג מחיר קבוע/לחודש נשמר רק בסדנה מרובת מפגשים', async () => {
    const multi = await mkWorkshop({ format: 'MULTI', sessionCount: 3, isPaid: true, price: 300, priceType: 'MONTHLY' });
    expect((await api().get(`/api/workshops/${multi.id}`)).body.priceType).toBe('MONTHLY');
    const single = await mkWorkshop({ isPaid: true, price: 50, priceType: 'MONTHLY' });
    expect((await api().get(`/api/workshops/${single.id}`)).body.priceType).toBe('FIXED');
  });

  it('שאלת בחירה מרובה (צ\'קבוקס): חובה, אימות אפשרויות ושמירת התשובות', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const qs = (await api().post(`/api/workshops/${w.id}/questions`).send({ text: 'אילו נושאים מעניינים אותך?', type: 'MULTI_CHOICE', required: true, options: [{ label: 'אמנות' }, { label: 'מוזיקה' }, { label: 'ספרות' }] })).body;
    const q = qs[0];
    expect((await api().post(`/api/workshops/${w.id}/questions`).send({ text: 'x', type: 'MULTI_CHOICE', options: [{ label: 'רק אחת' }] })).status).toBe(400);
    const none = await register(w.id, m.id, []);
    expect(none.status).toBe(422);
    const wrong = await register(w.id, m.id, [{ questionId: q.id, optionIds: [999999] }]);
    expect(wrong.status).toBe(422);
    const ok = await register(w.id, m.id, [{ questionId: q.id, optionIds: [q.options[0].id, q.options[2].id] }]);
    expect(ok.status).toBe(201);
    const details = (await api().get(`/api/registrations/${ok.body.id}`)).body;
    expect(details.answers[0].answer).toBe('אמנות, ספרות');
  });

  it('הגבלה: רק מי שלא השתתף בסדנה X', async () => {
    const a = await mkWorkshop({ startDate: addDays(todayDateOnly(), 1) });
    const b = await mkWorkshop();
    await api().put(`/api/workshops/${b.id}`).send({ excludeParticipantsOfWorkshopId: a.id });
    expect((await api().put(`/api/workshops/${b.id}`).send({ excludeParticipantsOfWorkshopId: b.id })).status).toBe(422);
    const attended = await mkMember();
    const absent = await mkMember();
    const ra = await register(a.id, attended.id);
    await register(a.id, absent.id);
    const [s] = (await api().get(`/api/workshops/${a.id}/sessions`)).body;
    await api().put(`/api/sessions/${s.id}/attendance`).send({ registrationId: ra.body.id, status: 'PRESENT' });
    const res = await register(b.id, attended.id);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('לא השתתפו');
    expect((await register(b.id, absent.id)).status).toBe(201);
  });
});

describe('דף רישום ציבורי: הודעות ייעודיות לפי המסמך', () => {
  it('הודעת דחייה והודעת סיום מותאמות לסדנה, ללא חשיפת פרטי חבר', async () => {
    const w = await mkWorkshop();
    await api().put(`/api/workshops/${w.id}`).send({ genderRestriction: 'MALE', rejectMessage: 'הסדנה מיועדת לגברים בלבד, נשמח לראותך באחרות', completionMessage: 'נרשמת! אנחנו שומרים לך מקום' });
    await publish(w.id);
    const woman = await mkMember();
    const rej = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: woman.phone });
    expect(rej.status).toBe(422);
    expect(rej.body.error.code).toBe('NOT_ELIGIBLE');
    expect(rej.body.error.message).toBe('הסדנה מיועדת לגברים בלבד, נשמח לראותך באחרות');
    expect(JSON.stringify(rej.body)).not.toContain(String(year - 65));

    const man = await mkMember({ gender: 'MALE' });
    const ok = await api().post(`/api/public/workshops/${w.id}/register`).send({ phone: man.phone });
    expect(ok.body.message).toBe('נרשמת! אנחנו שומרים לך מקום');
  });

  it('הודעה ייעודית אחרי סגירת הרישום, והודעות ברירת מחדל לכל סיבה', async () => {
    const w = await mkWorkshop();
    await publish(w.id);
    const m = await mkMember();
    await api().put(`/api/workshops/${w.id}`).send({ registrationOpen: false, closedMessage: 'הרישום נסגר, נעדכן בסדנה הבאה' });
    const closed = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone });
    expect(closed.body.error.message).toBe('הרישום נסגר, נעדכן בסדנה הבאה');
    expect((await api().get(`/api/public/workshops/${w.id}`)).body.closedReason).toBe('הרישום נסגר, נעדכן בסדנה הבאה');

    await api().put(`/api/workshops/${w.id}`).send({ registrationOpen: true });
    await register(w.id, m.id);
    expect((await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone })).body.error.code).toBe('ALREADY_REGISTERED');
    const other = await mkMember();
    await api().post(`/api/members/${other.id}/restrictions`).send({ reason: 'פנימי' });
    const restricted = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: other.phone });
    expect(restricted.body.error.code).toBe('RESTRICTED');
    expect(restricted.body.error.message).not.toContain('פנימי');
  });

  it('אי-הגעות חוזרות: 3 פעילויות חד-פעמיות בחצי שנה חוסמות באתר, אך לא הרשמה ידנית', async () => {
    const m = await mkMember();
    const target = await mkWorkshop();
    await publish(target.id);
    for (let i = 0; i < 3; i += 1) {
      const past = await mkWorkshop({ startDate: addDays(todayDateOnly(), 2 + i) });
      const reg = await register(past.id, m.id);
      const [s] = (await api().get(`/api/workshops/${past.id}/sessions`)).body;
      await api().put(`/api/sessions/${s.id}/attendance`).send({ registrationId: reg.body.id, status: 'ABSENT' });
    }
    const check = await api().post(`/api/public/workshops/${target.id}/check`).send({ phone: m.phone });
    expect(check.status).toBe(403);
    expect(check.body.error.code).toBe('NO_SHOW_BLOCK');
    expect((await register(target.id, m.id)).status).toBe(201); // הצוות יכול לעקוף
    // חבר אחר, עם שתי אי-הגעות בלבד, לא נחסם
    const other = await mkMember();
    for (let i = 0; i < 2; i += 1) {
      const past = await mkWorkshop({ startDate: addDays(todayDateOnly(), 20 + i) });
      const reg = await register(past.id, other.id);
      const [s] = (await api().get(`/api/workshops/${past.id}/sessions`)).body;
      await api().put(`/api/sessions/${s.id}/attendance`).send({ registrationId: reg.body.id, status: 'ABSENT' });
    }
    expect((await api().post(`/api/public/workshops/${target.id}/check`).send({ phone: other.phone })).status).toBe(200);
  });
});

describe('מעברי סטטוס אוטומטיים של סדנאות', () => {
  it('מפורסם -> מתקיים כעת -> הסתיים, וסגירת רישום אוטומטית כשסומן', async () => {
    const date = addDays(todayDateOnly(), 5);
    const w = await mkWorkshop({ startDate: date, startTime: '10:00', endTime: '12:00' });
    await api().put(`/api/workshops/${w.id}`).send({ autoCloseRegistration: true });
    const draft = await mkWorkshop({ startDate: date });
    await publish(w.id);

    await syncWorkshopStatuses(`${date}T09:59`);
    expect((await api().get(`/api/workshops/${w.id}`)).body.status).toBe('PUBLISHED');
    const r1 = await syncWorkshopStatuses(`${date}T10:00`);
    expect(r1.started).toBe(1);
    const started = (await api().get(`/api/workshops/${w.id}`)).body;
    expect(started).toMatchObject({ status: 'ONGOING', registrationOpen: false });
    expect((await api().get(`/api/workshops/${draft.id}`)).body.status).toBe('DRAFT'); // טיוטה לא משתנה

    await syncWorkshopStatuses(`${date}T12:00`);
    expect((await api().get(`/api/workshops/${w.id}`)).body.status).toBe('ONGOING');
    await syncWorkshopStatuses(`${date}T12:01`);
    expect((await api().get(`/api/workshops/${w.id}`)).body.status).toBe('FINISHED');
    // ביטול ידני לא נדרס
    const c = await mkWorkshop({ startDate: date });
    await publish(c.id);
    await api().put(`/api/workshops/${c.id}`).send({ status: 'CANCELLED' });
    await syncWorkshopStatuses(`${date}T23:00`);
    expect((await api().get(`/api/workshops/${c.id}`)).body.status).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------- שפ"ח

const mkTherapist = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  return (await api().post('/api/therapists').send({ fullName: `מטפל ${seq}`, type: 'PRIVATE', pricePerSession: 300, ...over })).body as { id: number };
};
const openActive = async (therapistId: number) => {
  const m = await mkMember();
  const t = (await api().post('/api/treatments').send({ memberId: m.id, approvedSessions: 30, copayPerSession: 50, socialWorker: 'אורית לביא', yehudaApproval: true, track: 'PRIVATE', therapistId })).body;
  await api().post(`/api/treatments/${t.id}/sign-demo`);
  return { memberId: m.id, id: t.id as number };
};

describe('שפ"ח: פגישות עם המטופל, משימות, הודעות מטפל ומספר פגישות לכל מטפל', () => {
  it('פגישה עם המטופל נשמרת ומתועדת, ומשימות לעו"סית ניתנות לסימון', async () => {
    const t = await openActive((await mkTherapist()).id);
    expect((await api().post(`/api/treatments/${t.id}/meetings`).send({ date: '2026-10-20', subject: 'BAD' })).status).toBe(400);
    const list = (await api().post(`/api/treatments/${t.id}/meetings`).send({ date: '2026-10-20', subject: 'FIT', summary: 'המטופל מרוצה מהמטפל' })).body;
    expect(list[0]).toMatchObject({ subject: 'FIT', subjectLabel: 'מידת ההתאמה של המטפל' });
    expect((await api().get(`/api/treatments/${t.id}/events`)).body.some((e: { type: string }) => e.type === 'MEETING')).toBe(true);

    const tasks = (await api().post(`/api/treatments/${t.id}/tasks`).send({ title: 'להתקשר למטפל', dueDate: '2026-11-01' })).body;
    expect(tasks[0]).toMatchObject({ title: 'להתקשר למטפל', done: false });
    const done = (await api().patch(`/api/treatment-tasks/${tasks[0].id}`).send({ done: true })).body;
    expect(done[0].done).toBe(true);
    expect((await api().post(`/api/treatments/${t.id}/tasks`).send({ title: '' })).status).toBe(400);
  });

  it('הערת המטפל בדיווח החודשי מוצגת כהודעת מטפל, ובהיסטוריה מופיע מספר הפגישות לכל מטפל', async () => {
    const a = await mkTherapist();
    const b = await mkTherapist();
    const t = await openActive(a.id);
    const r1 = (await api().post(`/api/treatments/${t.id}/reports`).send({ therapistId: a.id, year: 2026, month: 3, sessionsHeld: 4, paidCancellations: 0, notes: 'המטופל נראה עייף' })).body;
    await api().post(`/api/treatment-reports/${r1.id}/approve`);
    await api().post(`/api/treatments/${t.id}/change-therapist`).send({ newTherapistId: b.id, reason: 'x' });
    const r2 = (await api().post(`/api/treatments/${t.id}/reports`).send({ therapistId: b.id, year: 2026, month: 4, sessionsHeld: 6, paidCancellations: 0 })).body;
    await api().post(`/api/treatment-reports/${r2.id}/approve`);

    const events = (await api().get(`/api/treatments/${t.id}/events`)).body;
    expect(events.find((e: { type: string }) => e.type === 'THERAPIST_MESSAGE').description).toContain('המטופל נראה עייף');
    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body.therapists;
    expect(hist.map((h: { heldSessions: number }) => h.heldSessions)).toEqual([4, 6]);
  });

  it('איסור סיום אוטומטי כשיש הארכה שממתינה לחתימה: ממתין לחתימת הארכה', async () => {
    const th = await mkTherapist();
    const m = await mkMember();
    const t = (await api().post('/api/treatments').send({ memberId: m.id, approvedSessions: 4, copayPerSession: 0, socialWorker: 'אורית לביא', yehudaApproval: true, track: 'PRIVATE', therapistId: th.id })).body;
    await api().post(`/api/treatments/${t.id}/sign-demo`);
    const ext = (await api().post(`/api/treatments/${t.id}/extensions`).send({ additionalSessions: 4, copayPerSession: 0, yehudaApproval: true })).body;
    const rep = (await api().post(`/api/treatments/${t.id}/reports`).send({ therapistId: th.id, year: 2026, month: 5, sessionsHeld: 4, paidCancellations: 0 })).body;
    await api().post(`/api/treatment-reports/${rep.id}/approve`);
    const state = (await api().get(`/api/treatments/${t.id}`)).body;
    expect(state.status).toBe('PENDING_EXTENSION_SIGNATURE');
    const signed = (await api().post(`/api/treatments/${t.id}/extensions/${ext.pendingExtensionIds[0]}/sign`)).body;
    expect(signed).toMatchObject({ status: 'ACTIVE_EXTENSION', approvedSessions: 8, remainingSessions: 4 });
  });
});

// ---------------------------------------------------------------- ליווי עו"ס

const mkProcess = async (memberId: number, over: Record<string, unknown> = {}) => {
  const r = await api().post('/api/social-work/processes').send({ memberId, kinds: ['SUPPORT'], goal: `מטרה ${++seq}`, ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number; type: string; typeManual: boolean };
};
const meeting = (pid: number, over: Record<string, unknown> = {}) =>
  api().post(`/api/social-work/processes/${pid}/meetings`).send({ date: '2026-10-20', time: '10:00', subject: 'פגישה', mode: 'FACE', ...over });

describe('ליווי עו"ס: סוג אוטומטי, פגישות שבוטלו, נושאים וקישור פעולה לפגישה', () => {
  it('סוג התהליך מתעדכן אוטומטית לפי מספר הפגישות שהתקיימו, ופגישה שבוטלה לא נספרת', async () => {
    const m = await mkMember();
    const p = await mkProcess(m.id); // ללא סוג מפורש: אוטומטי
    expect(p).toMatchObject({ type: 'ONE_TIME', typeManual: false });
    await api().post(`/api/social-work/processes/${p.id}/activate`);
    await meeting(p.id, { date: '2026-10-01' });
    await meeting(p.id, { date: '2026-10-02' });
    const cancelled = await meeting(p.id, { date: '2026-10-03', status: 'CANCELLED', cancelReason: 'החבר חלה' });
    expect(cancelled.status).toBe(201);
    let card = (await api().get(`/api/social-work/processes/${p.id}`)).body;
    expect(card).toMatchObject({ meetingCount: 2, type: 'ONE_TIME', suggestedType: null });
    await meeting(p.id, { date: '2026-10-04' });
    card = (await api().get(`/api/social-work/processes/${p.id}`)).body;
    expect(card).toMatchObject({ meetingCount: 3, type: 'ONGOING', suggestedType: null });
    const events = (await api().get(`/api/social-work/processes/${p.id}/events`)).body;
    expect(events.some((e: { type: string; description: string }) => e.type === 'TYPE_CHANGED' && e.description.includes('אוטומטית'))).toBe(true);

    // הגדרה ידנית מפסיקה עדכון אוטומטי, וחזרה ל"אוטומטי" מחשבת מחדש
    const manual = (await api().put(`/api/social-work/processes/${p.id}`).send({ type: 'ONE_TIME' })).body;
    expect(manual).toMatchObject({ type: 'ONE_TIME', typeManual: true, suggestedType: 'ONGOING' });
    const auto = (await api().put(`/api/social-work/processes/${p.id}`).send({ type: 'AUTO' })).body;
    expect(auto).toMatchObject({ type: 'ONGOING', typeManual: false });
  });

  it('מספר סידורי לפגישות שהתקיימו, פגישות שבוטלו עם סיבה חובה', async () => {
    const p = await mkProcess((await mkMember()).id);
    await meeting(p.id, { date: '2026-10-05', subject: 'שנייה' });
    await meeting(p.id, { date: '2026-10-01', subject: 'ראשונה' });
    const noReason = await meeting(p.id, { date: '2026-10-03', status: 'CANCELLED' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details.fields.cancelReason).toBeTruthy();
    await meeting(p.id, { date: '2026-10-03', status: 'CANCELLED', cancelReason: 'ביטול ברגע האחרון' });
    const list = (await api().get(`/api/social-work/processes/${p.id}/meetings`)).body;
    const byNumber = list.filter((x: { number: number | null }) => x.number).map((x: { number: number; subject: string }) => `${x.number}:${x.subject}`).sort();
    expect(byNumber).toEqual(['1:ראשונה', '2:שנייה']);
    const c = list.find((x: { status: string }) => x.status === 'CANCELLED');
    expect(c).toMatchObject({ number: null, cancelReason: 'ביטול ברגע האחרון' });
  });

  it('נושאים והתערבויות בפגישה, כולל גורם שת"פ חיצוני חובה', async () => {
    const p = await mkProcess((await mkMember()).id);
    const bad = await meeting(p.id, { meetingActions: ['EXTERNAL_PARTNER'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.externalPartner).toBeTruthy();
    const ok = await meeting(p.id, { topics: ['WORK', 'RESERVE_DUTY'], meetingActions: ['EMPLOYMENT', 'EXTERNAL_PARTNER'], externalPartner: 'מרכז הזדמנות', durationMinutes: 60 });
    expect(ok.body[0]).toMatchObject({ topics: ['WORK', 'RESERVE_DUTY'], meetingActions: ['EMPLOYMENT', 'EXTERNAL_PARTNER'], externalPartner: 'מרכז הזדמנות', durationMinutes: 60 });
    expect((await meeting(p.id, { topics: ['NOPE'] })).status).toBe(400);
  });

  it('פעולה (התערבות) מקושרת לפגישה, אך רק באותו תהליך', async () => {
    const m = await mkMember();
    const p1 = await mkProcess(m.id);
    const p2 = await mkProcess(m.id);
    const meet1 = (await meeting(p1.id)).body[0];
    const meet2 = (await meeting(p2.id)).body[0];
    const ok = await api().post(`/api/social-work/processes/${p1.id}/interventions`).send({ date: '2026-10-20', type: 'RIGHTS_ASSIST', description: 'סיוע בבקשה', meetingId: meet1.id });
    expect(ok.status).toBe(201);
    expect(ok.body[0].meetingId).toBe(meet1.id);
    const bad = await api().post(`/api/social-work/processes/${p1.id}/interventions`).send({ date: '2026-10-20', type: 'OTHER', description: 'y', meetingId: meet2.id });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('MEETING_MISMATCH');
  });
});
