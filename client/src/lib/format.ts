import type { AttendanceStatus, Channel, Gender, Track, TreatmentStatus, WorkshopStatus } from './types';

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

// ======================= שפ"ח =======================
export const trackLabel: Record<Track, string> = { PRIVATE: 'מטפל פרטי', SMAT: 'סמט' };
export const treatmentStatusLabel: Record<TreatmentStatus, string> = {
  PENDING_THERAPIST: 'ממתין להתאמת מטפל',
  PENDING_CONTRACT: 'ממתין לחתימת מטופל על חוזה',
  ACTIVE: 'פעיל',
  ACTIVE_EXTENSION: 'פעיל - הארכה',
  PENDING_EXTENSION_SIGNATURE: 'ממתין לחתימת הארכה',
  PAUSED: 'מושהה',
  FROZEN: 'בהקפאה',
  FINISHED: 'הסתיים',
};
export const treatmentStatusTone = (s: TreatmentStatus) =>
  (({ PENDING_THERAPIST: 'amber', PENDING_CONTRACT: 'amber', PENDING_EXTENSION_SIGNATURE: 'amber', ACTIVE: 'green', ACTIVE_EXTENSION: 'teal', PAUSED: 'red', FROZEN: 'blue', FINISHED: 'gray' }) as const)[s];
export const reportStatusLabel = { DRAFT: 'טיוטה', PENDING: 'ממתין לאישור', APPROVED: 'מאושר' } as const;
export const therapistPaymentLabel = { PENDING: 'ממתין', ACCOUNTING: 'בטיפול הנהלת חשבונות', PAID: 'שולם' } as const;
export const copayPaymentLabel = { PENDING: 'ממתין', PAID: 'שולם' } as const;
export const socialReportTypeLabel = {
  PSYCHOSOCIAL: 'דוח פסיכוסוציאלי',
  FIRST_SESSION_SUMMARY: 'סיכום שיחה אחרי פגישה ראשונה',
  THERAPIST_FOLLOWUP: 'שיחת מעקב עם מטפל',
  GENERAL: 'דוח כללי',
} as const;
export const eventTypeLabel: Record<string, string> = {
  OPENED: 'פתיחת תהליך',
  ACTIVATED: 'הפעלת טיפול',
  THERAPIST_ASSIGNED: 'שיוך מטפל',
  THERAPIST_CHANGE: 'החלפת מטפל',
  EXTENSION: 'הארכת טיפול (בקשה)',
  EXTENSION_SIGNED: 'חתימה על הארכה',
  MEETING: 'פגישה עם המטופל',
  THERAPIST_MESSAGE: 'הודעת מטפל',
  PAUSE: 'השהיית טיפול',
  RESUME: 'חזרה לטיפול פעיל',
  FREEZE: 'הקפאת טיפול',
  UNFREEZE: 'יציאה מהקפאה',
  FINISH: 'סיום טיפול',
  NOTE: 'הערה',
  REPORT_APPROVED: 'אישור דיווח חודשי',
  EXCEPTION: 'חריגה',
};
export const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const fmtMonth = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;
export const PAUSE_REASONS = { NON_PAYMENT: 'אי תשלום השתתפות עצמית', EXCESS_CANCELLATIONS: 'ביטולים מוגזמים', NO_FEEDBACK: 'אי מילוי משוב', OTHER_VIOLATION: 'הפרה אחרת' };
export const FREEZE_REASONS = { PERSONAL: 'סיבה אישית', HEALTH: 'מצב בריאותי', TRAVEL: 'נסיעה או מעבר זמני', OTHER: 'אחר' };
export const FINISH_REASONS = {
  QUOTA: 'הסתיים מספר הפגישות המאושר',
  GOAL: 'מטרת הטיפול הושגה',
  DROPOUT: 'נשירה',
  HMO: 'מעבר לסבסוד קופת חולים',
  RELOCATION: 'מעבר דירה',
  TRAVEL: 'טיול לחו"ל',
  PERSONAL: 'אילוץ אישי',
  OTHER: 'אחר',
};

// ======================= פניות וליווי עו"ס =======================
export const requestTypeLabel: Record<string, string> = {
  SUPPORT: 'תמיכה וליווי',
  RIGHTS: 'מיצוי זכויות',
  PSYCH_EXTERNAL: 'טיפול פסיכולוגי חיצוני',
  HEALTH: 'ייעוץ בריאות',
  FAMILY_MEDIATION: 'גישור או סיוע בקשר משפחתי',
  BUREAUCRATIC: 'סיוע בירוקרטי',
  OTHER: 'אחר',
};
export const requestSourceLabel: Record<string, string> = { WEBSITE: 'אתר', PHONE: 'טלפון', MEETING: 'פגישה', MANUAL: 'הזנה ידנית', OTHER: 'אחר' };
export const priorityLabel = { NORMAL: 'רגילה', HIGH: 'גבוהה', URGENT: 'דחופה' } as const;
export const priorityTone = (p: string) => (p === 'URGENT' ? 'red' : p === 'HIGH' ? 'amber' : 'gray') as 'red' | 'amber' | 'gray';
export const requestStatusLabel: Record<string, string> = {
  NEW: 'חדשה', REVIEW: 'בבדיקה', WAITING_INFO: 'ממתינה למידע', IN_PROGRESS: 'בטיפול', HANDLED: 'טופלה', REJECTED: 'נדחתה', CLOSED: 'נסגרה',
};
export const requestStatusTone = (s: string) =>
  (({ NEW: 'blue', REVIEW: 'amber', WAITING_INFO: 'amber', IN_PROGRESS: 'teal', HANDLED: 'green', REJECTED: 'red', CLOSED: 'gray' }) as Record<string, 'blue' | 'amber' | 'teal' | 'green' | 'red' | 'gray'>)[s] ?? 'gray';
export const decisionLabel: Record<string, string> = {
  SOCIAL_WORK_NEEDED: 'נדרש ליווי עו"ס',
  PSYCH_REFERRAL: 'הפניה לטיפול פסיכולוגי חיצוני',
  EXTERNAL_REFERRAL: 'הפניה לגורם חיצוני',
  ANSWERED: 'ניתן מענה ללא תהליך נוסף',
  REJECTED: 'הפנייה נדחתה',
  MORE_INFO: 'נדרש מידע נוסף',
};
export const requestEventLabel: Record<string, string> = {
  CREATED: 'פתיחת פנייה', EDITED: 'עריכת פרטים', ASSIGNED: 'שיוך אחראי', STATUS_CHANGE: 'שינוי סטטוס', NOTE: 'הערת טיפול', CONTACT: 'תיעוד שיחה או פגישה',
  DECISION: 'החלטה', PROCESS_OPENED: 'נפתח תהליך ליווי', TREATMENT_LINKED: 'קישור לשפ"ח',
};
export const modeLabel: Record<string, string> = { FACE: 'פרונטלית', PHONE: 'טלפונית', ONLINE: 'מקוונת', OTHER: 'אחר' };
export const staffFallback = ['אורית לביא', 'רונית כץ', 'שירה אדלר'];

export const kindLabel2: Record<string, string> = {
  RIGHTS: 'מיצוי זכויות', SUPPORT: 'תמיכה וליווי', PARENT_MEDIATION: 'גישור מול הורים', FAMILY: 'סיוע בקשר משפחתי',
  EMOTIONAL: 'תמיכה רגשית', BUREAUCRATIC: 'סיוע בירוקרטי', OTHER: 'אחר',
};
export const socialStatusLabel: Record<string, string> = { NOT_STARTED: 'טרם התחיל', ACTIVE: 'פעיל', FROZEN: 'בהקפאה', FINISHED: 'הסתיים' };
export const socialStatusTone = (s: string) => (({ NOT_STARTED: 'amber', ACTIVE: 'green', FROZEN: 'blue', FINISHED: 'gray' }) as Record<string, 'amber' | 'green' | 'blue' | 'gray'>)[s] ?? 'gray';
export const processTypeLabel = { ONE_TIME: 'חד-פעמי', ONGOING: 'מתמשך' } as const;
export const interventionTypeLabel: Record<string, string> = {
  EXTERNAL_CONTACT: 'יצירת קשר עם גורם חיצוני', RIGHTS_ASSIST: 'סיוע במיצוי זכויות', REFERRAL: 'הפניה לטיפול', FAMILY_TALK: 'שיחה עם גורם משפחתי',
  BUREAUCRATIC: 'סיוע בירוקרטי', OTHER: 'פעולה אחרת',
};
export const interventionStatusLabel = { OPEN: 'פתוחה', IN_PROGRESS: 'בביצוע', DONE: 'הושלמה' } as const;
export const swReportTypeLabel = { PERIODIC: 'סיכום תקופתי', GENERAL: 'סיכום כללי', CLOSING: 'סיכום סיום תהליך' } as const;
export const endReasonLabel: Record<string, string> = {
  COMPLETED: 'הליווי הושלם', GOAL_ACHIEVED: 'מטרת הליווי הושגה', DROPOUT: 'נשירה', TRANSFERRED: 'הועבר לגורם אחר', MEMBER_REQUEST: 'לבקשת החבר', OTHER: 'אחר',
};
export const socialEventLabel: Record<string, string> = {
  OPENED: 'פתיחת התהליך', ACTIVATED: 'הפעלה', MEETING_ADDED: 'הוספת פגישה', MEETING_EDITED: 'עריכת פגישה', INTERVENTION_ADDED: 'פעולה / התערבות', REPORT_ADDED: 'דוח',
  KINDS_CHANGED: 'שינוי מהות הליווי', TYPE_CHANGED: 'שינוי סוג התהליך', FROZEN: 'הקפאה', UNFROZEN: 'הוצאה מהקפאה', FINISHED: 'סיום תהליך', REOPENED: 'פתיחה מחדש',
  TREATMENT_LINKED: 'קישור לשפ"ח', TREATMENT_UNLINKED: 'הסרת קישור לשפ"ח', EDITED: 'עריכת פרטים',
};

// ======================= השלמות לפי מסמך הדרישות =======================
export const registrationModeLabel = { REQUIRED: 'חייב להירשם', NOT_NEEDED: 'אין צורך להירשם', RECOMMENDED: 'לא חובה להירשם אבל מומלץ' } as const;
export const priceTypeLabel = { FIXED: 'מחיר קבוע', MONTHLY: 'מחיר לחודש' } as const;
export const questionTypeLabel = { TEXT: 'טקסט חופשי', SINGLE_CHOICE: 'בחירה יחידה (כפתורי רדיו)', MULTI_CHOICE: 'בחירה מרובה (צ\'קבוקס)' } as const;
export const topicLabel: Record<string, string> = { WORK: 'עבודה', RESERVE_DUTY: 'מילואים', STUDIES: 'לימודים', FAMILY: 'משפחה', NATIONAL_INSURANCE: 'ביטוח לאומי', RELATIONSHIP: 'זוגיות' };
export const meetingActionLabel: Record<string, string> = {
  NI_PROGRAM: 'כניסה לתכנית ביטוח לאומי', PSYCH_PROGRAM: 'כניסה לתכנית פסיכולוגית', SCHOLARSHIPS: 'מלגות לימודים', EMPLOYMENT: 'תעסוקה', EXTERNAL_PARTNER: 'קישור לגורם שת"פ חיצוני',
};
export const treatmentMeetingSubjectLabel: Record<string, string> = {
  FIT: 'מידת ההתאמה של המטפל', EARLY_END: 'בקשה לסיים לפני תום החוזה', CONSULT: 'התייעצות', EXTENSION_REQUEST: 'בקשת הארכת טיפול', OTHER: 'אחר',
};
/** משך פגישה בקטגוריות לפי מסמך הדרישות (שעה היא ברירת המחדל) */
export const DURATION_BANDS = [
  { value: 30, label: 'עד חצי שעה' },
  { value: 45, label: 'חצי שעה עד שעה' },
  { value: 60, label: 'שעה' },
  { value: 90, label: 'מעל שעה' },
] as const;
export const durationBand = (minutes: number | null | undefined): number => (!minutes ? 60 : minutes <= 30 ? 30 : minutes < 60 ? 45 : minutes === 60 ? 60 : 90);
export const durationLabel = (minutes: number | null | undefined): string => (minutes ? DURATION_BANDS.find((b) => b.value === durationBand(minutes))!.label : '—');
