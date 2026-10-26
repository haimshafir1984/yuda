import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { resetDb } from './helpers';

const app = createApp();
const api = () => request(app);
let seq = 0;

const mkMember = async () => {
  seq += 1;
  const r = await api().post('/api/members').send({ firstName: 'חבר', lastName: `שפח${seq}`, phone: `052-80000${String(seq).padStart(2, '0')}` });
  return r.body.id as number;
};
const mkTherapist = async (over: Record<string, unknown> = {}) => {
  seq += 1;
  const r = await api().post('/api/therapists').send({ fullName: `מטפל ${seq}`, type: 'PRIVATE', pricePerSession: 300, ...over });
  expect(r.status).toBe(201);
  return r.body as { id: number };
};
const open = (memberId: number, therapistId: number | null, over: Record<string, unknown> = {}) =>
  api().post('/api/treatments').send({ memberId, approvedSessions: 30, copayPerSession: 50, socialWorker: 'אורית לביא', yehudaApproval: true, track: 'PRIVATE', therapistId, ...over });
const openActive = async (therapistId: number, over: Record<string, unknown> = {}) => {
  const m = await mkMember();
  const t = (await open(m, therapistId, over)).body;
  await api().post(`/api/treatments/${t.id}/sign-demo`);
  return { memberId: m, id: t.id as number };
};
const report = (tid: number, therapistId: number, month: number, held: number, extra: Record<string, unknown> = {}) =>
  api().post(`/api/treatments/${tid}/reports`).send({ therapistId, year: 2026, month, sessionsHeld: held, paidCancellations: 0, ...extra });
const get = async (id: number) => (await api().get(`/api/treatments/${id}`)).body;

beforeEach(resetDb);

describe('פתיחת תהליך', () => {
  it('דורש אישור מיהודה, חבר קיים ופרטים חובה', async () => {
    const m = await mkMember();
    expect((await open(m, null, { yehudaApproval: false })).body.error.code).toBe('APPROVAL_REQUIRED');
    expect((await open(99999, null)).status).toBe(404);
    const bad = await api().post('/api/treatments').send({ memberId: m });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.socialWorker).toBeTruthy();
  });

  it('ללא מטפל: ממתין להתאמת מטפל. עם מטפל: ממתין לחתימה. סמט ללא מטפל מותר', async () => {
    const th = await mkTherapist();
    const a = (await open(await mkMember(), null)).body;
    expect(a.status).toBe('PENDING_THERAPIST');
    const b = (await open(await mkMember(), th.id)).body;
    expect(b.status).toBe('PENDING_CONTRACT');
    expect(b.sessionCost).toBe(300);
    const c = await open(await mkMember(), null, { track: 'SMAT' });
    expect(c.body.status).toBe('PENDING_THERAPIST');
  });

  it('מסלול ומטפל חייבים להתאים; מטפל לא פעיל נדחה', async () => {
    const smat = await mkTherapist({ type: 'SMAT' });
    const r = await open(await mkMember(), smat.id, { track: 'PRIVATE' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('TRACK_MISMATCH');
    const inactive = await mkTherapist({ active: false });
    expect((await open(await mkMember(), inactive.id)).body.error.code).toBe('THERAPIST_INACTIVE');
  });

  it('מונע פתיחת תהליך שני לחבר שיש לו תהליך פתוח, ומאפשר אחרי סיום', async () => {
    const m = await mkMember();
    const first = (await open(m, null)).body;
    const dup = await open(m, null);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('OPEN_TREATMENT_EXISTS');
    await api().post(`/api/treatments/${first.id}/finish`).send({ reason: 'OTHER' });
    expect((await open(m, null)).status).toBe(201);
    expect((await api().get(`/api/members/${m}/treatments`)).body).toHaveLength(2);
  });

  it('שיוך מטפל מאוחר מעביר לממתין לחתימה, וההפעלה הידנית לפעיל עם היסטוריה', async () => {
    const th = await mkTherapist();
    const t = (await open(await mkMember(), null)).body;
    expect((await api().post(`/api/treatments/${t.id}/sign-demo`)).status).toBe(409);
    const assigned = await api().post(`/api/treatments/${t.id}/assign-therapist`).send({ therapistId: th.id });
    expect(assigned.body.status).toBe('PENDING_CONTRACT');
    expect(assigned.body.therapist.id).toBe(th.id);
    const signed = await api().post(`/api/treatments/${t.id}/sign-demo`);
    expect(signed.body.status).toBe('ACTIVE');
    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body;
    expect(hist.statuses.map((s: { toStatus: string }) => s.toStatus)).toEqual(['PENDING_THERAPIST', 'PENDING_CONTRACT', 'ACTIVE']);
    expect(hist.statuses[2].source).toBe('MANUAL');
    expect(hist.statuses[2].reason).toContain('הדגמה');
  });
});

describe('דיווחים חודשיים וספירת פגישות', () => {
  it('תרחיש: 4 + 3 פגישות מאושרות = 7 מתוך 30. טיוטה לא נספרת', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const r1 = (await report(t.id, th.id, 9, 4, { paidCancellations: 1 })).body;
    expect(r1.status).toBe('DRAFT');
    expect(r1.sessionsCost).toBe(1200);
    expect(r1.cancellationsCost).toBe(300);
    expect(r1.therapistTotal).toBe(1500);
    expect(r1.copayTotal).toBe(250); // (4+1) * 50
    expect((await get(t.id)).heldSessions).toBe(0);

    await api().post(`/api/treatment-reports/${r1.id}/submit`);
    expect((await get(t.id)).heldSessions).toBe(0);
    expect((await api().post(`/api/treatment-reports/${r1.id}/approve`)).status).toBe(200);
    const r2 = (await report(t.id, th.id, 10, 3)).body;
    await api().post(`/api/treatment-reports/${r2.id}/approve`);

    const after = await get(t.id);
    expect(after).toMatchObject({ heldSessions: 7, approvedSessions: 30, remainingSessions: 23 });
    const tl = (await api().get(`/api/treatments/${t.id}/timeline`)).body;
    expect(tl.reports.map((r: { month: number }) => r.month)).toEqual([10, 9]); // מהחדש לישן
    expect(tl.events.some((e: { type: string }) => e.type === 'REPORT_APPROVED')).toBe(true);
  });

  it('אישור כפול לא מונה פעמיים; דיווח מאושר נעול; דיווח כפול לחודש נחסם', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const r = (await report(t.id, th.id, 5, 4)).body;
    expect((await report(t.id, th.id, 5, 2)).body.error.code).toBe('REPORT_EXISTS');
    await api().post(`/api/treatment-reports/${r.id}/approve`);
    const again = await api().post(`/api/treatment-reports/${r.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPROVED');
    expect((await get(t.id)).heldSessions).toBe(4);
    const edit = await api().put(`/api/treatment-reports/${r.id}`).send({ therapistId: th.id, year: 2026, month: 5, sessionsHeld: 9 });
    expect(edit.status).toBe(409);
    expect((await api().delete(`/api/treatment-reports/${r.id}`)).status).toBe(409);
  });

  it('שינוי תעריף מטפל לא משנה דיווחים קיימים', async () => {
    const th = await mkTherapist({ pricePerSession: 300 });
    const t = await openActive(th.id);
    const r = (await report(t.id, th.id, 4, 2)).body;
    await api().put(`/api/therapists/${th.id}`).send({ fullName: 'מטפל', type: 'PRIVATE', pricePerSession: 500 });
    const tl = (await api().get(`/api/treatments/${t.id}/timeline`)).body.reports[0];
    expect(tl.ratePerSession).toBe(300);
    expect(tl.therapistTotal).toBe(600);
    expect(r.ratePerSession).toBe(300);
  });

  it('דיווח נחסם לפני הפעלה; סטטוס תשלום רק לדיווח מאושר, ונשמר', async () => {
    const th = await mkTherapist();
    const m = await mkMember();
    const pending = (await open(m, th.id)).body;
    expect((await report(pending.id, th.id, 1, 1)).body.error.code).toBe('NOT_ACTIVATED');
    await api().post(`/api/treatments/${pending.id}/sign-demo`);
    const r = (await report(pending.id, th.id, 1, 2)).body;
    expect((await api().patch(`/api/treatment-reports/${r.id}/payment`).send({ copayPaymentStatus: 'PAID' })).status).toBe(409);
    await api().post(`/api/treatment-reports/${r.id}/approve`);
    const paid = await api().patch(`/api/treatment-reports/${r.id}/payment`).send({ therapistPaymentStatus: 'ACCOUNTING', copayPaymentStatus: 'PAID' });
    expect(paid.body).toMatchObject({ therapistPaymentStatus: 'ACCOUNTING', copayPaymentStatus: 'PAID' });
    const copay = (await api().get(`/api/members/${m}/treatment-copay`)).body;
    expect(copay[0]).toMatchObject({ amount: 100, status: 'PAID' });
  });

  it('אימות קלט בדיווח', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const bad = await report(t.id, th.id, 13, -1);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.month).toBeTruthy();
    expect(bad.body.error.details.fields.sessionsHeld).toBeTruthy();
  });

  it('סיום אוטומטי רק כשהמכסה מוצתה בדיווח מאושר, וניתן להאריך אחריו', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id, { approvedSessions: 5 });
    const r = (await report(t.id, th.id, 6, 5)).body;
    expect((await get(t.id)).status).toBe('ACTIVE'); // טיוטה אינה מסיימת
    await api().post(`/api/treatment-reports/${r.id}/approve`);
    const done = await get(t.id);
    expect(done.status).toBe('FINISHED');
    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body.statuses;
    expect(hist[hist.length - 1].source).toBe('AUTO');
    // בקשת הארכה אחרי מיצוי המכסה: סטטוס "ממתין לחתימת הארכה", והמכסה לא גדלה עד החתימה
    const ext = await api().post(`/api/treatments/${t.id}/extensions`).send({ additionalSessions: 5, copayPerSession: 40, yehudaApproval: true });
    expect(ext.body).toMatchObject({ status: 'PENDING_EXTENSION_SIGNATURE', approvedSessions: 5, pendingExtensionSessions: 5 });
    const extId = ext.body.pendingExtensionIds[0];
    const signed = await api().post(`/api/treatments/${t.id}/extensions/${extId}/sign`);
    expect(signed.body).toMatchObject({ status: 'ACTIVE_EXTENSION', approvedSessions: 10, remainingSessions: 5, endDate: null, pendingExtensionSessions: 0 });
  });
});

describe('החלפת מטפל והיסטוריה', () => {
  it('שומר היסטוריית מטפלים; דיווחים ישנים נשארים עם המטפל הקודם', async () => {
    const a = await mkTherapist({ pricePerSession: 300 });
    const b = await mkTherapist({ pricePerSession: 400 });
    const t = await openActive(a.id);
    const r1 = (await report(t.id, a.id, 1, 3)).body;
    const ch = await api().post(`/api/treatments/${t.id}/change-therapist`).send({ newTherapistId: b.id, reason: 'בקשת מטופל', note: 'תואם' });
    expect(ch.body.therapist.id).toBe(b.id);
    expect(ch.body.sessionCost).toBe(400);
    expect((await api().post(`/api/treatments/${t.id}/change-therapist`).send({ newTherapistId: b.id, reason: 'x' })).body.error.code).toBe('SAME_THERAPIST');
    expect((await api().post(`/api/treatments/${t.id}/change-therapist`).send({ newTherapistId: a.id })).status).toBe(400); // סיבה חובה

    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body.therapists;
    expect(hist).toHaveLength(2);
    expect(hist[0].toDate).toBeTruthy();
    expect(hist[1].toDate).toBeNull();
    expect(hist[1].changeReason).toBe('בקשת מטופל');

    const r2 = (await report(t.id, b.id, 2, 2)).body;
    expect(r2.ratePerSession).toBe(400);
    const tl = (await api().get(`/api/treatments/${t.id}/timeline`)).body;
    const oldName = (await prisma.therapist.findUnique({ where: { id: a.id } }))!.fullName;
    expect(tl.reports.find((r: { id: number }) => r.id === r1.id).therapistName).toBe(oldName);
    expect(tl.events.some((e: { type: string }) => e.type === 'THERAPIST_CHANGE')).toBe(true);
    // מטפל שלא שויך לתהליך לא יכול לדווח
    const stranger = await mkTherapist();
    expect((await report(t.id, stranger.id, 3, 1)).body.error.code).toBe('THERAPIST_NOT_IN_TREATMENT');
  });

  it('שני מטפלים באותו חודש יוצרים שתי רשומות נפרדות', async () => {
    const a = await mkTherapist();
    const b = await mkTherapist();
    const t = await openActive(a.id);
    await api().post(`/api/treatments/${t.id}/change-therapist`).send({ newTherapistId: b.id, reason: 'x' });
    expect((await report(t.id, a.id, 7, 2)).status).toBe(201);
    expect((await report(t.id, b.id, 7, 2)).status).toBe(201);
    expect((await api().get(`/api/treatments/${t.id}/timeline`)).body.reports).toHaveLength(2);
  });
});

describe('הארכה, השהיה, הקפאה וסיום', () => {
  it('הארכה ב-10 פגישות: 30 -> 40, דורשת אישור, ולא נוצרת פעמיים', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const noApproval = await api().post(`/api/treatments/${t.id}/extensions`).send({ additionalSessions: 10, copayPerSession: 50, yehudaApproval: false });
    expect(noApproval.status).toBe(422);
    expect((await get(t.id)).approvedSessions).toBe(30);

    const body = { additionalSessions: 10, copayPerSession: 45, yehudaApproval: true, idempotencyKey: 'k1' };
    const first = await api().post(`/api/treatments/${t.id}/extensions`).send(body);
    // לפני חתימה: ההארכה לא נספרת במכסה והסטטוס לא משתנה
    expect(first.body).toMatchObject({ approvedSessions: 30, status: 'ACTIVE', extensionSessions: 0, pendingExtensionSessions: 10 });
    const dup = await api().post(`/api/treatments/${t.id}/extensions`).send(body);
    expect(dup.body.pendingExtensionSessions).toBe(10);
    const extId = first.body.pendingExtensionIds[0];
    const signed = await api().post(`/api/treatments/${t.id}/extensions/${extId}/sign`);
    expect(signed.body).toMatchObject({ approvedSessions: 40, status: 'ACTIVE_EXTENSION', extensionSessions: 10 });
    expect((await api().post(`/api/treatments/${t.id}/extensions/${extId}/sign`)).status).toBe(409); // לא נספרת פעמיים
    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body;
    expect(hist.extensions).toHaveLength(1);
    expect(hist.extensions[0]).toMatchObject({ number: 1, copayPerSession: 45 });
    expect(hist.extensions[0].signedAt).toBeTruthy();
    expect((await api().get(`/api/treatments/${t.id}/events`)).body.some((e: { type: string }) => e.type === 'EXTENSION')).toBe(true);
  });

  it('השהיה והקפאה הם מצבים נפרדים וחוזרים לפעיל (כולל הארכה)', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    expect((await api().post(`/api/treatments/${t.id}/resume`)).status).toBe(409);
    const paused = await api().post(`/api/treatments/${t.id}/pause`).send({ reason: 'EXCESS_CANCELLATIONS', note: 'ביטולים' });
    expect((await api().post(`/api/treatments/${t.id}/pause`).send({ reason: 'VIOLATION' })).status).toBe(400); // סיבה שאינה במסמך
    expect(paused.body.status).toBe('PAUSED');
    expect((await api().post(`/api/treatments/${t.id}/freeze`).send({ reason: 'PERSONAL' })).status).toBe(409);
    expect((await api().post(`/api/treatments/${t.id}/unfreeze`)).status).toBe(409);
    expect((await api().post(`/api/treatments/${t.id}/resume`)).body.status).toBe('ACTIVE');

    const frozen = await api().post(`/api/treatments/${t.id}/freeze`).send({ reason: 'HEALTH' });
    expect(frozen.body.status).toBe('FROZEN');
    expect((await api().post(`/api/treatments/${t.id}/unfreeze`)).body.status).toBe('ACTIVE');

    const ext = await api().post(`/api/treatments/${t.id}/extensions`).send({ additionalSessions: 5, copayPerSession: 0, yehudaApproval: true });
    await api().post(`/api/treatments/${t.id}/extensions/${ext.body.pendingExtensionIds[0]}/sign`);
    await api().post(`/api/treatments/${t.id}/pause`).send({ reason: 'NO_FEEDBACK' });
    expect((await api().post(`/api/treatments/${t.id}/resume`)).body.status).toBe('ACTIVE_EXTENSION');
  });

  it('סיום ידני: סטטוס, תאריך וסיבה; אין פעולות נוספות אחריו', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const fin = await api().post(`/api/treatments/${t.id}/finish`).send({ reason: 'GOAL', note: 'הושגה מטרה' });
    expect(fin.body.status).toBe('FINISHED');
    expect(fin.body.endDate).toBeTruthy();
    expect(fin.body.endReason).toBe('GOAL');
    expect((await api().post(`/api/treatments/${t.id}/finish`).send({ reason: 'GOAL' })).status).toBe(409);
    expect((await api().post(`/api/treatments/${t.id}/pause`).send({ reason: 'OTHER_VIOLATION' })).status).toBe(409);
  });

  it('היסטוריית סטטוסים נשמרת, ציר הזמן כרונולוגי, והערות וחריגות מופיעות', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    await api().post(`/api/treatments/${t.id}/notes`).send({ description: 'שיחת מעקב עם המטופל' });
    await api().post(`/api/treatments/${t.id}/pause`).send({ reason: 'OTHER_VIOLATION' });
    await api().post(`/api/treatments/${t.id}/resume`);
    await api().post(`/api/treatments/${t.id}/exceptions`).send({ kind: 'LATE_PAYMENT', description: 'איחור בתשלום' });
    const hist = (await api().get(`/api/treatments/${t.id}/history`)).body.statuses;
    expect(hist.map((s: { toStatus: string }) => s.toStatus)).toEqual(['PENDING_CONTRACT', 'ACTIVE', 'PAUSED', 'ACTIVE']);
    expect(hist[2].fromStatus).toBe('ACTIVE');
    const events = (await api().get(`/api/treatments/${t.id}/timeline`)).body.events;
    const dates = events.map((e: { date: string }) => e.date);
    expect([...dates].sort()).toEqual(dates);
    expect(events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['OPENED', 'ACTIVATED', 'NOTE', 'PAUSE', 'RESUME', 'EXCEPTION']));
    const ex = (await api().get(`/api/members/${t.memberId}/treatment-exceptions`)).body;
    expect(ex.map((x: { type: string }) => x.type).sort()).toEqual(['TREATMENT_LATE_PAYMENT', 'TREATMENT_VIOLATION']);
  });
});

describe('דוחות עו"סית, שילוב בכרטיס חבר ושלמות נתונים', () => {
  it('יצירה ועריכה של דוח עו"סית', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const list = (await api().post(`/api/treatments/${t.id}/social-reports`).send({ date: '2026-10-01', type: 'GENERAL', title: 'דוח', content: 'תוכן' })).body;
    expect(list).toHaveLength(1);
    const upd = (await api().put(`/api/social-reports/${list[0].id}`).send({ date: '2026-10-02', type: 'PSYCHOSOCIAL', title: 'עודכן', content: 'חדש' })).body;
    expect(upd[0]).toMatchObject({ title: 'עודכן', type: 'PSYCHOSOCIAL', date: '2026-10-02' });
    expect((await api().post(`/api/treatments/${t.id}/social-reports`).send({ date: '2026-10-01', type: 'GENERAL', title: '' })).status).toBe(400);
  });

  it('כרטיס החבר מציג את התהליכים שלו ומתעדכן, ושאר המודולים ללא שינוי', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    const r = (await report(t.id, th.id, 8, 5)).body;
    await api().post(`/api/treatment-reports/${r.id}/approve`);
    const rows = (await api().get(`/api/members/${t.memberId}/treatments`)).body;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: t.id, memberId: t.memberId, heldSessions: 5, approvedSessions: 30 });
    expect((await api().get(`/api/members/${t.memberId}`)).status).toBe(200);
    expect((await api().get(`/api/members/${t.memberId}/exceptions`)).status).toBe(200);
    expect((await api().get('/api/treatments').query({ q: 'שפח' })).body.length).toBeGreaterThan(0);
    expect((await api().get('/api/treatments').query({ status: 'FINISHED' })).body).toHaveLength(0);
    expect((await api().get('/api/workshops')).status).toBe(200);
  });

  it('מפתחות זרים: אי אפשר למחוק חבר עם תהליך שפ"ח', async () => {
    const th = await mkTherapist();
    const t = await openActive(th.id);
    await expect(prisma.member.delete({ where: { id: t.memberId } })).rejects.toThrow();
  });
});
