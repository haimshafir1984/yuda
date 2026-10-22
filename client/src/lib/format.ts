import type { AttendanceStatus, Channel, Gender, WorkshopStatus } from './types';

/** YYYY-MM-DD -> dd/MM/yyyy, ללא תלות באזור זמן */
export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const dt = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};

export const fmtDateRange = (start: string | null, end: string | null): string => {
  if (!start) return 'טרם נקבע';
  if (!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
};

export const fmtTimeRange = (s: string | null, e: string | null): string => (s && e ? `${s} – ${e}` : s ?? '—');

export const fmtMoney = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n);

export const todayStr = (): string => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

export const genderLabel: Record<Gender, string> = { MALE: 'גבר', FEMALE: 'אישה' };
export const channelLabel: Record<Channel, string> = { SMS: 'SMS', EMAIL: 'מייל' };
export const maritalLabel: Record<string, string> = {
  SINGLE: 'רווק/ה',
  MARRIED: 'נשוי/אה',
  DIVORCED: 'גרוש/ה',
  WIDOWED: 'אלמן/ה',
  SEPARATED: 'פרוד/ה',
};
export const statusLabel: Record<WorkshopStatus, string> = {
  DRAFT: 'טיוטה',
  PUBLISHED: 'מפורסם באתר',
  ONGOING: 'מתקיים כעת',
  FINISHED: 'הסתיים',
  CANCELLED: 'בוטל',
};
export const kindLabel = { WORKSHOP: 'סדנה', EVENT: 'אירוע' } as const;
export const attendanceLabel: Record<AttendanceStatus, string> = { PRESENT: 'הגיע', ABSENT: 'לא הגיע', UNMARKED: 'טרם סומן' };

export const fmtTenure = (t: { years: number; months: number }): string => {
  const parts: string[] = [];
  if (t.years) parts.push(t.years === 1 ? 'שנה' : `${t.years} שנים`);
  if (t.months) parts.push(t.months === 1 ? 'חודש' : `${t.months} חודשים`);
  return parts.length ? parts.join(' ו-') : 'פחות מחודש';
};
