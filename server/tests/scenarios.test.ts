import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { addDays, todayDateOnly } from '../src/lib/dates';

const app = createApp();
const api = () => request(app);
const year = new Date().getFullYear();
let phoneSeq = 0;

async function resetDb() {
  await prisma.registrationAnswer.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.memberRestriction.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.workshopQuestion.deleteMany();
  await prisma.workshopSession.deleteMany();
  await prisma.workshop.deleteMany();
  await prisma.member.deleteMany();
}

async function mkMember(over: Record<string, unknown> = {}) {
  phoneSeq += 1;
  const res = await api()
    .post('/api/members')
    .send({ firstName: 'דנה', lastName: `בדיקה${phoneSeq}`, phone: `050-70000${String(phoneSeq).padStart(2, '0')}`, gender: 'FEMALE', birthYear: year - 65, ...over });
  expect(res.status).toBe(201);
  return res.body as { id: number; phone: string };
}

async function mkWorkshop(over: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/workshops')
    .send({ kind: 'WORKSHOP', name: 'סדנת בדיקה', format: 'MULTI', startDate: addDays(todayDateOnly(), 7), sessionCount: 3, startTime: '10:00', endTime: '11:00', ...over });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

const register = (workshopId: number, memberId: number, answers: unknown[] = []) =>
  api().post(`/api/workshops/${workshopId}/registrations`).send({ memberId, answers });

beforeEach(resetDb);

describe('חברים', () => {
  it('יוצר חבר, מחשב גיל וותק, ומציג ברשימה', async () => {
    const m = await mkMember({ firstName: 'רות', birthYear: year - 70 });
    const get = await api().get(`/api/members/${m.id}`);
    expect(get.body.age).toBe(70);
    expect(get.body.preferredChannel).toBe('SMS');
    expect(get.body.joinDate).toBe(todayDateOnly());
    const list = await api().get('/api/members').query({ q: 'רות' });
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].workshopCount).toBe(0);
  });

  it('לא ממציא גיל כשאין שנת לידה', async () => {
    const m = await mkMember({ birthYear: null });
    expect((await api().get(`/api/members/${m.id}`)).body.age).toBeNull();
  });

  it('עורך חבר ושומר', async () => {
    const m = await mkMember();
    const res = await api().put(`/api/members/${m.id}`).send({ firstName: 'שונה', lastName: 'חדש', phone: m.phone, gender: 'FEMALE' });
    expect(res.status).toBe(200);
    expect((await api().get(`/api/members/${m.id}`)).body.fullName).toBe('שונה חדש');
  });

  it('שגיאות ולידציה: שדות חובה', async () => {
    const res = await api().post('/api/members').send({ firstName: '', lastName: '', phone: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.firstName).toBeTruthy();
    expect(res.body.error.details.fields.phone).toBeTruthy();
  });

  it('חוסם תעודת זהות כפולה, ומזהיר על טלפון כפול בלי למזג', async () => {
    const a = await mkMember({ nationalId: '123456789' });
    const dupId = await api().post('/api/members').send({ firstName: 'א', lastName: 'ב', phone: '052-9999999', nationalId: '123456789' });
    expect(dupId.status).toBe(409);
    expect(dupId.body.error.code).toBe('DUPLICATE_NATIONAL_ID');

    const dupPhone = await api().post('/api/members').send({ firstName: 'א', lastName: 'ב', phone: a.phone.replace('-', '') });
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.error.code).toBe('DUPLICATE_PHONE');
    expect(dupPhone.body.error.details.existing.id).toBe(a.id);

    const forced = await api().post('/api/members').send({ firstName: 'א', lastName: 'ב', phone: a.phone, allowDuplicatePhone: true });
    expect(forced.status).toBe(201);
    expect((await api().get('/api/members')).body.total).toBe(2);
  });
});

describe('סדנאות ומפגשים', () => {
  it('יוצר סדנה בת 3 מפגשים שבועיים ומסדר מספור', async () => {
    const w = await mkWorkshop();
    const sessions = (await api().get(`/api/workshops/${w.id}/sessions`)).body;
    expect(sessions.map((s: { number: number }) => s.number)).toEqual([1, 2, 3]);
    expect(sessions[1].date).toBe(addDays(sessions[0].date, 7));
    const card = (await api().get(`/api/workshops/${w.id}`)).body;
    expect(card.sessionCount).toBe(3);
    expect(card.status).toBe('DRAFT');
  });

  it('אירוע הוא תמיד מפגש אחד; ניתן ליצור טיוטה בלי תאריך', async () => {
    const e = await mkWorkshop({ kind: 'EVENT', format: 'MULTI', sessionCount: 5 });
    expect((await api().get(`/api/workshops/${e.id}`)).body.sessionCount).toBe(1);
    const draft = await mkWorkshop({ startDate: null });
    expect((await api().get(`/api/workshops/${draft.id}`)).body.sessionCount).toBe(0);
  });

  it('עורך סדנה, מפרסם (מדומה), מוסיף ומשנה ומסיר מפגש', async () => {
    const w = await mkWorkshop();
    const put = await api().put(`/api/workshops/${w.id}`).send({ name: 'שם חדש', facilitator: 'מנחה', isPaid: true, price: 120 });
    expect(put.body.name).toBe('שם חדש');
    expect(put.body.price).toBe(120);
    expect((await api().post(`/api/workshops/${w.id}/publish`)).body.status).toBe('PUBLISHED');

    const added = await api().post(`/api/workshops/${w.id}/sessions`).send({ date: addDays(todayDateOnly(), 40), startTime: '09:00', endTime: '10:00' });
    expect(added.body).toHaveLength(4);
    const last = added.body[3];
    const moved = await api().put(`/api/sessions/${last.id}`).send({ date: addDays(todayDateOnly(), 2), startTime: '09:00', endTime: '10:00' });
    expect(moved.body[0].id).toBe(last.id); // מסודר מחדש לפי תאריך
    expect((await api().delete(`/api/sessions/${last.id}`)).status).toBe(204);
    expect((await api().get(`/api/workshops/${w.id}/sessions`)).body).toHaveLength(3);
  });

  it('מחיר חובה בסדנה בתשלום', async () => {
    const res = await api().post('/api/workshops').send({ kind: 'WORKSHOP', name: 'x', isPaid: true });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.price).toBeTruthy();
  });
});

describe('הרשמה וסנכרון דו-כיווני', () => {
  it('רושם חבר, ורואים אותו גם בסדנה וגם בכרטיס החבר', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    expect((await register(w.id, m.id)).status).toBe(201);

    const regs = (await api().get(`/api/workshops/${w.id}/registrations`)).body;
    expect(regs).toHaveLength(1);
    expect(regs[0].memberId).toBe(m.id);
    const activity = (await api().get(`/api/members/${m.id}/activity`)).body;
    expect(activity).toHaveLength(1);
    expect(activity[0].workshopId).toBe(w.id);
    expect(activity[0].category).toBe('future');
    expect((await api().get('/api/members')).body.items[0].workshopCount).toBe(1);
    expect((await api().get(`/api/workshops/${w.id}`)).body.registrantCount).toBe(1);
  });

  it('מונע הרשמה כפולה פעילה, אך מאפשר הרשמה מחדש אחרי ביטול (היסטוריה נשמרת)', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const first = await register(w.id, m.id);
    const dup = await register(w.id, m.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_REGISTERED');

    expect((await api().post(`/api/registrations/${first.body.id}/cancel`).send({ reason: 'חולה' })).status).toBe(200);
    expect((await register(w.id, m.id)).status).toBe(201);
    const all = (await api().get(`/api/workshops/${w.id}/registrations`).query({ includeCancelled: 'true' })).body;
    expect(all).toHaveLength(2);
    expect(all.filter((r: { status: string }) => r.status === 'CANCELLED')).toHaveLength(1);
  });

  it('אילוץ מסד הנתונים חוסם הרשמה פעילה כפולה גם בלי שכבת השרת', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    await prisma.registration.create({ data: { memberId: m.id, workshopId: w.id } });
    await expect(prisma.registration.create({ data: { memberId: m.id, workshopId: w.id } })).rejects.toThrow();
  });

  it('ביטול הרשמה: סטטוס בוטל ותאריך ביטול, מופיע בחריגות ולא ברשימת הפעילים', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const r = await register(w.id, m.id);
    await api().post(`/api/registrations/${r.body.id}/cancel`).send({});
    expect((await api().get(`/api/workshops/${w.id}/registrations`)).body).toHaveLength(0);
    const activity = (await api().get(`/api/members/${m.id}/activity`)).body;
    expect(activity[0].registrationStatus).toBe('CANCELLED');
    expect(activity[0].cancelledAt).toBeTruthy();
    const ex = (await api().get(`/api/members/${m.id}/exceptions`)).body;
    expect(ex).toHaveLength(1);
    expect(ex[0].type).toBe('CANCELLATION');
    expect((await api().post(`/api/registrations/${r.body.id}/cancel`).send({})).status).toBe(409);
  });

  it('הגבלות: כללית וספציפית נאכפות בשרת, והסרה מחזירה את היכולת', async () => {
    const m = await mkMember();
    const w1 = await mkWorkshop({ name: 'א' });
    const w2 = await mkWorkshop({ name: 'ב' });

    const gen = await api().post(`/api/members/${m.id}/restrictions`).send({ reason: 'בדיקה' });
    expect(gen.body[0].scope).toBe('GENERAL');
    const blocked = await register(w1.id, m.id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RESTRICTED');
    await api().delete(`/api/members/${m.id}/restrictions/${gen.body[0].id}`);
    expect((await register(w1.id, m.id)).status).toBe(201);

    await api().post(`/api/members/${m.id}/restrictions`).send({ workshopId: w2.id });
    expect((await register(w2.id, m.id)).status).toBe(403);
    const list = (await api().get(`/api/members/${m.id}/restrictions`)).body;
    expect(list.filter((r: { active: boolean }) => r.active)).toHaveLength(1);
    expect(list).toHaveLength(2); // ההגבלה שהוסרה נשמרת כהיסטוריה
  });

  it('הרשמה סגורה / סדנה שהסתיימה / בוטלה', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    await api().put(`/api/workshops/${w.id}`).send({ registrationOpen: false });
    const closed = await register(w.id, m.id);
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('REGISTRATION_CLOSED');
    await api().put(`/api/workshops/${w.id}`).send({ registrationOpen: true, status: 'FINISHED' });
    expect((await register(w.id, m.id)).status).toBe(409);
  });

  it('התאמה לקריטריונים: מגדר, גיל, ביטוח לאומי, ונתון חסר חוסם', async () => {
    const w = await mkWorkshop({});
    await api().put(`/api/workshops/${w.id}`).send({ genderRestriction: 'FEMALE', minAge: 60, maxAge: 70, requireNationalInsurance: true });

    const man = await mkMember({ gender: 'MALE', nationalInsurance: true });
    expect((await register(w.id, man.id)).body.error.code).toBe('NOT_ELIGIBLE');

    const young = await mkMember({ birthYear: year - 40, nationalInsurance: true });
    const r1 = await register(w.id, young.id);
    expect(r1.status).toBe(422);
    expect(r1.body.error.message).toContain('גיל מינימלי');

    const old = await mkMember({ birthYear: year - 80, nationalInsurance: true });
    expect((await register(w.id, old.id)).status).toBe(422);

    const noNi = await mkMember({ nationalInsurance: false });
    expect((await register(w.id, noNi.id)).body.error.message).toContain('ביטוח לאומי');

    const noBirth = await mkMember({ birthYear: null, nationalInsurance: true });
    const r2 = await register(w.id, noBirth.id);
    expect(r2.status).toBe(422);
    expect(r2.body.error.message).toContain('חסרה שנת לידה');

    const noGender = await mkMember({ gender: null, nationalInsurance: true });
    expect((await register(w.id, noGender.id)).body.error.message).toContain('חסר מגדר');

    const ok = await mkMember({ nationalInsurance: true });
    expect((await register(w.id, ok.id)).status).toBe(201);
  });

  it('שאלות הרשמה: חובה נאכפת, תשובות נשמרות ונקראות מהרשמה', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const qs = (await api().post(`/api/workshops/${w.id}/questions`).send({ text: 'מה מידת הנעליים?', type: 'TEXT', required: true })).body;
    const qs2 = (await api().post(`/api/workshops/${w.id}/questions`).send({ text: 'העדפה', type: 'SINGLE_CHOICE', required: false, options: [{ label: 'א' }, { label: 'ב' }] })).body;
    expect(qs2).toHaveLength(2);
    const [qText, qChoice] = qs2;

    const missing = await register(w.id, m.id, []);
    expect(missing.status).toBe(422);
    expect(missing.body.error.details.errors[qText.id]).toBeTruthy();
    expect(qs).toHaveLength(1);

    const badOption = await register(w.id, m.id, [{ questionId: qText.id, textValue: '42' }, { questionId: qChoice.id, optionId: 999999 }]);
    expect(badOption.status).toBe(422);
    expect((await api().get(`/api/workshops/${w.id}/registrations`)).body).toHaveLength(0); // לא נוצרה הרשמה חלקית

    const ok = await register(w.id, m.id, [{ questionId: qText.id, textValue: '42' }, { questionId: qChoice.id, optionId: qChoice.options[1].id }]);
    expect(ok.status).toBe(201);
    const details = (await api().get(`/api/registrations/${ok.body.id}`)).body;
    expect(details.answers.find((a: { questionId: number }) => a.questionId === qText.id).answer).toBe('42');
    expect(details.answers.find((a: { questionId: number }) => a.questionId === qChoice.id).answer).toBe('ב');

    // לא ניתן למחוק שאלה שנענתה
    expect((await api().delete(`/api/questions/${qText.id}`)).status).toBe(409);
  });
});

describe('נוכחות', () => {
  it('תרחיש 7: סדנה בת 3 מפגשים, הגיע לשניים ולא הגיע לשלישי', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const reg = await register(w.id, m.id);
    const sessions = (await api().get(`/api/workshops/${w.id}/sessions`)).body;

    // טרם סומן: אין חריגת אי-הגעה
    expect((await api().get(`/api/members/${m.id}/exceptions`)).body).toHaveLength(0);
    const before = (await api().get(`/api/sessions/${sessions[0].id}/attendance`)).body;
    expect(before.rows[0].status).toBe('UNMARKED');

    await api().put(`/api/sessions/${sessions[0].id}/attendance`).send({ registrationId: reg.body.id, status: 'PRESENT' });
    await api().put(`/api/sessions/${sessions[1].id}/attendance`).send({ registrationId: reg.body.id, status: 'PRESENT' });
    const last = await api().put(`/api/sessions/${sessions[2].id}/attendance`).send({ registrationId: reg.body.id, status: 'ABSENT' });
    expect(last.body.summary).toMatchObject({ registered: 1, present: 0, absent: 1, unmarked: 0 });

    const activity = (await api().get(`/api/members/${m.id}/activity`)).body[0];
    expect(activity.attendance).toEqual({ present: 2, absent: 1, totalSessions: 3 });
    const detail = (await api().get(`/api/members/${m.id}/session-attendance`)).body;
    expect(detail.map((d: { status: string }) => d.status).sort()).toEqual(['ABSENT', 'PRESENT', 'PRESENT']);
    const ex = (await api().get(`/api/members/${m.id}/exceptions`)).body;
    expect(ex).toHaveLength(1);
    expect(ex[0].type).toBe('ABSENCE');

    // עדכון לאחר שמירה, וחזרה ל"טרם סומן"
    await api().put(`/api/sessions/${sessions[2].id}/attendance`).send({ registrationId: reg.body.id, status: 'PRESENT' });
    expect((await api().get(`/api/members/${m.id}/activity`)).body[0].attendance.present).toBe(3);
    await api().put(`/api/sessions/${sessions[2].id}/attendance`).send({ registrationId: reg.body.id, status: null });
    expect((await api().get(`/api/members/${m.id}/exceptions`)).body).toHaveLength(0);
  });

  it('לא ניתן להסיר מפגש שתועדה בו נוכחות, ולא לסמן נוכחות להרשמה מבוטלת', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    const reg = await register(w.id, m.id);
    const [s1] = (await api().get(`/api/workshops/${w.id}/sessions`)).body;
    await api().put(`/api/sessions/${s1.id}/attendance`).send({ registrationId: reg.body.id, status: 'PRESENT' });
    const del = await api().delete(`/api/sessions/${s1.id}`);
    expect(del.status).toBe(409);
    await api().post(`/api/registrations/${reg.body.id}/cancel`).send({});
    const mark = await api().put(`/api/sessions/${s1.id}/attendance`).send({ registrationId: reg.body.id, status: 'ABSENT' });
    expect(mark.status).toBe(409);
  });

  it('מונע סימון נוכחות להרשמה של סדנה אחרת', async () => {
    const m = await mkMember();
    const w1 = await mkWorkshop({ name: 'א' });
    const w2 = await mkWorkshop({ name: 'ב' });
    const reg = await register(w1.id, m.id);
    const [s2] = (await api().get(`/api/workshops/${w2.id}/sessions`)).body;
    expect((await api().put(`/api/sessions/${s2.id}/attendance`).send({ registrationId: reg.body.id, status: 'PRESENT' })).status).toBe(400);
  });
});

describe('דף רישום ציבורי', () => {
  it('לא חבר, חבר תקין, וללא חשיפת פרטים אישיים', async () => {
    const m = await mkMember({ firstName: 'סודי', lastName: 'מאוד' });
    const w = await mkWorkshop();
    await api().post(`/api/workshops/${w.id}/publish`);
    const q = (await api().post(`/api/workshops/${w.id}/questions`).send({ text: 'שאלה', type: 'TEXT', required: true })).body[0];

    const stranger = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: '0501234567' });
    expect(stranger.status).toBe(404);
    expect(stranger.body.error.code).toBe('NOT_A_MEMBER');

    const check = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone });
    expect(check.body).toEqual({ ok: true });
    expect(JSON.stringify(check.body)).not.toContain('סודי');

    const noAnswer = await api().post(`/api/public/workshops/${w.id}/register`).send({ phone: m.phone, answers: [] });
    expect(noAnswer.status).toBe(422);

    const ok = await api().post(`/api/public/workshops/${w.id}/register`).send({ phone: m.phone, answers: [{ questionId: q.id, textValue: 'תשובה' }] });
    expect(ok.status).toBe(201);
    expect(JSON.stringify(ok.body)).not.toContain('סודי');
    const regs = (await api().get(`/api/workshops/${w.id}/registrations`)).body;
    expect(regs).toHaveLength(1);
    expect(regs[0].source).toBe('PUBLIC');

    // הרשמה חוזרת וחסימות מחזירות הודעה כללית ולא חושפות פרטים
    const again = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('BLOCKED');
  });

  it('טיוטה לא ניתנת להרשמה ציבורית; הגבלה מחזירה הודעה כללית', async () => {
    const m = await mkMember();
    const w = await mkWorkshop();
    expect((await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone })).body.error.code).toBe('REGISTRATION_CLOSED');
    await api().post(`/api/workshops/${w.id}/publish`);
    await api().post(`/api/members/${m.id}/restrictions`).send({ reason: 'פנימי' });
    const res = await api().post(`/api/public/workshops/${w.id}/check`).send({ phone: m.phone });
    expect(res.body.error.code).toBe('BLOCKED');
    expect(JSON.stringify(res.body)).not.toContain('פנימי');
  });
});

describe('עמידות נתונים', () => {
  it('הנתונים נשמרים במסד הנתונים ונקראים מחדש בחיבור חדש', async () => {
    const m = await mkMember({ firstName: 'קבוע' });
    const w = await mkWorkshop();
    await register(w.id, m.id);
    await prisma.$disconnect();
    // ה-Client מתחבר מחדש אוטומטית; הנתונים נקראים מהקובץ
    const regs = await prisma.registration.count({ where: { memberId: m.id, status: 'ACTIVE' } });
    expect(regs).toBe(1);
  });
});
