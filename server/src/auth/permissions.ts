/**
 * הרשאות לפי תפקיד. כניסה להדגמה היא בלי סיסמה, אבל ההרשאות נאכפות בשרת.
 * מבנה זה מאפשר להוסיף סיסמאות והרשאות מותאמות אישית בהמשך בלי לשנות את האכיפה.
 */
export const ROLES = [
  'GENERAL_MANAGER',
  'LEAD_SOCIAL_WORKER',
  'SOCIAL_WORKER',
  'NURSE',
  'MEDIATOR',
  'WORKSHOP_MANAGER',
  'PROGRAM_COORDINATOR',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  GENERAL_MANAGER: 'מנהל כללי',
  LEAD_SOCIAL_WORKER: 'עו"סית ראשית',
  SOCIAL_WORKER: 'עו"סית',
  NURSE: 'אחות',
  MEDIATOR: 'מגשר',
  WORKSHOP_MANAGER: 'מנהל סדנאות',
  PROGRAM_COORDINATOR: 'רכז תכנית',
};

export type Area = 'members' | 'workshops' | 'treatments' | 'requests' | 'socialWork' | 'settings';
export const AREA_LABEL: Record<Area, string> = {
  members: 'חברים',
  workshops: 'סדנאות ואירועים',
  treatments: 'שפ"ח',
  requests: 'פניות ובקשות סיוע',
  socialWork: 'ליווי עו"ס',
  settings: 'הגדרות',
};

/** 0 אין גישה, 1 צפייה, 2 עריכה, 3 ניהול (כולל אישורים) */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL = { NONE: 0, VIEW: 1, EDIT: 2, MANAGE: 3 } as const;

const m = (members: Level, workshops: Level, treatments: Level, requests: Level, socialWork: Level, settings: Level): Record<Area, Level> => ({
  members, workshops, treatments, requests, socialWork, settings,
});

export const MATRIX: Record<Role, Record<Area, Level>> = {
  //                          חברים סדנאות שפ"ח פניות ליווי הגדרות
  GENERAL_MANAGER: m(3, 3, 3, 3, 3, 3),
  LEAD_SOCIAL_WORKER: m(2, 1, 3, 3, 3, 1),
  SOCIAL_WORKER: m(2, 1, 2, 2, 2, 0),
  NURSE: m(1, 0, 0, 2, 0, 0),
  MEDIATOR: m(1, 0, 0, 2, 0, 0),
  WORKSHOP_MANAGER: m(2, 3, 0, 0, 0, 0),
  PROGRAM_COORDINATOR: m(1, 1, 0, 0, 0, 0),
};

/** פניות שאחות ומגשר רואים ועורכים: רק מהקטגוריה שלהם */
export const REQUEST_SCOPE: Partial<Record<Role, string>> = { NURSE: 'HEALTH', MEDIATOR: 'FAMILY_MEDIATION' };

export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);
export const permissionsOf = (role: Role) => MATRIX[role];

/** סדר חשוב: הכללים הספציפיים קודם */
const AREA_RULES: [RegExp, Area | 'staff'][] = [
  [/^\/members\/\d+\/(treatments|treatment-copay|treatment-exceptions)$/, 'treatments'],
  [/^\/members\/\d+\/social-work$/, 'socialWork'],
  [/^\/members\/\d+\/(notes|complaints)$/, 'socialWork'],
  [/^\/members\/\d+\/mediations$/, 'requests'],
  [/^\/(mediations)(\/|$)/, 'requests'],
  [/^\/complaints(\/|$)/, 'socialWork'],
  [/^\/messages\/(send|send-options)$/, 'members'],
  [/^\/members\/\d+\/service-requests$/, 'requests'],
  [/^\/members(\/|$)/, 'members'],
  [/^\/(workshops|sessions|questions|registrations)(\/|$)/, 'workshops'],
  [/^\/(treatments|therapists|treatment-reports|treatment-tasks|social-reports)(\/|$)/, 'treatments'],
  [/^\/service-requests(\/|$)/, 'requests'],
  [/^\/social-work(\/|$)/, 'socialWork'],
  [/^\/(service-meta|treatment-meta)$/, 'staff'],
  [/^\/messages(\/|$)/, 'settings'],
];

export const areaOfPath = (path: string): Area | 'staff' | null => AREA_RULES.find(([re]) => re.test(path))?.[1] ?? null;

/** פעולות שדורשות הרשאת ניהול: סטטוס תשלום, ניהול מטפלים, פרסום סדנה */
const MANAGE_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'PATCH', re: /^\/treatment-reports\/\d+\/payment$/ },
  { method: 'POST', re: /^\/therapists$/ },
  { method: 'PUT', re: /^\/therapists\/\d+$/ },
  { method: 'POST', re: /^\/workshops\/\d+\/publish$/ },
];

export const requiredLevel = (method: string, path: string): Level => {
  if (MANAGE_ROUTES.some((r) => r.method === method && r.re.test(path))) return LEVEL.MANAGE;
  return method === 'GET' || method === 'HEAD' ? LEVEL.VIEW : LEVEL.EDIT;
};
