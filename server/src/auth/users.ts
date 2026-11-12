import { prisma } from '../db';
import { ROLE_LABEL, Role, isRole } from './permissions';

/** משתמשי הדגמה. שלוש העו"סיות הן אותם עובדים שכבר מופיעים בנתוני ההדגמה (פניות, ליווי, שפ"ח) */
export const DEFAULT_USERS: { name: string; role: Role }[] = [
  { name: 'דוד ברוך', role: 'GENERAL_MANAGER' },
  { name: 'אורית לביא', role: 'LEAD_SOCIAL_WORKER' },
  { name: 'רונית כץ', role: 'SOCIAL_WORKER' },
  { name: 'שירה אדלר', role: 'SOCIAL_WORKER' },
  { name: 'חוה גולן', role: 'NURSE' },
  { name: 'אילן שדה', role: 'MEDIATOR' },
  { name: 'מיכל אורן', role: 'WORKSHOP_MANAGER' },
  { name: 'אייל נחום', role: 'PROGRAM_COORDINATOR' },
  { name: 'שיפי לוי', role: 'INTAKE_COORDINATOR' },
];

/** מוסיף משתמשי הדגמה חסרים (לפי שם). בטוח להרצה חוזרת ואינו משנה משתמשים קיימים */
export async function ensureDefaultUsers(): Promise<number> {
  let created = 0;
  for (const u of DEFAULT_USERS) {
    const exists = await prisma.appUser.findUnique({ where: { name: u.name } });
    if (!exists) {
      await prisma.appUser.create({ data: u });
      created += 1;
    }
  }
  return created;
}

/** בעלייה: יוצרים משתמשי הדגמה חסרים, כדי שתמיד אפשר להיכנס */
export async function ensureUsersOnStartup() {
  await ensureDefaultUsers(); // מוסיף גם תפקידים חדשים שנוספו אחרי ההקמה (לפי שם, בלי לשנות קיימים)
}

export const userDto = (u: { id: number; name: string; role: string; active: boolean }) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  roleLabel: isRole(u.role) ? ROLE_LABEL[u.role] : u.role,
  active: u.active,
});

export async function listDemoUsers() {
  const rows = await prisma.appUser.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
  return rows.map(userDto);
}

/** עובדים שאפשר לשייך אליהם פניות ותהליכים. אם אין משתמשים: הרשימה הישנה, כדי לא לשבור מסדים ישנים */
export async function assignableNames(roles: Role[]): Promise<string[]> {
  const rows = await prisma.appUser.findMany({ where: { active: true, role: { in: roles } }, orderBy: { id: 'asc' } });
  return rows.map((r) => r.name);
}

export const SOCIAL_WORKER_ROLES: Role[] = ['LEAD_SOCIAL_WORKER', 'SOCIAL_WORKER'];
export const STAFF_ROLES: Role[] = ['LEAD_SOCIAL_WORKER', 'SOCIAL_WORKER', 'NURSE', 'MEDIATOR'];

/** שיוך אוטומטי של פנייה לפי קטגוריה: בריאות לאחות, גישור למגשר, כל השאר לעו"סית (אם היוצר עו"סית: אליה) */
export async function pickAssignee(type: string, creator: { name: string; role: string } | null): Promise<string | null> {
  const first = async (role: Role) => (await prisma.appUser.findFirst({ where: { active: true, role }, orderBy: { id: 'asc' } }))?.name ?? null;
  if (type === 'HEALTH') return first('NURSE');
  if (type === 'FAMILY_MEDIATION') return first('MEDIATOR');
  if (creator && (creator.role === 'SOCIAL_WORKER' || creator.role === 'LEAD_SOCIAL_WORKER')) return creator.name;
  return first('LEAD_SOCIAL_WORKER');
}
