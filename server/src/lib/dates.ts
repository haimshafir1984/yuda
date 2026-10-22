const pad = (n: number) => String(n).padStart(2, '0');

/** תאריך ללא שעה נשמר כחצות UTC, ומוחזר ללקוח כ-YYYY-MM-DD ללא תלות באזור זמן. */
export const toDateOnly = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

export const parseDateOnly = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

export const todayDateOnly = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

export const addDays = (s: string, days: number): string => {
  const d = parseDateOnly(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d)!;
};

export const currentYear = () => new Date().getFullYear();

/** גיל לפי שנה בלבד (שנה נוכחית פחות שנת לידה). null אם שנת הלידה חסרה. */
export const ageFromBirthYear = (birthYear: number | null | undefined): number | null =>
  birthYear ? currentYear() - birthYear : null;

export const tenureFromJoinDate = (joinDate: Date) => {
  const now = new Date();
  let months = (now.getFullYear() - joinDate.getUTCFullYear()) * 12 + (now.getMonth() - joinDate.getUTCMonth());
  if (now.getDate() < joinDate.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
};
