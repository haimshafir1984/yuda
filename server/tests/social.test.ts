import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
let seq = 0;

const mkMember = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/members').send({ firstName: 'חבר', lastName: `ליווי${seq}`, phone: `053-90000${String(seq).padStart(2, '0')}`, ...over });
  return r.body.id as number;
};
const mkRequest = async (memberId: number, over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/service-requests').send({ memberId, type: 'SUPPORT', subject: `פנייה ${seq}`, description: 'תיאור בדוי', ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number; memberId: number };
};
const mkProcess = async (memberId: number, over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/social-work/processes').send({ memberId, kinds: ['SUPPORT'], type: 'ONGOING', goal: `מטרה ${seq}`, socialWorker: 'אורית לביא', ...over });
  return r;
};
const mkTreatment = async (memberId: number) => {
  seq += 1;
  const th = (await api().post('/api/therapists').send({ fullName: `מטפל ${seq}`, type: 'PRIVATE', pricePerSession: 300 })).body.id;
  const t = await api().post('/api/treatments').send({ memberId, approvedSessions: 10, copayPerSession: 20, socialWorker: 'אורית לביא', yehudaApproval: true, track: 'PRIVATE', therapistId: th });
  return t.body.id as number;
};
const meeting = (pid: number, over: Record<string, unknown> = {}) =>
  api().post(`/api/social-work/processes/${pid}/meetings`).send({ date: '2026-10-20', time: '10:00', subject: 'פגישה', mode: 'FACE', durationMinutes: 45, summary: 'סיכום בדוי', followUpRequired: false, ...over });

beforeEach(resetDb);

describe('פניות', () => {
  it('יוצרת פנייה עם היסטוריה, ומציגה בכרטיס החבר', async () => {
    const m = await mkMember();
    const r = await mkRequest(m, { assignee: 'רונית כץ', priority: 'HIGH' });
    const card = (await api().get(`/api/service-requests/${r.id}`)).body;
    expect(card).toMatchObject({ status: 'NEW', priority: 'HIGH', assignee: 'רונית כץ', source: 'MANUAL' });
    const events = (await api().get(`/api/service-requests/${r.id}/events`)).body;
    expect(events.map((e: { type: string }) => e.type).sort()).toEqual(['ASSIGNED', 'CREATED']);
    expect((await api().get(`/api/members/${m}/service-requests`)).body).toHaveLength(1);
  });

  it('אימות: חבר, סוג ונושא חובה; חבר לא קיים נדחה', async () => {
    const bad = await api().post('/api/service-requests').send({ subject: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.memberId).toBeTruthy();
    expect(bad.body.error.details.fields.subject).toBeTruthy();
    expect((await api().post('/api/service-requests').send({ memberId: 99999, type: 'OTHER', subject: 'x' })).status).toBe(404);
  });

  it('מונעת יצירה כפולה מלחיצה חוזרת', async () => {
    const m = await mkMember();
    const body = { memberId: m, type: 'RIGHTS', subject: 'אותו נושא בדיוק' };
    const a = await api().post('/api/service-requests').send(body);
    const b = await api().post('/api/service-requests').send(body);
    expect(b.body.id).toBe(a.body.id);
    expect((await api().get(`/api/members/${m}/service-requests`)).body).toHaveLength(1);
  });

  it('עריכה, שיוך, סטטוס, הערה, שיחה והחלטה נשמרים בהיסטוריה', async () => {
    const r = await mkRequest(await mkMember());
    await api().put(`/api/service-requests/${r.id}`).send({ subject: 'נושא חדש', priority: 'URGENT' });
    await api().post(`/api/service-requests/${r.id}/assign`).send({ assignee: 'שירה אדלר' });
    expect((await api().post(`/api/service-requests/${r.id}/assign`).send({ assignee: 'שירה אדלר' })).status).toBe(409);
    const st = await api().post(`/api/service-requests/${r.id}/status`).send({ status: 'REVIEW' });
    expect(st.body.status).toBe('REVIEW');
    await api().post(`/api/service-requests/${r.id}/notes`).send({ text: 'הערת טיפול' });
    await api().post(`/api/service-requests/${r.id}/contacts`).send({ text: 'שיחה עם החבר', mode: 'PHONE' });
    const dec = await api().post(`/api/service-requests/${r.id}/decision`).send({ decision: 'SOCIAL_WORK_NEEDED' });
    expect(dec.body.decision).toBe('SOCIAL_WORK_NEEDED');
    expect(dec.body.status).toBe('REVIEW'); // החלטה אינה סוגרת
    const events = (await api().get(`/api/service-requests/${r.id}/events`)).body;
    expect(events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['EDITED', 'ASSIGNED', 'STATUS_CHANGE', 'NOTE', 'CONTACT', 'DECISION']));
    const change = events.find((e: { type: string }) => e.type === 'STATUS_CHANGE');
    expect(change).toMatchObject({ fromStatus: 'NEW', toStatus: 'REVIEW' });
    expect((await api().get(`/api/service-requests/${r.id}`)).body).toMatchObject({ subject: 'נושא חדש', priority: 'URGENT', assignee: 'שירה אדלר' });
  });

  it('סגירה דורשת סיבה, והפנייה לא נמחקת', async () => {
    const r = await mkRequest(await mkMember());
    const no = await api().post(`/api/service-requests/${r.id}/status`).send({ status: 'CLOSED' });
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe('REASON_REQUIRED');
    const ok = await api().post(`/api/service-requests/${r.id}/status`).send({ status: 'CLOSED', reason: 'ניתן מענה' });
    expect(ok.body).toMatchObject({ status: 'CLOSED', closeReason: 'ניתן מענה' });
    expect((await api().get('/api/service-requests').query({ status: 'CLOSED' })).body).toHaveLength(1);
  });

  it('חיפוש וסינון: חבר, מספר, סטטוס, סוג, אחראי ותאריך', async () => {
    const m1 = await mkMember({ firstName: 'ייחודי' });
    const m2 = await mkMember();
    const a = await mkRequest(m1, { type: 'RIGHTS', assignee: 'אורית לביא', openedAt: '2026-01-10' });
    await mkRequest(m2, { type: 'HEALTH', openedAt: '2026-03-10' });
    const list = (query: Record<string, string>) => api().get('/api/service-requests').query(query).then((x) => x.body as { id: number }[]);
    expect((await list({ q: 'ייחודי' })).map((x) => x.id)).toEqual([a.id]);
    expect((await list({ q: String(a.id) })).map((x) => x.id)).toEqual([a.id]);
    expect(await list({ type: 'HEALTH' })).toHaveLength(1);
    expect(await list({ assignee: 'אורית לביא' })).toHaveLength(1);
    expect(await list({ from: '2026-02-01' })).toHaveLength(1);
    expect(await list({ to: '2026-02-01' })).toHaveLength(1);
    expect(await list({ status: 'NEW', sort: 'member', order: 'asc' })).toHaveLength(2);
  });
});

describe('ליווי עו"ס', () => {
  it('פותח תהליך, מציג ביטוח לאומי מכרטיס החבר ומונע קישור לחבר אחר', async () => {
    const m = await mkMember({ nationalInsurance: true });
    const p = (await mkProcess(m, { kinds: ['RIGHTS', 'EMOTIONAL'] })).body;
    expect(p).toMatchObject({ status: 'NOT_STARTED', nationalInsurance: true, kinds: ['RIGHTS', 'EMOTIONAL'], meetingCount: 0 });
    expect((await mkProcess(m, { kinds: [] })).status).toBe(400);
    expect((await mkProcess(99999)).status).toBe(404);
    expect((await api().get(`/api/members/${m}/social-work`)).body).toHaveLength(1);
  });

  it('פגישות: הוספה, עריכה עם תיעוד, ספירה אוטומטית והצעת שינוי סוג', async () => {
    const p = (await mkProcess(await mkMember(), { type: 'ONE_TIME' })).body; // סוג ידני: מוצגת הצעה בלבד
    expect(p.typeManual).toBe(true);
    await api().post(`/api/social-work/processes/${p.id}/activate`);
    const m1 = (await meeting(p.id, { subject: 'ראשונה' })).body;
    await meeting(p.id, { date: '2026-10-21', subject: 'שנייה' });
    expect((await api().get(`/api/social-work/processes/${p.id}`)).body).toMatchObject({ meetingCount: 2, suggestedType: null });
    await meeting(p.id, { date: '2026-10-22', subject: 'שלישית' });
    expect((await api().get(`/api/social-work/processes/${p.id}`)).body).toMatchObject({ meetingCount: 3, type: 'ONE_TIME', suggestedType: 'ONGOING' });
    const upd = await api().put(`/api/social-work/processes/${p.id}`).send({ type: 'ONGOING' });
    expect(upd.body.suggestedType).toBeNull();

    const edited = await api().put(`/api/social-work/meetings/${m1.find((x: { subject: string }) => x.subject === 'ראשונה').id}`).send({ date: '2026-10-20', time: '11:30', subject: 'ראשונה', mode: 'PHONE', summary: 'עודכן', followUpRequired: true });
    expect(edited.body.find((x: { subject: string }) => x.subject === 'ראשונה')).toMatchObject({ time: '11:30', mode: 'PHONE', followUpRequired: true });
    const events = (await api().get(`/api/social-work/processes/${p.id}/events`)).body;
    expect(events.some((e: { type: string }) => e.type === 'MEETING_EDITED')).toBe(true);
    expect(events.filter((e: { type: string }) => e.type === 'MEETING_ADDED')).toHaveLength(3);
    // נושא ריק: ברירת מחדל לפי מהות התהליך (תמיכה וליווי)
    const def = await meeting(p.id, { subject: '', date: '2026-10-23' });
    expect(def.status).toBe(201);
    expect(def.body.some((x: { subject: string }) => x.subject === 'תמיכה וליווי')).toBe(true);
    expect((await meeting(p.id, { durationMinutes: 0 })).status).toBe(400);
  });

  it('סטטוסים: הפעלה, הקפאה, סיום (סיבה וסיכום חובה), פתיחה מחדש עם שמירת היסטוריה', async () => {
    const p = (await mkProcess(await mkMember())).body;
    expect((await api().post(`/api/social-work/processes/${p.id}/freeze`)).status).toBe(409); // לא פעיל עדיין
    expect((await api().post(`/api/social-work/processes/${p.id}/activate`)).body.status).toBe('ACTIVE');
    expect((await api().post(`/api/social-work/processes/${p.id}/activate`)).status).toBe(409); // לחיצה כפולה
    expect((await api().post(`/api/social-work/processes/${p.id}/freeze`).send({ note: 'חופשה' })).body.status).toBe('FROZEN');
    expect((await api().post(`/api/social-work/processes/${p.id}/unfreeze`)).body.status).toBe('ACTIVE');
    await meeting(p.id);

    expect((await api().post(`/api/social-work/processes/${p.id}/finish`).send({ reason: 'COMPLETED' })).status).toBe(400);
    const fin = await api().post(`/api/social-work/processes/${p.id}/finish`).send({ reason: 'GOAL_ACHIEVED', summary: 'סיכום סיום', endDate: '2026-10-25' });
    expect(fin.body).toMatchObject({ status: 'FINISHED', endDate: '2026-10-25', endReason: 'GOAL_ACHIEVED', endSummary: 'סיכום סיום' });
    expect((await meeting(p.id)).status).toBe(409); // אי אפשר להוסיף פגישה בתהליך שהסתיים

    const re = await api().post(`/api/social-work/processes/${p.id}/reopen`).send({ note: 'פנייה חוזרת' });
    expect(re.body).toMatchObject({ status: 'ACTIVE', endDate: null, meetingCount: 1 });
    expect((await meeting(p.id, { subject: 'אחרי פתיחה מחדש' })).status).toBe(201);
    const events = (await api().get(`/api/social-work/processes/${p.id}/events`)).body;
    expect(events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['OPENED', 'ACTIVATED', 'FROZEN', 'UNFROZEN', 'FINISHED', 'REOPENED']));
    expect((await api().get(`/api/social-work/processes/${p.id}/meetings`)).body).toHaveLength(2);
  });

  it('התערבויות ודוחות: יצירה ועריכה; קישור לשפ"ח רק של אותו חבר', async () => {
    const m = await mkMember();
    const other = await mkMember();
    const p = (await mkProcess(m)).body;
    const own = await mkTreatment(m);
    const foreign = await mkTreatment(other);
    const ok = await api().post(`/api/social-work/processes/${p.id}/interventions`).send({ date: '2026-10-20', type: 'RIGHTS_ASSIST', description: 'סיוע בבדיקת זכאות', involved: 'ביטוח לאומי', status: 'IN_PROGRESS', treatmentId: own });
    expect(ok.status).toBe(201);
    expect(ok.body[0]).toMatchObject({ type: 'RIGHTS_ASSIST', status: 'IN_PROGRESS', treatmentId: own });
    const bad = await api().post(`/api/social-work/processes/${p.id}/interventions`).send({ date: '2026-10-20', type: 'OTHER', description: 'x', treatmentId: foreign });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('CROSS_MEMBER');
    const done = await api().put(`/api/social-work/interventions/${ok.body[0].id}`).send({ date: '2026-10-20', type: 'RIGHTS_ASSIST', description: 'סיוע בבדיקת זכאות', status: 'DONE' });
    expect(done.body[0].status).toBe('DONE');

    const rep = await api().post(`/api/social-work/processes/${p.id}/reports`).send({ type: 'PERIODIC', date: '2026-10-25', title: 'סיכום תקופתי', content: 'תוכן' });
    expect(rep.body).toHaveLength(1);
    const upd = await api().put(`/api/social-work/reports/${rep.body[0].id}`).send({ type: 'CLOSING', date: '2026-10-26', title: 'סיום', content: 'עודכן' });
    expect(upd.body[0]).toMatchObject({ type: 'CLOSING', title: 'סיום' });
  });
});

describe('קשרים בין מודולים', () => {
  it('פתיחת ליווי מפנייה: משייכת חבר ופנייה, ומונעת יצירה כפולה', async () => {
    const m = await mkMember();
    const r = await mkRequest(m);
    const opened = await api().post(`/api/service-requests/${r.id}/open-social-work`).send({ kinds: ['SUPPORT'], type: 'ONGOING', goal: 'ליווי מהפנייה', socialWorker: 'רונית כץ' });
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ memberId: m, requestId: r.id });

    const dup = await api().post(`/api/service-requests/${r.id}/open-social-work`).send({ kinds: ['SUPPORT'], type: 'ONGOING' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('REQUEST_ALREADY_LINKED');
    expect(dup.body.error.details.processId).toBe(opened.body.id);
    const again = await api().post(`/api/service-requests/${r.id}/open-social-work`).send({ kinds: ['SUPPORT'], type: 'ONGOING', allowAnother: true });
    expect(again.status).toBe(201);

    const related = (await api().get(`/api/service-requests/${r.id}/related`)).body;
    expect(related.socialProcesses.map((p: { id: number }) => p.id).sort()).toEqual([opened.body.id, again.body.id].sort());
    const proc = (await api().get(`/api/social-work/processes/${opened.body.id}/related`)).body;
    expect(proc.request.id).toBe(r.id);
    expect(proc.otherProcesses.map((p: { id: number }) => p.id)).toEqual([again.body.id]);
    const evs = (await api().get(`/api/service-requests/${r.id}/events`)).body;
    expect(evs.filter((e: { type: string }) => e.type === 'PROCESS_OPENED')).toHaveLength(2);
  });

  it('ליווי לא יכול להיפתח עם פנייה של חבר אחר', async () => {
    const a = await mkMember();
    const b = await mkMember();
    const r = await mkRequest(a);
    const res = await mkProcess(b, { requestId: r.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CROSS_MEMBER');
  });

  it('קישור לשפ"ח: דו-כיווני, רק לאותו חבר, ללא כפילות, והשפ"ח עצמו לא משתנה', async () => {
    const m = await mkMember();
    const other = await mkMember();
    const t = await mkTreatment(m);
    const foreign = await mkTreatment(other);
    const before = (await api().get(`/api/treatments/${t}`)).body;
    const r = await mkRequest(m, { type: 'PSYCH_EXTERNAL' });
    const p = (await mkProcess(m)).body;

    expect((await api().post(`/api/service-requests/${r.id}/link-treatment`).send({ treatmentId: foreign })).body.error.code).toBe('CROSS_MEMBER');
    expect((await api().post(`/api/social-work/processes/${p.id}/link-treatment`).send({ treatmentId: foreign })).body.error.code).toBe('CROSS_MEMBER');
    expect((await api().post(`/api/service-requests/${r.id}/link-treatment`).send({ treatmentId: t })).status).toBe(200);
    expect((await api().post(`/api/service-requests/${r.id}/link-treatment`).send({ treatmentId: t })).status).toBe(409);
    const linked = await api().post(`/api/social-work/processes/${p.id}/link-treatment`).send({ treatmentId: t });
    expect(linked.body.treatments[0].id).toBe(t);

    expect((await api().get(`/api/service-requests/${r.id}/related`)).body.treatments[0].id).toBe(t);
    const back = (await api().get(`/api/treatments/${t}/links`)).body;
    expect(back.socialProcesses.map((x: { id: number }) => x.id)).toEqual([p.id]);
    expect(back.requests.map((x: { id: number }) => x.id)).toEqual([r.id]);
    expect((await api().get(`/api/treatments/${t}`)).body).toEqual(before); // לא שונה

    const un = await api().delete(`/api/social-work/processes/${p.id}/link-treatment/${t}`);
    expect(un.body.treatments).toHaveLength(0);
  });

  it('לא ניתן למחוק חבר שיש לו פנייה או ליווי, ומודולי שפ"ח, חברים וסדנאות ממשיכים לעבוד', async () => {
    const m = await mkMember();
    await mkRequest(m);
    await expect(prisma.member.delete({ where: { id: m } })).rejects.toThrow();
    expect((await api().get('/api/members')).status).toBe(200);
    expect((await api().get('/api/workshops')).status).toBe(200);
    expect((await api().get('/api/treatments')).status).toBe(200);
  });
});
