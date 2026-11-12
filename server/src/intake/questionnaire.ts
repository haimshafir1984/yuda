import { z } from 'zod';

/** שאלון היכרות שמולא בראיון הקבוצתי. השדות לפי מסמך הדרישות. התשובות נשמרות כ-JSON בכרטיס המועמדות */

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const opt = (max = 500) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

export const NOW_OPTIONS = ['WORKING', 'STUDYING_DEGREE', 'STUDYING_OTHER', 'WORK_AND_STUDY', 'SOLDIER', 'NATIONAL_SERVICE', 'BETWEEN', 'OTHER'] as const;
export const JOB_PERCENT = ['FULL', 'THREE_QUARTERS_HALF', 'LESS_THAN_HALF', 'OTHER'] as const;
export const DEGREE_TYPES = ['PREP', 'BACHELOR', 'MASTER', 'DOCTORATE'] as const;
export const EDUCATION = ['ELEMENTARY', 'HIGH_NO_MATRIC', 'YESHIVA', 'FULL_MATRIC', 'PREP', 'PROFESSIONAL', 'BACHELOR', 'MASTER_PLUS', 'OTHER'] as const;
export const SERVICE = ['FULL_MILITARY', 'PARTIAL_MILITARY', 'NATIONAL', 'CIVIL', 'NONE_EXEMPT', 'NONE_NOT_EXEMPT', 'OTHER'] as const;
export const LIVES_WITH = ['ALONE', 'PARENTS', 'ROOMMATES', 'PARTNER', 'CHILDREN'] as const;
export const LEAVING_TIME = ['UNDER_HALF_YEAR', 'HALF_TO_YEAR', 'ONE_TO_TWO', 'TWO_TO_FOUR', 'FOUR_TO_SIX', 'SIX_PLUS', 'OTHER'] as const;
export const CHALLENGES = ['LONELINESS', 'STUDIES', 'EMPLOYMENT', 'FINANCIAL', 'RELATIONSHIP', 'IDENTITY', 'MENTAL', 'FAMILY', 'GAPS', 'OTHER'] as const;
export const WANTS = ['SOCIAL', 'BELONGING', 'ACTIVITIES', 'GUIDANCE', 'GROWTH', 'PASS_TIME', 'HOLIDAYS', 'SCHOLARSHIPS', 'MENTAL_SUPPORT', 'OTHER'] as const;

export const questionnaireSchema = z
  .object({
    nowDoing: z.enum(NOW_OPTIONS, { required_error: 'יש לבחור מה את/ה עושה כיום' }),
    // עובד/ת
    workplace: opt(200),
    jobPercent: z.preprocess(emptyToNull, z.enum(JOB_PERCENT).nullable().optional()),
    jobPercentOther: opt(100),
    jobRole: opt(200),
    // לומד/ת
    degreeType: z.preprocess(emptyToNull, z.enum(DEGREE_TYPES).nullable().optional()),
    studyField: opt(200),
    institution: opt(200),
    studyingWhat: opt(200),
    studyFramework: opt(200),
    studyKind: z.preprocess(emptyToNull, z.enum(['DEGREE_OR_PREP', 'CERTIFICATE_OR_OTHER']).nullable().optional()),
    // חייל / שירות
    serviceRole: opt(200),
    nowOther: opt(200),
    // השכלה ושירות
    education: z.preprocess(emptyToNull, z.enum(EDUCATION).nullable().optional()),
    educationField: opt(200),
    educationOther: opt(200),
    service: z.preprocess(emptyToNull, z.enum(SERVICE).nullable().optional()),
    serviceOther: opt(200),
    // מגורים ומשפחה
    address: opt(300),
    livesWith: z.array(z.enum(LIVES_WITH)).default([]),
    grewUpIn: opt(200),
    siblings: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).max(40).nullable().optional()),
    familyPosition: opt(100),
    familyRelation: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1).max(5).nullable().optional()),
    // רקע אישי
    leavingTime: z.preprocess(emptyToNull, z.enum(LEAVING_TIME).nullable().optional()),
    leavingOther: opt(200),
    hobbies: opt(1000),
    challenges: z.array(z.enum(CHALLENGES)).default([]),
    challengesOther: opt(300),
    wants: z.array(z.enum(WANTS)).default([]),
    wantsOther: opt(300),
    anythingElse: opt(2000),
  })
  .strip();

export type QuestionnaireAnswers = z.infer<typeof questionnaireSchema>;
