/**
 * נתוני הדגמה. בטוח להרצה חוזרת: כל חבר/סדנה נוצרים רק אם אינם קיימים כבר
 * (חבר לפי טלפון, סדנה לפי שם), ואין מחיקה או דריסה של נתונים שהוזנו ידנית.
 * תעודות הזהות הן בדויות ואינן שייכות לאנשים אמיתיים.
 */
import { PrismaClient } from '@prisma/client';

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

async function main() {
  const members = await seedMembers();
  const workshops = await seedWorkshops();
  await seedActivity(members, workshops);
  await seedRestrictions(members, workshops);
  const [mc, wc, rc] = await Promise.all([prisma.member.count(), prisma.workshop.count(), prisma.registration.count()]);
  console.log(`Seed complete: ${mc} members, ${wc} workshops, ${rc} registrations.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
