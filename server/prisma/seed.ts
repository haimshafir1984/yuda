/**
 * נתוני הדגמה. בטוח להרצה חוזרת: כל חבר/סדנה נוצרים רק אם אינם קיימים כבר
 * (חבר לפי טלפון, סדנה לפי שם), ואין מחיקה או דריסה של נתונים שהוזנו ידנית.
 * תעודות הזהות הן בדויות ואינן שייכות לאנשים אמיתיים.
 */
import { PrismaClient } from '@prisma/client';
import * as T from '../src/services/treatmentService';
import * as RQ from '../src/services/serviceRequestService';
import * as SW from '../src/services/socialWorkService';

const prisma = new PrismaClient();

const pad = (n: number) => String(n).padStart(2, '0');
const dayOffset = (days: number): Date => {
  const n = new Date();
  n.setDate(n.getDate() + days);
  return new Date(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T00:00:00.000Z`);
};
const year = new Date().getFullYear();

type M = {
  f: string; l: string; g: 'MALE' | 'FEMALE'; phone: string; email?: string; id?: string;
  by: number; ms: string; ni?: boolean; ch?: 'SMS' | 'EMAIL'; joinDays: number;
};

const MEMBERS: M[] = [
  { f: 'רחל', l: 'כהן', g: 'FEMALE', phone: '050-1110001', email: 'rachel.cohen@example.com', id: '900000011', by: year - 71, ms: 'WIDOWED', ni: true, joinDays: -900 },
  { f: 'משה', l: 'לוי', g: 'MALE', phone: '052-1110002', id: '900000029', by: year - 68, ms: 'MARRIED', ni: true, joinDays: -820 },
  { f: 'שרה', l: 'מזרחי', g: 'FEMALE', phone: '054-1110003', email: 'sara.m@example.com', by: year - 64, ms: 'MARRIED', joinDays: -700 },
  { f: 'יעקב', l: 'פרץ', g: 'MALE', phone: '050-1110004', id: '900000037', by: year - 75, ms: 'WIDOWED', ni: true, ch: 'SMS', joinDays: -650 },
  { f: 'מרים', l: 'ביטון', g: 'FEMALE', phone: '053-1110005', by: year - 59, ms: 'DIVORCED', joinDays: -600 },
  { f: 'דוד', l: 'אברהם', g: 'MALE', phone: '052-1110006', email: 'david.a@example.com', by: year - 62, ms: 'MARRIED', ch: 'EMAIL', joinDays: -540 },
  { f: 'לאה', l: 'דהן', g: 'FEMALE', phone: '058-1110007', id: '900000045', by: year - 70, ms: 'WIDOWED', ni: true, joinDays: -500 },
  { f: 'יוסף', l: 'חדד', g: 'MALE', phone: '050-1110008', by: year - 80, ms: 'MARRIED', ni: true, joinDays: -470 },
  { f: 'חנה', l: 'אזולאי', g: 'FEMALE', phone: '054-1110009', email: 'hana.az@example.com', by: year - 57, ms: 'SINGLE', joinDays: -400 },
  { f: 'אברהם', l: 'שמעוני', g: 'MALE', phone: '052-1110010', by: year - 66, ms: 'MARRIED', joinDays: -380 },
  { f: 'רבקה', l: 'גבאי', g: 'FEMALE', phone: '050-1110011', id: '900000052', by: year - 73, ms: 'WIDOWED', ni: true, joinDays: -350 },
  { f: 'יצחק', l: 'אוחיון', g: 'MALE', phone: '053-1110012', by: year - 61, ms: 'DIVORCED', joinDays: -300 },
  { f: 'נעמי', l: 'סבג', g: 'FEMALE', phone: '058-1110013', email: 'naomi.s@example.com', by: year - 55, ms: 'MARRIED', ch: 'EMAIL', joinDays: -260 },
  { f: 'שלמה', l: 'בן דוד', g: 'MALE', phone: '052-1110014', id: '900000060', by: year - 78, ms: 'WIDOWED', ni: true, joinDays: -220 },
  { f: 'תמר', l: 'וקנין', g: 'FEMALE', phone: '050-1110015', by: year - 52, ms: 'SINGLE', joinDays: -190 },
  { f: 'אליהו', l: 'עמר', g: 'MALE', phone: '054-1110016', by: year - 69, ms: 'MARRIED', joinDays: -150 },
  { f: 'ציפורה', l: 'נחום', g: 'FEMALE', phone: '053-1110017', email: 'tzipora.n@example.com', by: year - 74, ms: 'WIDOWED', ni: true, joinDays: -120 },
  { f: 'ישראל', l: 'מלכה', g: 'MALE', phone: '052-1110018', by: year - 63, ms: 'DIVORCED', joinDays: -90 },
  { f: 'אסתר', l: 'יוסף', g: 'FEMALE', phone: '058-1110019', id: '900000078', by: year - 67, ms: 'MARRIED', joinDays: -60 },
  { f: 'בנימין', l: 'טויטו', g: 'MALE', phone: '050-1110020', by: year - 72, ms: 'MARRIED', ni: true, joinDays: -30 },
  { f: 'פנינה', l: 'רוזן', g: 'FEMALE', phone: '054-1110021', email: 'pnina.r@example.com', by: year - 60, ms: 'SINGLE', joinDays: -14 },
  { f: 'אריה', l: 'שטרן', g: 'MALE', phone: '052-1110022', by: year - 58, ms: 'MARRIED', joinDays: -5 },
];

const digits = (s: string) => s.replace(/\D/g, '');

async function seedMembers(): Promise<Map<string, number>> {
  const byPhone = new Map<string, number>();
  for (const m of MEMBERS) {
    const norm = digits(m.phone);
    let existing = await prisma.member.findFirst({ where: { phoneNormalized: norm } });
    if (!existing) {
      existing = await prisma.member.create({
        data: {
          firstName: m.f, lastName: m.l, gender: m.g, phone: m.phone, phoneNormalized: norm,
          email: m.email ?? null, nationalId: m.id ?? null, birthYear: m.by, maritalStatus: m.ms,
          nationalInsurance: m.ni ?? false, preferredChannel: m.ch ?? 'SMS', joinDate: dayOffset(m.joinDays),
        },
      });
    }
    byPhone.set(`${m.f} ${m.l}`, existing.id);
  }
  return byPhone;
}

interface SessionSpec { offset: number; start: string; end: string }
interface WorkshopSpec {
  name: string; kind: 'WORKSHOP' | 'EVENT'; subtitle?: string; description: string; facilitator: string;
  format: 'SINGLE' | 'MULTI'; status: string; price?: number; ni?: boolean; open?: boolean;
  gender?: 'MALE' | 'FEMALE'; minAge?: number; maxAge?: number; requireNi?: boolean; summary?: string;
  sessions: SessionSpec[];
  questions?: { text: string; type: 'TEXT' | 'SINGLE_CHOICE'; required: boolean; options?: string[] }[];
}

const weekly = (first: number, count: number, start: string, end: string): SessionSpec[] =>
  Array.from({ length: count }, (_, i) => ({ offset: first + i * 7, start, end }));

const WORKSHOPS: WorkshopSpec[] = [
  {
    name: 'סדנת קדרות ויצירה בחימר', kind: 'WORKSHOP', subtitle: 'שלושה מפגשים מעשיים',
    description: 'היכרות עם עבודת חימר על האובניים, יצירת כלי קיבול וצביעה. כל החומרים כלולים.',
    facilitator: 'מיכל אלון', format: 'MULTI', status: 'FINISHED', price: 150,
    summary: 'הסדנה הסתיימה בהצלחה. המשתתפים ביקשו להמשיך עם קורס מתקדם בסתיו.',
    sessions: weekly(-45, 3, '10:00', '12:00'),
  },
  {
    name: 'כתיבה יוצרת', kind: 'WORKSHOP', subtitle: 'ארבעה מפגשים של כתיבה אישית',
    description: 'סדנה לכתיבת זיכרונות וסיפורים אישיים בהנחיית סופרת. אין צורך בניסיון קודם.',
    facilitator: 'ד"ר עדנה שפירא', format: 'MULTI', status: 'ONGOING',
    sessions: weekly(-14, 4, '16:00', '17:30'),
    questions: [
      { text: 'האם יש נושא שתרצו שנעסוק בו?', type: 'TEXT', required: false },
      { text: 'איך תרצו להתנסות בכתיבה?', type: 'SINGLE_CHOICE', required: true, options: ['בכתב יד', 'במחשב', 'בשניהם'] },
    ],
  },
  {
    name: 'ערב שירה בציבור', kind: 'EVENT', subtitle: 'ערב קהילתי עם כיבוד קל',
    description: 'ערב שירים ישראליים אהובים בליווי נגן. מוזמנים כל החברים והמשפחות.',
    facilitator: 'אורי גולן', format: 'SINGLE', status: 'PUBLISHED',
    sessions: [{ offset: 10, start: '19:00', end: '21:00' }],
  },
  {
    name: 'בישול בריא לכל המשפחה', kind: 'WORKSHOP', subtitle: 'שלושה מפגשי בישול',
    description: 'מתכונים קלים ובריאים, עם דגש על תזונה מאוזנת. בסוף כל מפגש טועמים יחד.',
    facilitator: 'שף רונית ברק', format: 'MULTI', status: 'PUBLISHED', price: 180, ni: true,
    sessions: weekly(14, 3, '11:00', '13:00'),
    questions: [
      { text: 'האם יש רגישות למזון?', type: 'SINGLE_CHOICE', required: true, options: ['אין', 'גלוטן', 'לקטוז', 'אגוזים'] },
      { text: 'פרטים נוספים על רגישות או העדפה תזונתית', type: 'TEXT', required: false },
    ],
  },
  {
    name: 'הרצאה: זכויות לגיל השלישי', kind: 'EVENT',
    description: 'הרצאה של יועץ זכויות על הטבות והחזרים שמגיעים לגמלאים.',
    facilitator: 'עו"ד דן קרמר', format: 'SINGLE', status: 'FINISHED',
    summary: 'הגיעו כ-15 משתתפים. עלו שאלות רבות בנושא ארנונה והנחות, מומלץ להזמין מפגש המשך.',
    sessions: [{ offset: -20, start: '18:00', end: '19:30' }],
  },
  {
    name: 'יוגה עדינה לנשים', kind: 'WORKSHOP', subtitle: 'חמישה מפגשים, מגיל 50',
    description: 'סדנת יוגה עדינה לשיפור גמישות ושיווי משקל. מתאימה גם למתחילות.',
    facilitator: 'יעל דרור', format: 'MULTI', status: 'PUBLISHED', price: 200,
    gender: 'FEMALE', minAge: 50,
    sessions: weekly(21, 5, '08:30', '09:30'),
  },
  {
    name: 'צילום בטלפון הנייד', kind: 'WORKSHOP', subtitle: 'בהכנה',
    description: 'סדנה להכרת אפשרויות המצלמה בטלפון חכם. המועדים טרם נקבעו.',
    facilitator: 'נועם לביא', format: 'SINGLE', status: 'DRAFT', open: false,
    sessions: [],
  },
];

async function seedWorkshops(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const w of WORKSHOPS) {
    const existing = await prisma.workshop.findFirst({ where: { name: w.name } });
    if (existing) {
      ids.set(w.name, existing.id);
      continue;
    }
    const created = await prisma.workshop.create({
      data: {
        kind: w.kind, name: w.name, subtitle: w.subtitle ?? null, description: w.description, facilitator: w.facilitator,
        format: w.format, status: w.status, isPaid: !!w.price, price: w.price ?? null, nationalInsurance: w.ni ?? false,
        registrationOpen: w.open ?? true, genderRestriction: w.gender ?? null, minAge: w.minAge ?? null, maxAge: w.maxAge ?? null,
        requireNationalInsurance: w.requireNi ?? false, summary: w.summary ?? null,
        startTime: w.sessions[0]?.start ?? null, endTime: w.sessions[0]?.end ?? null,
        sessions: { create: w.sessions.map((s) => ({ date: dayOffset(s.offset), startTime: s.start, endTime: s.end })) },
        questions: {
          create: (w.questions ?? []).map((q, i) => ({
            text: q.text, type: q.type, required: q.required, sortOrder: i + 1,
            options: q.options ? { create: q.options.map((label, j) => ({ label, sortOrder: j })) } : undefined,
          })),
        },
      },
    });
    ids.set(w.name, created.id);
    newWorkshops.add(w.name);
  }
  return ids;
}

const newWorkshops = new Set<string>();

async function register(workshopId: number, memberId: number, answers: Record<string, string | number> = {}, cancelled = false) {
  const reg = await prisma.registration.create({
    data: {
      memberId, workshopId, status: cancelled ? 'CANCELLED' : 'ACTIVE',
      registeredAt: dayOffset(-30), cancelledAt: cancelled ? dayOffset(-10) : null,
      cancelReason: cancelled ? 'לא מתאים בשל לוח זמנים' : null,
    },
  });
  const questions = await prisma.workshopQuestion.findMany({ where: { workshopId }, include: { options: true } });
  for (const q of questions) {
    const a = answers[q.text];
    if (a === undefined) continue;
    if (q.type === 'TEXT') await prisma.registrationAnswer.create({ data: { registrationId: reg.id, questionId: q.id, textValue: String(a) } });
    else {
      const opt = q.options.find((o) => o.label === a);
      if (opt) await prisma.registrationAnswer.create({ data: { registrationId: reg.id, questionId: q.id, optionId: opt.id } });
    }
  }
  return reg;
}

async function mark(workshopId: number, regId: number, statuses: ('PRESENT' | 'ABSENT' | null)[]) {
  const sessions = await prisma.workshopSession.findMany({ where: { workshopId }, orderBy: { date: 'asc' } });
  for (const [i, st] of statuses.entries()) {
    if (!st || !sessions[i]) continue;
    await prisma.attendance.create({ data: { registrationId: regId, sessionId: sessions[i].id, status: st } });
  }
}

async function seedActivity(m: Map<string, number>, w: Map<string, number>) {
  const M = (n: string) => m.get(n)!;

  if (newWorkshops.has('סדנת קדרות ויצירה בחימר')) {
    const id = w.get('סדנת קדרות ויצירה בחימר')!;
    const a = await register(id, M('רחל כהן')); await mark(id, a.id, ['PRESENT', 'PRESENT', 'PRESENT']);
    const b = await register(id, M('שרה מזרחי')); await mark(id, b.id, ['PRESENT', 'ABSENT', 'PRESENT']);
    const c = await register(id, M('חנה אזולאי')); await mark(id, c.id, ['PRESENT', 'PRESENT', 'ABSENT']);
    const d = await register(id, M('מרים ביטון')); await mark(id, d.id, ['ABSENT', 'ABSENT', 'ABSENT']);
    await register(id, M('לאה דהן'), {}, true); // ביטול הרשמה
  }
  if (newWorkshops.has('כתיבה יוצרת')) {
    const id = w.get('כתיבה יוצרת')!;
    const a = await register(id, M('רחל כהן'), { 'איך תרצו להתנסות בכתיבה?': 'בכתב יד', 'האם יש נושא שתרצו שנעסוק בו?': 'זיכרונות מהילדות בעיר העתיקה' });
    await mark(id, a.id, ['PRESENT', 'PRESENT']);
    const b = await register(id, M('דוד אברהם'), { 'איך תרצו להתנסות בכתיבה?': 'במחשב' }); await mark(id, b.id, ['PRESENT', 'ABSENT']);
    const c = await register(id, M('נעמי סבג'), { 'איך תרצו להתנסות בכתיבה?': 'בשניהם' }); await mark(id, c.id, ['PRESENT', 'PRESENT']);
    await register(id, M('תמר וקנין'), { 'איך תרצו להתנסות בכתיבה?': 'במחשב', 'האם יש נושא שתרצו שנעסוק בו?': 'כתיבת שירה' });
  }
  if (newWorkshops.has('ערב שירה בציבור')) {
    const id = w.get('ערב שירה בציבור')!;
    for (const n of ['משה לוי', 'יעקב פרץ', 'רבקה גבאי', 'שלמה בן דוד', 'ציפורה נחום']) await register(id, M(n));
  }
  if (newWorkshops.has('בישול בריא לכל המשפחה')) {
    const id = w.get('בישול בריא לכל המשפחה')!;
    await register(id, M('רחל כהן'), { 'האם יש רגישות למזון?': 'אין' });
    await register(id, M('אסתר יוסף'), { 'האם יש רגישות למזון?': 'גלוטן', 'פרטים נוספים על רגישות או העדפה תזונתית': 'צליאק, נדרש בישול נפרד' });
    await register(id, M('ישראל מלכה'), { 'האם יש רגישות למזון?': 'אין' });
  }
  if (newWorkshops.has('הרצאה: זכויות לגיל השלישי')) {
    const id = w.get('הרצאה: זכויות לגיל השלישי')!;
    const present = ['משה לוי', 'יעקב פרץ', 'לאה דהן', 'יוסף חדד', 'רבקה גבאי', 'שלמה בן דוד'];
    for (const n of present) { const r = await register(id, M(n)); await mark(id, r.id, ['PRESENT']); }
    const x = await register(id, M('אליהו עמר')); await mark(id, x.id, ['ABSENT']);
  }
  if (newWorkshops.has('יוגה עדינה לנשים')) {
    const id = w.get('יוגה עדינה לנשים')!;
    for (const n of ['שרה מזרחי', 'חנה אזולאי', 'מרים ביטון']) await register(id, M(n));
  }
}

async function seedRestrictions(m: Map<string, number>, w: Map<string, number>) {
  // חבר עם הגבלה ספציפית לסדנה, וחבר עם הגבלה כללית
  const targets: { member: string; workshop?: string; reason: string }[] = [
    { member: 'אליהו עמר', workshop: 'בישול בריא לכל המשפחה', reason: 'חוב פתוח מסדנה קודמת' },
    { member: 'יצחק אוחיון', reason: 'אי-הגעות חוזרות ללא הודעה מראש' },
  ];
  for (const t of targets) {
    const memberId = m.get(t.member)!;
    const workshopId = t.workshop ? w.get(t.workshop)! : null;
    const exists = await prisma.memberRestriction.findFirst({ where: { memberId, workshopId, removedAt: null } });
    if (!exists) await prisma.memberRestriction.create({ data: { memberId, workshopId, reason: t.reason } });
  }
}


// ======================= שפ"ח =======================
// כל הנתונים בדויים. מטפלים נוצרים לפי שם; תהליכים נוצרים רק אם המטפל הראשון נוצר כעת (הרצה חוזרת לא משכפלת).

const THERAPISTS = [
  { fullName: 'ד"ר נועה גולדשטיין', phone: '03-5550101', email: 'noa.g@example.com', type: 'PRIVATE', pricePerSession: 350 },
  { fullName: 'מיכאל ברק', phone: '03-5550102', email: 'michael.b@example.com', type: 'PRIVATE', pricePerSession: 320 },
  { fullName: 'תמר אשכנזי', phone: '03-5550103', email: 'tamar.a@example.com', type: 'PRIVATE', pricePerSession: 300 },
  { fullName: 'עידו פלד', phone: '03-5550104', email: 'ido.p@example.com', type: 'SMAT', pricePerSession: 280 },
  { fullName: 'הילה רוזנברג', phone: '03-5550105', email: 'hila.r@example.com', type: 'SMAT', pricePerSession: 260 },
  { fullName: 'אריאל שחר', phone: '03-5550106', email: 'ariel.s@example.com', type: 'PRIVATE', pricePerSession: 340, active: false },
] as const;

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

async function seedTreatments(members: Map<string, number>) {
  const ids = new Map<string, number>();
  for (const t of THERAPISTS) {
    const existing = await prisma.therapist.findFirst({ where: { fullName: t.fullName } });
    if (existing) ids.set(t.fullName, existing.id);
    else {
      const c = await prisma.therapist.create({ data: { ...t, active: 'active' in t ? t.active : true } });
      ids.set(t.fullName, c.id);
    }
  }
  const th = (n: string) => ids.get(n)!;
  const M = (n: string) => members.get(n)!;
  const report = async (treatmentId: number, therapistName: string, ago: number, held: number, cancelled: number, approve = true) => {
    const { year, month } = monthsAgo(ago);
    const r = await T.createReport(treatmentId, { therapistId: th(therapistName), year, month, sessionsHeld: held, paidCancellations: cancelled, notes: null, ratePerSession: undefined, copayPerSession: undefined });
    if (approve) await T.approveReport(r.id);
    return r;
  };
  // כל חבר מקבל תהליך הדגמה רק אם אין לו כבר תהליך שפ"ח (הרצה חוזרת לא משכפלת)
  const open = async (member: string, track: 'PRIVATE' | 'SMAT', sessions: number, copay: number, therapist?: string, worker = 'אורית לביא') => {
    if ((await prisma.psychologicalTreatment.count({ where: { memberId: M(member) } })) > 0) {
      return null;
    }
    return T.createTreatment({ memberId: M(member), approvedSessions: sessions, copayPerSession: copay, socialWorker: worker, yehudaApproval: true, track, therapistId: therapist ? th(therapist) : null, intakeRef: null });
  };

  // 1. ממתין להתאמת מטפל (סמט, טרם נבחר מטפל)
  await open('רבקה גבאי', 'SMAT', 20, 40, undefined, 'רונית כץ');
  // 2. ממתין לחתימה על חוזה
  await open('יעקב פרץ', 'PRIVATE', 24, 50, 'תמר אשכנזי');
  // 3. פעיל, מטפל פרטי, דיווחים מאושרים, השתתפות עצמית שטרם שולמה
  const a = await open('משה לוי', 'PRIVATE', 30, 50, 'ד"ר נועה גולדשטיין');
  if (a) {
    await T.signDemo(a.id);
    const a1 = await report(a.id, 'ד"ר נועה גולדשטיין', 2, 4, 1);
    await T.setPayment(a1.id, { therapistPaymentStatus: 'PAID', copayPaymentStatus: 'PAID' });
    const a2 = await report(a.id, 'ד"ר נועה גולדשטיין', 1, 3, 0);
    await T.setPayment(a2.id, { therapistPaymentStatus: 'ACCOUNTING' });
    await T.addException(a.id, { kind: 'LATE_PAYMENT', description: 'השתתפות עצמית לחודש הקודם טרם שולמה', date: null });
  }
  // 4. סמט פעיל
  const b = await open('שרה מזרחי', 'SMAT', 20, 40, 'עידו פלד', 'רונית כץ');
  if (b) {
    await T.signDemo(b.id);
    await report(b.id, 'עידו פלד', 1, 5, 0);
  }
  // 5. שני מטפלים בהיסטוריה
  const c = await open('דוד אברהם', 'PRIVATE', 30, 60, 'מיכאל ברק', 'שירה אדלר');
  if (c) {
    await T.signDemo(c.id);
    await report(c.id, 'מיכאל ברק', 3, 4, 1);
    await T.changeTherapist(c.id, { newTherapistId: th('תמר אשכנזי'), date: null, reason: 'בקשת המטופל', note: 'המעבר תואם מראש' });
    const c2 = await report(c.id, 'תמר אשכנזי', 1, 6, 0);
    await T.setPayment(c2.id, { therapistPaymentStatus: 'PENDING' });
  }
  // 6. הארכה
  const d = await open('מרים ביטון', 'PRIVATE', 20, 50, 'ד"ר נועה גולדשטיין');
  if (d) {
    await T.signDemo(d.id);
    await report(d.id, 'ד"ר נועה גולדשטיין', 2, 5, 0);
    const extended = await T.addExtension(d.id, { additionalSessions: 10, copayPerSession: 50, yehudaApproval: true, date: null, idempotencyKey: 'seed-ext-1' });
    await T.signExtension(d.id, extended.pendingExtensionIds[0]);
  }
  // 7. הסתיים
  const e = await open('לאה דהן', 'SMAT', 12, 30, 'הילה רוזנברג', 'רונית כץ');
  if (e) {
    await T.signDemo(e.id);
    await report(e.id, 'הילה רוזנברג', 4, 6, 0);
    await report(e.id, 'הילה רוזנברג', 3, 6, 0);
    await T.finishTreatment(e.id, { reason: 'GOAL', date: null, note: 'הסתיימה מכסת הפגישות ומטרת הטיפול הושגה' });
  }
  // 8. מושהה עקב הפרה
  const f = await open('אסתר יוסף', 'PRIVATE', 15, 50, 'ד"ר נועה גולדשטיין');
  if (f) {
    await T.signDemo(f.id);
    await T.pauseTreatment(f.id, { reason: 'EXCESS_CANCELLATIONS', note: 'ביטולים חוזרים ללא הודעה מראש' });
  }
}

// ======================= פניות וליווי עו"ס =======================
// כל הנתונים בדויים. כל פנייה נוצרת רק אם אין לאותו חבר פנייה עם אותו נושא; תהליך ליווי רק אם אין לחבר תהליך עם אותה מטרה.

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function seedSocial(members: Map<string, number>) {
  const M = (n: string) => members.get(n)!;
  const treatmentOf = async (name: string) => (await prisma.psychologicalTreatment.findFirst({ where: { memberId: M(name) }, orderBy: { id: 'asc' } }))?.id ?? null;

  const request = async (
    member: string, type: string, subject: string, o: { status?: string; assignee?: string; priority?: string; days?: number; description?: string; source?: string; decision?: string; reason?: string; note?: string },
  ) => {
    const existing = await prisma.serviceRequest.findFirst({ where: { memberId: M(member), subject } });
    if (existing) return { id: existing.id, created: false };
    const r = await RQ.createRequest({
      memberId: M(member), type: type as never, subject, description: o.description ?? null, openedAt: isoDay(-(o.days ?? 10)), source: (o.source ?? 'MANUAL') as never,
      assignee: o.assignee ?? null, priority: (o.priority ?? 'NORMAL') as never, internalNote: o.note ?? null,
    });
    if (o.status && o.status !== 'NEW') await RQ.changeRequestStatus(r.id, { status: o.status as never, reason: o.reason ?? null });
    if (o.decision) await RQ.setDecision(r.id, { decision: o.decision as never, note: null });
    return { id: r.id, created: true };
  };

  const process = async (
    member: string, goal: string, kinds: string[], type: 'ONE_TIME' | 'ONGOING', o: { requestId?: number; worker?: string; days?: number; status?: 'ACTIVE' | 'FROZEN' | 'FINISHED' | 'NOT_STARTED' },
  ) => {
    const existing = await prisma.socialWorkProcess.findFirst({ where: { memberId: M(member), goal } });
    if (existing) return { id: existing.id, created: false };
    const p = await SW.createProcess({ memberId: M(member), requestId: o.requestId ?? null, socialWorker: o.worker ?? 'אורית לביא', kinds: kinds as never, type, goal, startDate: isoDay(-(o.days ?? 30)) });
    if (o.status && o.status !== 'NOT_STARTED') await SW.activateProcess(p.id);
    return { id: p.id, created: true };
  };

  const meetings = async (pid: number, list: [number, string, string, string?][]) => {
    for (const [ago, subject, mode, summary] of list)
      await SW.addMeeting(pid, { date: isoDay(-ago), time: '10:00', subject, mode: mode as never, durationMinutes: 45, summary: summary ?? 'סיכום בדוי של הפגישה', followUpNotes: null, followUpRequired: false });
  };

  // ----- פניות -----
  const r1 = await request('רחל כהן', 'RIGHTS', 'בירור זכאות לקצבת שאירים', { assignee: 'אורית לביא', days: 2, description: 'החברה מבקשת לברר זכאות. נתונים בדויים.', source: 'PHONE' });
  const r2 = await request('דוד אברהם', 'SUPPORT', 'תמיכה וליווי בתקופה קשה', { status: 'IN_PROGRESS', assignee: 'רונית כץ', days: 40, priority: 'HIGH', decision: 'SOCIAL_WORK_NEEDED', source: 'MEETING' });
  const r3 = await request('שרה מזרחי', 'PSYCH_EXTERNAL', 'בקשה לטיפול פסיכולוגי חיצוני', { status: 'HANDLED', assignee: 'שירה אדלר', days: 60, decision: 'PSYCH_REFERRAL' });
  await request('יצחק אוחיון', 'BUREAUCRATIC', 'סיוע במילוי טפסי ארנונה', { status: 'WAITING_INFO', assignee: 'אורית לביא', days: 15, description: 'ממתין למסמכים מהחבר' });
  await request('חנה אזולאי', 'HEALTH', 'ייעוץ בנושא מעקב רפואי', { status: 'REVIEW', assignee: 'רונית כץ', days: 5, priority: 'URGENT' });
  const r6 = await request('אליהו עמר', 'FAMILY_MEDIATION', 'מתח משפחתי עם הילדים', { status: 'IN_PROGRESS', assignee: 'שירה אדלר', days: 25, decision: 'SOCIAL_WORK_NEEDED' });
  await request('תמר וקנין', 'OTHER', 'בקשת מידע על פעילויות הארגון', { status: 'CLOSED', assignee: 'אורית לביא', days: 70, reason: 'ניתן מידע טלפוני, אין צורך בטיפול נוסף', decision: 'ANSWERED' });
  await request('ישראל מלכה', 'RIGHTS', 'הנחה בתחבורה ציבורית', { status: 'REJECTED', assignee: 'רונית כץ', days: 50, reason: 'אינו עומד בקריטריונים', decision: 'REJECTED' });
  const r9 = await request('משה לוי', 'SUPPORT', 'ליווי בתקופת החלמה', { status: 'IN_PROGRESS', assignee: 'אורית לביא', days: 35, decision: 'SOCIAL_WORK_NEEDED' });
  const r10 = await request('מרים ביטון', 'PSYCH_EXTERNAL', 'בקשה להארכת הטיפול הפסיכולוגי', { status: 'IN_PROGRESS', assignee: 'שירה אדלר', days: 12, priority: 'HIGH' });
  await request('נעמי סבג', 'BUREAUCRATIC', 'בירור מול ביטוח לאומי', { assignee: 'רונית כץ', days: 1, priority: 'HIGH', source: 'WEBSITE' });
  const r12 = await request('בנימין טויטו', 'SUPPORT', 'תמיכה וליווי למשפחה', { status: 'HANDLED', assignee: 'שירה אדלר', days: 90, decision: 'SOCIAL_WORK_NEEDED' });

  const linkReq = async (reqId: number, member: string) => {
    const t = await treatmentOf(member);
    if (t) await RQ.linkTreatment(reqId, t).catch(() => undefined); // כבר מקושר: מדלגים
  };
  if (r3.created) await linkReq(r3.id, 'שרה מזרחי');
  if (r10.created) await linkReq(r10.id, 'מרים ביטון');
  if (r1.created) {
    await RQ.addRequestNote(r1.id, { text: 'נקבעה שיחת בירור ראשונית' });
    await RQ.addContact(r1.id, { text: 'שיחה ראשונית עם החברה', mode: 'PHONE', date: null });
  }

  // ----- ליווי עו"ס -----
  const p1 = await process('דוד אברהם', 'ליווי תמיכתי לאחר אובדן', ['SUPPORT', 'EMOTIONAL'], 'ONGOING', { requestId: r2.id, worker: 'רונית כץ', days: 38, status: 'ACTIVE' });
  if (p1.created) {
    await meetings(p1.id, [[35, 'היכרות ובניית תוכנית', 'FACE'], [21, 'מעקב שבועי', 'PHONE'], [7, 'חיזוק ומשאבים', 'FACE']]);
  }
  const p2 = await process('משה לוי', 'ליווי בתקופת החלמה ומיצוי זכויות', ['SUPPORT', 'RIGHTS'], 'ONGOING', { requestId: r9.id, worker: 'אורית לביא', days: 30, status: 'ACTIVE' });
  if (p2.created) {
    await meetings(p2.id, [[28, 'סקירת צרכים', 'FACE'], [10, 'בדיקת התקדמות', 'ONLINE']]);
    await SW.addIntervention(p2.id, { date: isoDay(-20), type: 'RIGHTS_ASSIST', description: 'סיוע בהגשת בקשה לבדיקת זכאות להטבות', involved: 'ביטוח לאומי', status: 'IN_PROGRESS', treatmentId: null });
    await SW.addIntervention(p2.id, { date: isoDay(-8), type: 'EXTERNAL_CONTACT', description: 'שיחה עם גורם מקצועי בנוגע לטיפול הפסיכולוגי', involved: 'מטפל חיצוני', status: 'DONE', treatmentId: await treatmentOf('משה לוי') });
    const t = await treatmentOf('משה לוי');
    if (t) await SW.linkTreatment(p2.id, t);
  }
  const p3 = await process('בנימין טויטו', 'ליווי משפחתי קצר מועד', ['SUPPORT', 'FAMILY'], 'ONGOING', { requestId: r12.id, worker: 'שירה אדלר', days: 85, status: 'ACTIVE' });
  if (p3.created) {
    await meetings(p3.id, [[80, 'פגישת היכרות', 'FACE'], [66, 'עבודה על תקשורת', 'FACE'], [52, 'פגישה משפחתית', 'FACE'], [40, 'סיכום ביניים', 'PHONE']]);
    await SW.addReport(p3.id, { type: 'PERIODIC', date: isoDay(-45), title: 'סיכום תקופתי', content: 'התקדמות טובה. נתונים בדויים להדגמה.' });
    await SW.finishProcess(p3.id, { endDate: isoDay(-30), reason: 'GOAL_ACHIEVED', summary: 'מטרת הליווי הושגה והמשפחה מתפקדת באופן יציב.' });
    await SW.addReport(p3.id, { type: 'CLOSING', date: isoDay(-30), title: 'סיכום סיום תהליך', content: 'התהליך הסתיים בהצלחה.' });
  }
  const p4 = await process('חנה אזולאי', 'ליווי רגשי בתקופת שינוי', ['EMOTIONAL'], 'ONGOING', { worker: 'רונית כץ', days: 55, status: 'ACTIVE' });
  if (p4.created) {
    await meetings(p4.id, [[50, 'פגישה ראשונה', 'FACE'], [36, 'פגישת המשך', 'PHONE']]);
    await SW.freezeProcess(p4.id, 'החברה בנסיעה לחו"ל');
  }
  const p5 = await process('רחל כהן', 'בירור זכאות ראשוני', ['RIGHTS'], 'ONE_TIME', { worker: 'אורית לביא', days: 1, status: 'NOT_STARTED' });
  void p5;
  const p6 = await process('לאה דהן', 'ייעוץ חד-פעמי בנושא קשר משפחתי', ['FAMILY'], 'ONE_TIME', { worker: 'שירה אדלר', days: 14, status: 'ACTIVE' });
  if (p6.created) {
    await meetings(p6.id, [[10, 'ייעוץ חד-פעמי', 'FACE']]);
    const t = await treatmentOf('לאה דהן');
    if (t) await SW.linkTreatment(p6.id, t);
  }
  const p7 = await process('יעקב פרץ', 'מיצוי זכויות וסיוע בירוקרטי', ['RIGHTS', 'BUREAUCRATIC'], 'ONGOING', { worker: 'אורית לביא', days: 75, status: 'ACTIVE' });
  if (p7.created) {
    await meetings(p7.id, [[70, 'מיפוי זכויות', 'FACE'], [56, 'איסוף מסמכים', 'PHONE'], [42, 'הגשת בקשות', 'FACE'], [28, 'מעקב', 'PHONE'], [14, 'עדכון סטטוס בקשות', 'ONLINE']]);
    await SW.addIntervention(p7.id, { date: isoDay(-40), type: 'EXTERNAL_CONTACT', description: 'פנייה לרשות מקומית בנושא הנחה בארנונה', involved: 'רשות מקומית', status: 'DONE', treatmentId: null });
    await SW.addIntervention(p7.id, { date: isoDay(-12), type: 'BUREAUCRATIC', description: 'סיוע במילוי טפסי בקשה', involved: null, status: 'OPEN', treatmentId: null });
  }
  const p8 = await process('אליהו עמר', 'גישור מול הילדים', ['PARENT_MEDIATION', 'FAMILY'], 'ONGOING', { requestId: r6.id, worker: 'שירה אדלר', days: 22, status: 'ACTIVE' });
  if (p8.created) await meetings(p8.id, [[18, 'פגישת גישור ראשונה', 'FACE']]);
}

// ======================= השלמות לפי מסמך הדרישות (נתוני הדגמה) =======================
// כל פריט נוצר רק אם אינו קיים, ולכן הרצה חוזרת לא משכפלת.

async function seedRequirementGaps(members: Map<string, number>) {
  const M = (n: string) => members.get(n)!;

  // הערת עו"סית בכרטיס חבר
  const noteText = 'שוחחתי עם החברה על צרכי הליווי. נתונים בדויים להדגמה.';
  if (!(await prisma.memberNote.findFirst({ where: { memberId: M('חנה אזולאי'), text: noteText } })))
    await prisma.memberNote.create({ data: { memberId: M('חנה אזולאי'), text: noteText, author: 'רונית כץ' } });

  // פגישה עם מטופל ומשימה לעו"סית בשפ"ח
  const t = await prisma.psychologicalTreatment.findFirst({ where: { memberId: M('משה לוי') }, orderBy: { id: 'asc' } });
  if (t) {
    if (!(await prisma.treatmentMeeting.findFirst({ where: { treatmentId: t.id } })))
      await T.addTreatmentMeeting(t.id, { date: isoDay(-9), subject: 'FIT', summary: 'המטופל מרוצה ממידת ההתאמה של המטפל' });
    if (!(await prisma.treatmentTask.findFirst({ where: { treatmentId: t.id } })))
      await T.addTask(t.id, { title: 'לקיים שיחת חתך עם המטפל', dueDate: isoDay(7) });
  }

  // פגישה שבוטלה וגורם שת"פ בליווי עו"ס
  const p = await prisma.socialWorkProcess.findFirst({ where: { memberId: M('דוד אברהם'), goal: 'ליווי תמיכתי לאחר אובדן' } });
  if (p && !(await prisma.socialWorkMeeting.findFirst({ where: { processId: p.id, status: 'CANCELLED' } }))) {
    await SW.addMeeting(p.id, { date: isoDay(-14), time: '10:00', subject: 'פגישת מעקב', mode: 'FACE', durationMinutes: 60, summary: null, followUpNotes: null, followUpRequired: false, status: 'CANCELLED', cancelReason: 'החבר חלה ולא יכול היה להגיע', topics: [], meetingActions: [], externalPartner: null });
    await SW.addMeeting(p.id, { date: isoDay(-3), time: '11:00', subject: 'חיזוק ומשאבים נוספים', mode: 'PHONE', durationMinutes: 30, summary: 'שיחה קצרה. נתונים בדויים.', followUpNotes: null, followUpRequired: true, status: 'HELD', cancelReason: null, topics: ['FAMILY', 'RELATIONSHIP'], meetingActions: ['EXTERNAL_PARTNER'], externalPartner: 'מרכז הזדמנות' });
  }

  // שאלת בחירה מרובה (צ'קבוקס) לסדנה קיימת
  const w = await prisma.workshop.findFirst({ where: { name: 'כתיבה יוצרת' } });
  const qText = 'אילו סוגי כתיבה מעניינים אותך?';
  if (w && !(await prisma.workshopQuestion.findFirst({ where: { workshopId: w.id, text: qText } })))
    await prisma.workshopQuestion.create({
      data: { workshopId: w.id, text: qText, type: 'MULTI_CHOICE', required: false, sortOrder: 9, options: { create: ['זיכרונות', 'שירה', 'סיפורים קצרים'].map((label, i) => ({ label, sortOrder: i })) } },
    });
}

async function main() {
  const members = await seedMembers();
  const workshops = await seedWorkshops();
  await seedActivity(members, workshops);
  await seedRestrictions(members, workshops);
  await seedTreatments(members);
  await seedSocial(members);
  await seedRequirementGaps(members);
  const [mc, wc, rc, tc, qc, pc] = await Promise.all([prisma.member.count(), prisma.workshop.count(), prisma.registration.count(), prisma.psychologicalTreatment.count(), prisma.serviceRequest.count(), prisma.socialWorkProcess.count()]);
  console.log(`Seed complete: ${mc} members, ${wc} workshops, ${rc} registrations, ${tc} treatments, ${qc} service requests, ${pc} social-work processes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
