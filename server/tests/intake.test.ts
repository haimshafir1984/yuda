import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { updateSettings } from '../src/intake/settings';
import { intakeSweep } from '../src/intake/intakeService';
import { addDays, parseDateOnly, todayDateOnly } from '../src/lib/dates';
import { demoProvider, setProvider } from '../src/messaging/provider';
import { runDueJobs } from '../src/messaging/scheduler';
import { ensureDefaultTemplates } from '../src/messaging/templates';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
let seq = 0;
const year = new Date().getFullYear();

const form = (over: Record<string, unknown> = {}) => {
  seq += 1;
  return {
    firstName: 'נועה',
    lastName: `מועמדת${seq}`,
    birthDate: `${year - 25}-06-15`,
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
    phone: `050-60000${String(seq).padStart(2, '0')}`,
    email: `n${seq}@example.com`,
    community: 'ליטאי',
    ...over,
  };
};
const join = async (over: Record<string, unknown> = {}) => {
  const r = await api().post('/api/public/join').send(form(over));
  expect(r.status).toBe(201);
  return r.body.id as number;
};
const cand = async (id: number) => (await api().get(`/api/intake/candidates/${id}`)).body;
const mkSession = async (daysAhead: number, time = '18:00') => (await api().post('/api/intake/sessions').send({ date: addDays(todayDateOnly(), daysAhead), startTime: time })).body as { id: number };
const outbox = (candidateId: number) => prisma.outboxMessage.findMany({ where: { candidateId }, orderBy: { id: 'asc' } });

/** מועמד שהוזמן, השתבץ לראיון והגיע */
async function attendedCandidate() {
  const s1 = await mkSession(10);
  await mkSession(20);
  const id = await join();
  await api().post(`/api/intake/candidates/${id}/invite-group`);
  const inv = (await cand(id)).invitations[0];
  const token = inv.link.split('/').pop();
  await api().post(`/api/public/invitations/${token}/respond`).send({ choice: String(s1.id) });
  const session = await api().get(`/api/intake/sessions/${s1.id}`);
  const signupId = session.body.signupsList[0].id as number;
  await api().post(`/api/intake/signups/${signupId}/attendance`).send({ attended: true });
  return { id, signupId, sessionId: s1.id, token };
}

beforeEach(async () => {
  await resetDb();
  await prisma.appSetting.deleteMany();
  await ensureDefaultTemplates();
  setProvider(demoProvider);
});

describe('טופס ההצטרפות', () => {
  it('יוצר כרטיס מועמדות חדש בלי להחזיר את תוצאת הסינון', async () => {
    const r = await api().post('/api/public/join').send(form());
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(['id', 'ok']);
    const c = await cand(r.body.id);
    expect(c).toMatchObject({ status: 'NEW', isRepeat: false, age: 25 });
    expect(c.events[0].type).toBe('SUBMITTED');
    expect(c.events[0].performedBy).toBeNull(); // פעולה של המועמד, לא של איש צוות
  });

  it('מאמת שדות חובה, טלפון ותאריך לידה, וחוסם בוטים (שדה פיתיון)', async () => {
    const bad = await api().post('/api/public/join').send({ firstName: 'א', birthDate: '2999-01-01', phone: '12' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details.fields)).toEqual(expect.arrayContaining(['lastName', 'birthDate', 'phone']));
    expect((await api().post('/api/public/join').send(form({ website: 'http://spam' }))).status).toBe(400);
    expect(await prisma.candidate.count()).toBe(0);
  });

  it('דחייה אוטומטית בגלל גיל: צעיר מדי ומבוגר מדי, עם הודעה', async () => {
    const young = await join({ birthDate: `${year - 12}-01-01` });
    const old = await join({ birthDate: `${year - 60}-01-01` });
    expect(await cand(young)).toMatchObject({ status: 'REJECTED', rejectionReason: 'AGE_YOUNG', outcomeCode: 'REJECT_AGE' });
    expect(await cand(old)).toMatchObject({ status: 'REJECTED', rejectionReason: 'AGE_OLD' });
    const msgs = await outbox(young);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ templateKey: 'intake.rejected.age', status: 'SENT' });
  });

  it('גילאי הקבלה ניתנים להגדרה', async () => {
    await updateSettings({ 'intake.minAge': '30' });
    expect((await cand(await join())).status).toBe('REJECTED'); // בן 25
    await updateSettings({ 'intake.minAge': '18', 'intake.maxAge': '24' });
    expect((await cand(await join())).rejectionReason).toBe('AGE_OLD');
  });

  it('בקשה חוזרת: מסומנת עם הכרטיס הקודם ומה שקרה בפעם הקודמת', async () => {
    const first = await join({ phone: '050-6111111' });
    const second = await join({ phone: '050-6111111' }); // הקודמת עדיין לא טופלה
    expect(await cand(second)).toMatchObject({ isRepeat: true, previousId: first, repeatReason: 'PREVIOUS_UNHANDLED' });
    await api().post(`/api/intake/candidates/${second}/reject`).send({ reason: 'NOT_HAREDI' });
    const third = await join({ phone: '050-6111111' });
    const c = await cand(third);
    expect(c).toMatchObject({ isRepeat: true, previousId: second, repeatReason: 'REJECT_BACKGROUND' });
    expect(c.previous.id).toBe(second);
  });

  it('זיהוי בקשה חוזרת גם לפי תעודת זהות', async () => {
    const first = await join({ nationalId: '123456789', phone: '050-6222222' });
    const second = await join({ nationalId: '123456789', phone: '050-6333333' });
    expect((await cand(second)).previousId).toBe(first);
  });
});

describe('סינון ושיחת בירור', () => {
  it('דחייה ידנית: "אחר" מחייב פירוט; נשלחת הודעה עם הסיבה; לא ניתן לדחות פעמיים', async () => {
    const id = await join();
    expect((await api().post(`/api/intake/candidates/${id}/reject`).send({ reason: 'OTHER' })).status).toBe(400);
    const r = await api().post(`/api/intake/candidates/${id}/reject`).send({ reason: 'OTHER', note: 'פנייה חוזרת ללא קשר לחצר' });
    expect(r.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'OTHER' });
    const msg = (await outbox(id))[0];
    expect(msg.templateKey).toBe('intake.rejected.screening');
    expect(msg.body).toContain('פנייה חוזרת ללא קשר לחצר');
    expect((await api().post(`/api/intake/candidates/${id}/reject`).send({ reason: 'NOT_HAREDI' })).status).toBe(409);
  });

  it('שיחת בירור: מתועדת, וממנה אפשר לדחות או להזמין לראיון', async () => {
    await mkSession(10);
    const a = await join();
    await api().post(`/api/intake/candidates/${a}/request-clarification`);
    expect((await cand(a)).status).toBe('AWAITING_CLARIFICATION');
    const called = await api().post(`/api/intake/candidates/${a}/call`).send({ summary: 'שוחחנו, נראה מתאים', result: 'INVITE_GROUP' });
    expect(called.body).toMatchObject({ status: 'INVITED_GROUP', callSummary: 'שוחחנו, נראה מתאים' });

    const b = await join();
    const rej = await api().post(`/api/intake/candidates/${b}/call`).send({ summary: 'לא מתאים', result: 'REJECT' });
    expect(rej.body).toMatchObject({ status: 'REJECTED', outcomeCode: 'REJECT_AFTER_CALL' });
    const c = await join();
    expect((await api().post(`/api/intake/candidates/${c}/call`).send({ summary: '' })).status).toBe(400); // סיכום שיחה חובה
  });

  it('אי אפשר להזמין לראיון קבוצתי כשאין מועדים עתידיים', async () => {
    const id = await join();
    const r = await api().post(`/api/intake/candidates/${id}/invite-group`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NO_SESSIONS');
    expect((await cand(id)).status).toBe('NEW');
  });
});

describe('ראיונות קבוצתיים והשתבצות', () => {
  it('ההזמנה כוללת את שני המועדים העתידיים הקרובים, והשם הוא חודש ושנה', async () => {
    const s1 = await mkSession(5);
    const s2 = await mkSession(12);
    await mkSession(30);
    const id = await join();
    const r = await api().post(`/api/intake/candidates/${id}/invite-group`);
    expect(r.body.status).toBe('INVITED_GROUP');
    const token = r.body.invitations[0].link.split('/').pop();
    const pub = await api().get(`/api/public/invitations/${token}`);
    expect(pub.body.options.map((o: { value: string }) => o.value)).toEqual([String(s1.id), String(s2.id)]);
    expect(pub.body.state).toBe('OPEN');
    const sessions = await api().get('/api/intake/sessions');
    expect(sessions.body[0].name).toMatch(/\d{4}$/);
    expect((await outbox(id))[0].body).toContain(`/invite/${token}`);
  });

  it('לא ניתן לקבוע ראיון בתאריך שעבר', async () => {
    const r = await api().post('/api/intake/sessions').send({ date: addDays(todayDateOnly(), -1) });
    expect(r.status).toBe(400);
  });

  it('השתבצות: נוצרת רשומה, נשלח אישור ומתוזמנות תזכורות (3 ימים לפני ובבוקר)', async () => {
    const s = await mkSession(10);
    const id = await join();
    await api().post(`/api/intake/candidates/${id}/invite-group`);
    const token = (await cand(id)).invitations[0].link.split('/').pop();
    const r = await api().post(`/api/public/invitations/${token}/respond`).send({ choice: String(s.id) });
    expect(r.body).toMatchObject({ ok: true, signed: true });
    expect((await api().get(`/api/intake/sessions/${s.id}`)).body.signups).toBe(1);
    expect((await outbox(id)).map((m) => m.templateKey)).toEqual(['intake.invite.group', 'intake.signup.confirmed']);
    const jobs = await prisma.scheduledJob.findMany({ where: { type: 'intake.reminder' } });
    expect(jobs.map((j) => JSON.parse(j.payload).kind).sort()).toEqual(['group3d', 'groupMorning']);
    // לא ניתן להשתבץ שוב, ומועד לא מוצע נדחה
    expect((await api().post(`/api/public/invitations/${token}/respond`).send({ choice: String(s.id) })).status).toBe(409);
  });

  it('בחירת מועד שלא הוצע נדחית; כתיבת הערה בלי להשתבץ נשמרת ומאפשרת להשתבץ אחר כך', async () => {
    const s = await mkSession(8);
    const id = await join();
    await api().post(`/api/intake/candidates/${id}/invite-group`);
    const token = (await cand(id)).invitations[0].link.split('/').pop();
    expect((await api().post(`/api/public/invitations/${token}/respond`).send({ choice: '99999' })).status).toBe(400);
    expect((await api().post(`/api/public/invitations/${token}/respond`).send({})).status).toBe(400);
    const note = await api().post(`/api/public/invitations/${token}/respond`).send({ note: 'לא מתאים לי השבוע' });
    expect(note.body.signed).toBe(false);
    expect((await cand(id)).invitations[0]).toMatchObject({ response: 'NOTE', note: 'לא מתאים לי השבוע' });
    expect((await api().post(`/api/public/invitations/${token}/respond`).send({ choice: String(s.id) })).body.signed).toBe(true);
  });

  it('קישור הזמנה לא קיים: 404', async () => {
    expect((await api().get('/api/public/invitations/nope')).status).toBe(404);
  });

  it('תזכורת מתוזמנת נשלחת, ולא נשלחת אם המועמד כבר לא ממתין לראיון', async () => {
    const { id } = await attendedCandidate();
    const future = new Date(Date.now() + 60 * 86_400_000);
    await runDueJobs(future);
    const keys = (await outbox(id)).map((m) => m.templateKey);
    expect(keys).toEqual(expect.arrayContaining(['intake.reminder.group3d', 'intake.reminder.groupMorning']));
  });

  it('תזכורת לא נשלחת למי שנדחה בינתיים', async () => {
    const { id, signupId } = await attendedCandidate();
    await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'REJECT' });
    const before = (await outbox(id)).length;
    await runDueJobs(new Date(Date.now() + 60 * 86_400_000));
    expect((await outbox(id)).length).toBe(before);
  });
});

describe('נוכחות ושאלון היכרות', () => {
  it('שאלון נשלח רק למי שסומן שהגיע, פעם אחת, והמועמד ממלא בקישור אישי', async () => {
    const { id, sessionId } = await attendedCandidate();
    // מועמד שני שלא הגיע
    const id2 = await join();
    await api().post(`/api/intake/candidates/${id2}/invite-group`);
    const t2 = (await cand(id2)).invitations[0].link.split('/').pop();
    await api().post(`/api/public/invitations/${t2}/respond`).send({ choice: String(sessionId) });
    const signups = (await api().get(`/api/intake/sessions/${sessionId}`)).body.signupsList;
    await api().post(`/api/intake/signups/${signups[1].id}/attendance`).send({ attended: false });

    const first = await api().post(`/api/intake/sessions/${sessionId}/send-questionnaires`);
    expect(first.body.sent).toBe(1);
    expect((await api().post(`/api/intake/sessions/${sessionId}/send-questionnaires`)).body.sent).toBe(0);
    expect((await outbox(id2)).some((m) => m.templateKey === 'intake.questionnaire')).toBe(false);

    const link = (await cand(id)).questionnaires[0].link as string;
    const tok = link.split('/').pop();
    expect((await api().get(`/api/public/questionnaires/${tok}`)).body).toMatchObject({ filled: false });
    expect((await api().post(`/api/public/questionnaires/${tok}`).send({})).status).toBe(400); // חסר "מה את/ה עושה כיום"
    const ok = await api().post(`/api/public/questionnaires/${tok}`).send({ nowDoing: 'WORKING', workplace: 'מאפייה', jobPercent: 'FULL', livesWith: ['ALONE'], challenges: ['LONELINESS', 'STUDIES'], familyRelation: 3, siblings: 5 });
    expect(ok.status).toBe(200);
    expect((await api().post(`/api/public/questionnaires/${tok}`).send({ nowDoing: 'WORKING' })).status).toBe(409);
    const c = await cand(id);
    expect(c.questionnaires[0].answers).toMatchObject({ nowDoing: 'WORKING', workplace: 'מאפייה', challenges: ['LONELINESS', 'STUDIES'], familyRelation: 3 });
  });
});

describe('החלטות אחרי ראיון קבוצתי', () => {
  it('לא הגיע: עובר ל"באוויר"', async () => {
    const { id, signupId } = await attendedCandidate();
    const r = await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'NO_SHOW' });
    expect(r.status).toBe(200);
    expect(await cand(id)).toMatchObject({ status: 'AIR', outcomeCode: 'SIGNED_NOT_ATTENDED' });
  });

  it('דחייה: נשלחת הודעה קבועה', async () => {
    const { id, signupId } = await attendedCandidate();
    await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'REJECT' });
    expect(await cand(id)).toMatchObject({ status: 'REJECTED', outcomeCode: 'REJECT_AFTER_GROUP' });
    expect((await outbox(id)).some((m) => m.templateKey === 'intake.rejected.group')).toBe(true);
  });

  it('קבלה: נוצר כרטיס חבר עם הנתונים, ונשלחת הודעה עם קוד הכניסה וקישור הווטסאפ', async () => {
    await updateSettings({ 'intake.entryCode': '4321', 'intake.whatsappLink': 'https://chat.example/abc' });
    const { id, signupId } = await attendedCandidate();
    const r = await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'ACCEPT' });
    expect(r.status).toBe(200);
    const c = await cand(id);
    expect(c.status).toBe('ACCEPTED');
    expect(c.memberId).toBeTruthy();
    const member = (await api().get(`/api/members/${c.memberId}`)).body;
    expect(member).toMatchObject({ firstName: 'נועה', gender: 'FEMALE', status: 'ACTIVE', birthYear: year - 25 });
    const accepted = (await outbox(id)).find((m) => m.templateKey === 'intake.accepted')!;
    expect(accepted.body).toContain('4321');
    expect(accepted.body).toContain('https://chat.example/abc');
    // הכרטיס נראה מכרטיס החבר
    expect((await api().get(`/api/members/${c.memberId}/intake`)).body.id).toBe(id);
    // אי אפשר להחליט שוב
    expect((await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'REJECT' })).status).toBe(409);
  });

  it('קבלה של מי שכבר חבר קיים (לפי ת"ז) לא יוצרת כפילות', async () => {
    const existing = await api().post('/api/members').send({ firstName: 'ותיקה', lastName: 'קיימת', phone: '052-0000001', nationalId: '555555555' });
    const s = await mkSession(10);
    const id = await join({ nationalId: '555555555', phone: '050-6999999' });
    await api().post(`/api/intake/candidates/${id}/invite-group`);
    const tok = (await cand(id)).invitations[0].link.split('/').pop();
    await api().post(`/api/public/invitations/${tok}/respond`).send({ choice: String(s.id) });
    const signupId = (await api().get(`/api/intake/sessions/${s.id}`)).body.signupsList[0].id;
    await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'ACCEPT' });
    expect((await cand(id)).memberId).toBe(existing.body.id);
    expect(await prisma.member.count()).toBe(1);
  });

  it('הזמנה לפגישה אישית דורשת מועדים עתידיים', async () => {
    const { signupId } = await attendedCandidate();
    expect((await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'PERSONAL' })).status).toBe(400);
    const past = await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'PERSONAL', slots: ['2020-01-01T10:00'] });
    expect(past.status).toBe(400);
  });
});

describe('פגישה אישית לבירור נוסף', () => {
  const slot = (days: number, time = '10:00') => `${addDays(todayDateOnly(), days)}T${time}`;

  async function personal() {
    const base = await attendedCandidate();
    await api().post(`/api/intake/signups/${base.signupId}/decision`).send({ decision: 'PERSONAL', slots: [slot(5), slot(6, '11:30')] });
    const c = await cand(base.id);
    return { ...base, token: c.invitations[0].link.split('/').pop() as string };
  }

  it('הזמנה, בחירת מועד על ידי המועמד, ותזכורת באותו יום', async () => {
    const p = await personal();
    expect((await cand(p.id)).status).toBe('AWAITING_PERSONAL');
    const info = await api().get(`/api/public/invitations/${p.token}`);
    expect(info.body.kind).toBe('PERSONAL');
    expect(info.body.options).toHaveLength(2);
    const r = await api().post(`/api/public/invitations/${p.token}/respond`).send({ choice: slot(6, '11:30') });
    expect(r.body.signed).toBe(true);
    const c = await cand(p.id);
    expect(c.meetings[0].scheduledAt).toBeTruthy();
    expect((await prisma.scheduledJob.findMany({ where: { type: 'intake.reminder' } })).some((j) => JSON.parse(j.payload).kind === 'personal')).toBe(true);
    expect((await outbox(p.id)).some((m) => m.templateKey === 'intake.meeting.confirmed')).toBe(true);
  });

  it('החלטה: הודעות לא נשלחות אוטומטית אלא לפי סימון הרכז', async () => {
    const p = await personal();
    await api().post(`/api/intake/candidates/${p.id}/meeting`).send({ scheduledAt: slot(5) });
    const before = (await outbox(p.id)).length;
    const r = await api().post(`/api/intake/candidates/${p.id}/personal-decision`).send({ decision: 'ACCEPT', sendMessage: false });
    expect(r.body.status).toBe('ACCEPTED');
    expect(r.body.memberId).toBeTruthy();
    expect((await outbox(p.id)).length).toBe(before); // לא נשלחה הודעת קבלה
  });

  it('"כרגע לא מתאים" עובר ל"יתאים בעתיד", ודחייה נשלחת רק כשסומן', async () => {
    const p = await personal();
    await api().post(`/api/intake/candidates/${p.id}/meeting`).send({ scheduledAt: slot(5) });
    const r = await api().post(`/api/intake/candidates/${p.id}/personal-decision`).send({ decision: 'NOT_NOW', sendMessage: true });
    expect(r.body).toMatchObject({ status: 'MAYBE_FUTURE', outcomeCode: 'TEMP_REJECT' });
    expect((await outbox(p.id)).some((m) => m.templateKey === 'intake.notnow')).toBe(true);

    const q = await personal();
    await api().post(`/api/intake/candidates/${q.id}/meeting`).send({ scheduledAt: slot(5) });
    const rej = await api().post(`/api/intake/candidates/${q.id}/personal-decision`).send({ decision: 'REJECT' });
    expect(rej.body).toMatchObject({ status: 'REJECTED', outcomeCode: 'REJECT_AFTER_PERSONAL' });
    expect((await outbox(q.id)).some((m) => m.templateKey === 'intake.rejected.personal')).toBe(false);
  });

  it('החלטה בלי שנקבע מועד נדחית; אי-הגעה עוברת ל"באוויר"', async () => {
    const p = await personal();
    expect((await api().post(`/api/intake/candidates/${p.id}/personal-decision`).send({ decision: 'REJECT' })).status).toBe(409);
    await api().post(`/api/intake/candidates/${p.id}/meeting`).send({ scheduledAt: slot(5) });
    await api().post(`/api/intake/candidates/${p.id}/meeting/held`);
    expect((await cand(p.id)).meetings[0].heldAt).toBeTruthy();
    const ns = await api().post(`/api/intake/candidates/${p.id}/meeting/no-show`);
    expect(ns.body).toMatchObject({ status: 'AIR', outcomeCode: 'PERSONAL_NO_SHOW' });
  });
});

describe('באוויר, התנדף ותזכורות לרכז', () => {
  it('הוזמן ולא השתבץ: אחרי שבוע "באוויר", ואחרי שבועיים נוספים "התנדף"', async () => {
    await mkSession(10);
    const id = await join();
    await api().post(`/api/intake/candidates/${id}/invite-group`);
    expect((await intakeSweep()).toAir).toBe(0); // עוד לא עבר זמן
    await prisma.candidateInvitation.updateMany({ where: { candidateId: id }, data: { sentAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect((await intakeSweep()).toAir).toBe(1);
    expect(await cand(id)).toMatchObject({ status: 'AIR', outcomeCode: 'INVITED_NOT_SIGNED' });
    await prisma.candidate.update({ where: { id }, data: { statusChangedAt: new Date(Date.now() - 15 * 86_400_000) } });
    expect((await intakeSweep()).toFaded).toBe(1);
    expect((await cand(id)).status).toBe('FADED');
  });

  it('מי שהשתבץ לא עובר ל"באוויר" בסריקה', async () => {
    const { id } = await attendedCandidate();
    await prisma.candidateInvitation.updateMany({ where: { candidateId: id }, data: { sentAt: new Date(Date.now() - 30 * 86_400_000) } });
    await intakeSweep();
    expect((await cand(id)).status).toBe('INVITED_GROUP');
  });

  it('הוזמן לפגישה אישית ולא קבע מועד: "באוויר"', async () => {
    const { id, signupId } = await attendedCandidate();
    await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'PERSONAL', slots: [`${addDays(todayDateOnly(), 5)}T10:00`] });
    await prisma.candidateInvitation.updateMany({ where: { candidateId: id, kind: 'PERSONAL' }, data: { sentAt: new Date(Date.now() - 9 * 86_400_000) } });
    await intakeSweep();
    expect(await cand(id)).toMatchObject({ status: 'AIR', outcomeCode: 'PERSONAL_NOT_SCHEDULED' });
  });

  it('בקשה חוזרת של מי שהיה "באוויר" מציגה את מה שקרה בפעם הקודמת', async () => {
    const { id, signupId } = await attendedCandidate();
    await api().post(`/api/intake/signups/${signupId}/decision`).send({ decision: 'NO_SHOW' });
    const phone = (await cand(id)).phone;
    const again = await join({ phone });
    expect((await cand(again)).repeatReason).toBe('SIGNED_NOT_ATTENDED');
  });

  it('תזכורות לרכז: לא טופל 10 ימים, החלטות שלא סומנו 7 ימים אחרי ראיון, ופחות משני ראיונות עתידיים', async () => {
    const id = await join();
    await prisma.candidate.update({ where: { id }, data: { submittedAt: new Date(Date.now() - 11 * 86_400_000) } });
    const none = await api().get('/api/intake/summary');
    expect(none.body.alerts.unhandled.map((x: { id: number }) => x.id)).toEqual([id]);
    expect(none.body.alerts).toMatchObject({ futureSessions: 0, needMoreSessions: true });

    const { id: attendedId, sessionId } = await attendedCandidate();
    await prisma.interviewSession.update({ where: { id: sessionId }, data: { date: parseDateOnly(addDays(todayDateOnly(), -8)) } });
    const a = (await api().get('/api/intake/summary')).body.alerts;
    expect(a.undecidedSessions).toHaveLength(1);
    expect(a.undecidedSessions[0].pending).toBe(1);
    expect(attendedId).toBeTruthy();

    await mkSession(3);
    await mkSession(9);
    expect((await api().get('/api/intake/summary')).body.alerts.needMoreSessions).toBe(false);
  });

  it('סיכום לפי סטטוס', async () => {
    await join();
    await join({ birthDate: `${year - 10}-01-01` });
    const s = (await api().get('/api/intake/summary')).body.counts;
    expect(s).toMatchObject({ NEW: 1, REJECTED: 1, AIR: 0 });
  });
});

describe('רשימה, מעקב והגדרות', () => {
  it('חיפוש וסינון לפי סטטוס ובקשות חוזרות', async () => {
    const a = await join({ lastName: 'כהנא', phone: '050-6444444' });
    await join({ lastName: 'לוי' });
    await join({ lastName: 'כהנא', phone: '050-6444444' });
    expect((await api().get('/api/intake/candidates?q=כהנא')).body).toHaveLength(2);
    expect((await api().get('/api/intake/candidates?repeat=true')).body).toHaveLength(1);
    await api().post(`/api/intake/candidates/${a}/reject`).send({ reason: 'NOT_HAREDI' });
    expect((await api().get('/api/intake/candidates?status=REJECTED')).body).toHaveLength(1);
  });

  it('שיוך לרכז קבלה', async () => {
    const id = await join();
    const r = await api().post(`/api/intake/candidates/${id}/assign`).send({ coordinator: 'שיפי לוי' });
    expect(r.body.coordinator).toBe('שיפי לוי');
  });

  it('הגדרות: עדכון, ולידציה (מספר תקין, מינימום לא גדול ממקסימום)', async () => {
    expect((await api().put('/api/intake/settings').send({ 'intake.minAge': 'abc' })).status).toBe(400);
    expect((await api().put('/api/intake/settings').send({ 'intake.minAge': '50', 'intake.maxAge': '30' })).status).toBe(400);
    const ok = await api().put('/api/intake/settings').send({ 'intake.entryCode': '9876' });
    expect(ok.body['intake.entryCode']).toBe('9876');
    expect((await api().get('/api/intake/settings')).body['intake.minAge']).toBe('18');
  });

  it('מעקב חברים חדשים: מי השתתף ומי לא', async () => {
    const m = (await api().post('/api/members').send({ firstName: 'חדש', lastName: 'בחצר', phone: '052-7000001' })).body;
    const rows = (await api().get('/api/intake/new-members')).body;
    expect(rows.find((x: { id: number }) => x.id === m.id)).toMatchObject({ present: 0, level: 'NONE' });
  });
});

describe('הרשאות קבלת חברים', () => {
  const as = async (role: string) => {
    process.env.AUTH_DISABLED = '0';
    const u = await prisma.appUser.create({ data: { name: `${role}-קבלה`, role } });
    return String(u.id);
  };

  it('דף ההצטרפות והקישורים האישיים פתוחים בלי כניסה; ממשק הצוות דורש הרשאה', async () => {
    const coord = await as('INTAKE_COORDINATOR');
    const nurse = await as('NURSE');
    const lead = await as('LEAD_SOCIAL_WORKER');
    try {
      expect((await api().post('/api/public/join').send(form())).status).toBe(201); // בלי משתמש
      expect((await api().get('/api/intake/candidates')).status).toBe(401);
      expect((await api().get('/api/intake/candidates').set('x-demo-user', nurse)).status).toBe(403);
      expect((await api().get('/api/intake/candidates').set('x-demo-user', coord)).status).toBe(200);
      expect((await api().get('/api/intake/candidates').set('x-demo-user', lead)).status).toBe(200); // צפייה
      const id = (await prisma.candidate.findFirstOrThrow()).id;
      expect((await api().post(`/api/intake/candidates/${id}/reject`).set('x-demo-user', lead).send({ reason: 'NOT_HAREDI' })).status).toBe(403);
      expect((await api().post(`/api/intake/candidates/${id}/reject`).set('x-demo-user', coord).send({ reason: 'NOT_HAREDI' })).status).toBe(200);
    } finally {
      process.env.AUTH_DISABLED = '1';
    }
  });
});
