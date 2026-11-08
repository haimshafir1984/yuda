import { prisma } from '../db';

/** תבניות ברירת מחדל. המשתנים נכתבים בצורה {{שם}} וניתנים לעריכה במסך ההגדרות */
export const DEFAULT_TEMPLATES = [
  {
    key: 'registration.confirmed',
    name: 'אישור הרשמה',
    subject: 'אישור הרשמה: {{פעילות}}',
    body: 'שלום {{שם}}, נרשמת בהצלחה ל{{פעילות}}. מועד: {{תאריך}} {{שעה}}. נשמח לראותך! החצר של יודה',
  },
  {
    key: 'registration.cancelled',
    name: 'ביטול הרשמה',
    subject: 'ההרשמה בוטלה: {{פעילות}}',
    body: 'שלום {{שם}}, ההרשמה שלך ל{{פעילות}} בוטלה. אפשר להירשם שוב בכל עת. החצר של יודה',
  },
  {
    key: 'workshop.reminder',
    name: 'תזכורת לפני פעילות',
    subject: 'תזכורת: {{פעילות}} מחר',
    body: 'שלום {{שם}}, תזכורת: {{פעילות}} מתקיימת ב{{תאריך}} {{שעה}}. אם אינך יכול/ה להגיע, אנא בטל/י מראש. החצר של יודה',
  },
] as const;

export type TemplateKey = (typeof DEFAULT_TEMPLATES)[number]['key'];

/** מוסיף תבניות שחסרות. לא דורס תבניות שנערכו */
export async function ensureDefaultTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    const exists = await prisma.messageTemplate.findUnique({ where: { key: t.key } });
    if (!exists) await prisma.messageTemplate.create({ data: { key: t.key, name: t.name, subject: t.subject, body: t.body } });
  }
}

/** מחליף {{משתנה}} בערך. משתנה לא ידוע נשאר ריק */
export const renderText = (text: string, vars: Record<string, string | number | null | undefined>) =>
  text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, k: string) => String(vars[k] ?? ''));
