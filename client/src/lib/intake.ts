import type { Tone } from '../components/ui';

/** קבלת חברים חדשים: תוויות, אפשרויות טפסים וטיפוסים */

export const candidateStatusLabel: Record<string, string> = {
  NEW: 'חדש', AWAITING_CLARIFICATION: 'ממתין לשיחת בירור', INVITED_GROUP: 'הוזמן לראיון קבוצתי', AWAITING_PERSONAL: 'ממתין לפגישה לבירור נוסף',
  ACCEPTED: 'התקבל', REJECTED: 'נדחה', AIR: 'באוויר', FADED: 'התנדף', MAYBE_FUTURE: 'יתאים בעתיד',
};
export const candidateStatusTone = (s: string): Tone =>
  (({ NEW: 'amber', AWAITING_CLARIFICATION: 'blue', INVITED_GROUP: 'blue', AWAITING_PERSONAL: 'blue', ACCEPTED: 'green', REJECTED: 'red', AIR: 'amber', FADED: 'gray', MAYBE_FUTURE: 'teal' }) as Record<string, Tone>)[s] ?? 'gray';

/** מה קרה בפעם הקודמת (סימון בקשה חוזרת) */
export const outcomeLabel: Record<string, string> = {
  PREVIOUS_UNHANDLED: 'הבקשה הקודמת עדיין לא טופלה', REJECT_AGE: 'דחייה בגלל גיל', REJECT_BACKGROUND: 'דחייה בגלל רקע לא מתאים',
  REJECT_AFTER_CALL: 'דחייה אחרי שיחת בירור', INVITED_NOT_SIGNED: 'הוזמן לראיון קבוצתי אך לא השתבץ / הגיב', SIGNED_NOT_ATTENDED: 'השתבץ לראיון קבוצתי אך לא הגיע',
  REJECT_AFTER_GROUP: 'דחייה אחרי ראיון קבוצתי', PERSONAL_NOT_SCHEDULED: 'הוזמן לפגישה אישית אך לא קבע מועד', PERSONAL_NO_SHOW: 'קבע פגישה אישית אך לא הגיע אליה',
  REJECT_AFTER_PERSONAL: 'דחייה אחרי פגישה אישית', TEMP_REJECT: 'דחייה זמנית והמלצה לחזור בהמשך',
};
export const rejectionReasonLabel: Record<string, string> = { AGE_YOUNG: 'צעיר/ה מדי', AGE_OLD: 'מבוגר/ת מדי', NOT_HAREDI: 'אינו מרקע חרדי', OTHER: 'אחר' };
export const eventLabel: Record<string, string> = {
  SUBMITTED: 'התקבלה בקשה', AUTO_REJECTED_AGE: 'דחייה אוטומטית (גיל)', REJECTED: 'דחייה', CLARIFICATION_REQUESTED: 'נדרשת שיחת בירור', CALL: 'שיחת בירור',
  INVITED_GROUP: 'הזמנה לראיון קבוצתי', INVITATION_NOTE: 'הערת מועמד להזמנה', SIGNED_UP: 'השתבצות לראיון', NO_SHOW: 'לא הגיע', QUESTIONNAIRE_SENT: 'שאלון נשלח',
  QUESTIONNAIRE_FILLED: 'שאלון מולא', INVITED_PERSONAL: 'הזמנה לפגישה אישית', MEETING_SCHEDULED: 'נקבעה פגישה אישית', MEETING_HELD: 'פגישה אישית התקיימה',
  NOT_NOW: 'כרגע לא מתאים', ACCEPTED: 'התקבל', AUTO_AIR: 'באוויר (אוטומטי)', AUTO_FADED: 'התנדף (אוטומטי)', ASSIGNED: 'שיוך לרכז',
};
export const howHeardOptions: Record<string, string> = { FRIEND: 'חבר/ה', SOCIAL: 'רשתות חברתיות', EVENT: 'אירוע או הרצאה', ORGANIZATION: 'גורם מפנה או ארגון', WEBSITE: 'חיפוש באינטרנט', OTHER: 'אחר' };
export const communityOptions = ['ליטאי', 'חסידי', 'ספרדי / מזרחי', 'חב"ד', 'חרדי מודרני', 'אחר'];
export const meetingDecisionLabel: Record<string, string> = { ACCEPT: 'קבלה', REJECT: 'דחייה', NOT_NOW: 'כרגע לא מתאים' };
export const signupDecisionLabel: Record<string, string> = { NO_SHOW: 'לא הגיע', REJECT: 'נדחה', ACCEPT: 'התקבל', PERSONAL: 'הוזמן לפגישה אישית' };
export const settingLabel: Record<string, string> = {
  'intake.minAge': 'גיל מינימלי (צעיר מזה נדחה אוטומטית)', 'intake.maxAge': 'גיל מקסימלי (מבוגר מזה נדחה אוטומטית)',
  'intake.entryCode': 'קוד כניסה (נשלח למתקבלים)', 'intake.whatsappLink': 'קישור לקבוצת הווטסאפ של העדכונים',
  'intake.noReplyDays': 'ימים בלי תגובה להזמנה עד "באוויר"', 'intake.fadeDays': 'ימים ב"באוויר" עד "התנדף"',
};

// ----- שאלון ההיכרות -----
export const nowDoingLabel: Record<string, string> = {
  WORKING: 'עובד/ת', STUDYING_DEGREE: 'לומד/ת לתואר אקדמי / מכינה קדם אקדמית', STUDYING_OTHER: 'לומד/ת לימודי תעודה / לימודים אחרים', WORK_AND_STUDY: 'עובד/ת ולומד/ת',
  SOLDIER: 'חייל/ת', NATIONAL_SERVICE: 'בשירות לאומי / שירות אזרחי', BETWEEN: 'כרגע בין מסגרות', OTHER: 'אחר',
};
export const jobPercentLabel: Record<string, string> = { FULL: 'משרה מלאה', THREE_QUARTERS_HALF: 'שלושת רבעי / חצי משרה', LESS_THAN_HALF: 'פחות מחצי משרה', OTHER: 'אחר' };
export const degreeTypeLabel: Record<string, string> = { PREP: 'מכינה קדם אקדמית', BACHELOR: 'תואר ראשון', MASTER: 'תואר שני', DOCTORATE: 'תואר שלישי' };
export const studyKindLabel: Record<string, string> = { DEGREE_OR_PREP: 'תואר אקדמי / מכינה קדם אקדמית', CERTIFICATE_OR_OTHER: 'לימודי תעודה / לימודים אחרים' };
export const educationLabel: Record<string, string> = {
  ELEMENTARY: 'בית ספר יסודי', HIGH_NO_MATRIC: 'תיכון ללא בגרות', YESHIVA: 'ישיבה', FULL_MATRIC: 'תעודת בגרות מלאה', PREP: 'מכינה', PROFESSIONAL: 'תעודת מקצוע',
  BACHELOR: 'תואר ראשון', MASTER_PLUS: 'תואר שני ומעלה', OTHER: 'אחר',
};
export const serviceLabel: Record<string, string> = {
  FULL_MILITARY: 'שירות צבאי מלא', PARTIAL_MILITARY: 'שירות צבאי חלקי', NATIONAL: 'שירות לאומי', CIVIL: 'שירות אזרחי', NONE_EXEMPT: 'לא, יש לי פטור', NONE_NOT_EXEMPT: 'לא, אין לי פטור', OTHER: 'אחר',
};
export const livesWithLabel: Record<string, string> = { ALONE: 'לבד', PARENTS: 'עם ההורים', ROOMMATES: 'עם שותפים', PARTNER: 'עם בן/בת זוג', CHILDREN: 'עם הילדים' };
export const leavingTimeLabel: Record<string, string> = {
  UNDER_HALF_YEAR: 'פחות מחצי שנה', HALF_TO_YEAR: 'חצי שנה עד שנה', ONE_TO_TWO: 'שנה עד שנתיים', TWO_TO_FOUR: 'שנתיים עד ארבע שנים', FOUR_TO_SIX: 'ארבע עד שש שנים', SIX_PLUS: 'שש שנים ומעלה', OTHER: 'אחר',
};
export const challengeLabel: Record<string, string> = {
  LONELINESS: 'בדידות / קשרים חברתיים', STUDIES: 'לימודים', EMPLOYMENT: 'תעסוקה', FINANCIAL: 'מצב כלכלי', RELATIONSHIP: 'זוגיות', IDENTITY: 'זהות ושייכות',
  MENTAL: 'התמודדויות נפשיות', FAMILY: 'קשר עם ההורים והמשפחה', GAPS: 'השלמת פערים', OTHER: 'אחר',
};
export const wantsLabel: Record<string, string> = {
  SOCIAL: 'חיי חברה', BELONGING: 'שייכות וקהילה', ACTIVITIES: 'סדנאות, תכניות, פעילויות', GUIDANCE: 'ליווי והכוונה', GROWTH: 'התפתחות אישית',
  PASS_TIME: 'מקום להעביר את הזמן', HOLIDAYS: 'חגים ושבתות', SCHOLARSHIPS: 'מלגות', MENTAL_SUPPORT: 'תמיכה נפשית', OTHER: 'אחר',
};

export interface Candidate {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string | null;
  birthDate: string | null;
  age: number | null;
  gender: string | null;
  maritalStatus: string | null;
  childrenCount: number | null;
  phone: string;
  email: string | null;
  preferredChannel: string;
  community: string | null;
  elementarySchool: string | null;
  highSchool: string | null;
  howHeard: string | null;
  whyJoin: string | null;
  anythingElse: string | null;
  submittedAt: string;
  status: string;
  statusChangedAt: string;
  outcomeCode: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  coordinator: string | null;
  callDate: string | null;
  callSummary: string | null;
  previousId: number | null;
  repeatReason: string | null;
  isRepeat: boolean;
  existingMemberId: number | null;
  memberId: number | null;
  daysSinceSubmitted?: number;
}
export interface CandidateFull extends Candidate {
  previous: { id: number; submittedAt: string; status: string; outcomeCode: string | null } | null;
  events: { id: number; type: string; description: string; fromStatus: string | null; toStatus: string | null; performedBy: string | null; createdAt: string }[];
  invitations: { id: number; kind: 'GROUP' | 'PERSONAL'; sentAt: string; respondedAt: string | null; response: string | null; note: string | null; chosen: string | null; link: string; offered: string[] }[];
  signups: { id: number; sessionId: number; sessionName: string; sessionDate: string; startTime: string | null; attended: boolean | null; decision: string | null }[];
  questionnaires: { id: number; sentAt: string; filledAt: string | null; link: string; answers: Record<string, unknown> | null }[];
  meetings: { id: number; scheduledAt: string | null; heldAt: string | null; noShow: boolean; decision: string | null; decisionNote: string | null }[];
}
export interface InterviewSession {
  id: number;
  name: string;
  date: string;
  startTime: string | null;
  coordinator: string | null;
  signups: number;
  attended: number;
  past: boolean;
}
export interface InterviewSessionFull extends InterviewSession {
  signupsList: {
    id: number; candidateId: number; candidateName: string; candidateStatus: string; phone: string; age: number | null;
    attended: boolean | null; decision: string | null; questionnaireSent: boolean; questionnaireFilled: boolean;
  }[];
}
export interface IntakeSummary {
  counts: Record<string, number>;
  alerts: {
    unhandled: { id: number; name: string; days: number }[];
    undecidedSessions: { id: number; name: string; date: string; pending: number }[];
    futureSessions: number;
    needMoreSessions: boolean;
  };
}
