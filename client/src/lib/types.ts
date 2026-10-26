export type Gender = 'MALE' | 'FEMALE';
export type Channel = 'SMS' | 'EMAIL';

export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: Gender | null;
  phone: string;
  email: string | null;
  nationalId: string | null;
  birthYear: number | null;
  age: number | null;
  maritalStatus: string | null;
  nationalInsurance: boolean;
  preferredChannel: Channel;
  joinDate: string;
  tenure: { years: number; months: number };
}
export interface MemberRow extends Member {
  workshopCount: number;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type WorkshopStatus = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'FINISHED' | 'CANCELLED';
export interface Workshop {
  id: number;
  kind: 'WORKSHOP' | 'EVENT';
  name: string;
  subtitle: string | null;
  description: string | null;
  facilitator: string | null;
  format: 'SINGLE' | 'MULTI';
  startTime: string | null;
  endTime: string | null;
  isPaid: boolean;
  price: number | null;
  nationalInsurance: boolean;
  status: WorkshopStatus;
  registrationOpen: boolean;
  registrationRequired: boolean;
  registrationMode: 'REQUIRED' | 'NOT_NEEDED' | 'RECOMMENDED';
  autoCloseRegistration: boolean;
  priceType: 'FIXED' | 'MONTHLY';
  excludeParticipantsOfWorkshopId: number | null;
  rejectMessage: string | null;
  closedMessage: string | null;
  completionMessage: string | null;
  genderRestriction: Gender | null;
  minAge: number | null;
  maxAge: number | null;
  requireNationalInsurance: boolean;
  summary: string | null;
  startDate: string | null;
  endDate: string | null;
  sessionCount: number;
  registrantCount: number;
}

export interface SessionRow {
  id: number;
  number: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  attendanceRecorded: boolean;
  presentCount: number;
  absentCount: number;
}

export interface Question {
  id: number;
  text: string;
  type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE';
  required: boolean;
  answerCount: number;
  options: { id: number; label: string }[];
}

export interface RegistrantRow {
  id: number;
  memberId: number;
  memberName: string;
  phone: string;
  status: 'ACTIVE' | 'CANCELLED';
  source: 'ADMIN' | 'PUBLIC';
  registeredAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  answerCount: number;
}

export interface RegistrationDetails {
  id: number;
  memberName: string;
  workshopName: string;
  status: 'ACTIVE' | 'CANCELLED';
  registeredAt: string;
  answers: { questionId: number; question: string; required: boolean; answer: string | null }[];
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'UNMARKED';
export interface SessionAttendance {
  session: { id: number; number: number; date: string; startTime: string | null; endTime: string | null };
  summary: { registered: number; present: number; absent: number; unmarked: number };
  rows: { registrationId: number; memberId: number; memberName: string; phone: string; status: AttendanceStatus }[];
}

export interface ActivityRow {
  registrationId: number;
  workshopId: number;
  workshopName: string;
  kind: 'WORKSHOP' | 'EVENT';
  startDate: string | null;
  endDate: string | null;
  workshopStatus: WorkshopStatus;
  registrationStatus: 'ACTIVE' | 'CANCELLED';
  registeredAt: string;
  cancelledAt: string | null;
  category: 'future' | 'active' | 'history';
  attendance: { present: number; absent: number; totalSessions: number };
}

export interface MemberSessionAttendance {
  registrationId: number;
  workshopId: number;
  workshopName: string;
  sessionId: number;
  sessionNumber: number;
  date: string;
  startTime: string | null;
  status: AttendanceStatus;
}

export interface ExceptionRow {
  id: string;
  type: 'CANCELLATION' | 'ABSENCE';
  workshopId: number;
  workshopName: string;
  date: string;
  details: string | null;
}

export interface Restriction {
  id: number;
  scope: 'GENERAL' | 'KIND' | 'WORKSHOP';
  kind: 'WORKSHOP' | 'EVENT' | null;
  workshopId: number | null;
  workshopName: string | null;
  reason: string | null;
  createdAt: string;
  removedAt: string | null;
  active: boolean;
}

export interface PublicWorkshop {
  id: number;
  kind: 'WORKSHOP' | 'EVENT';
  name: string;
  subtitle: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  sessionCount: number;
  isPaid: boolean;
  price: number | null;
  priceType: 'FIXED' | 'MONTHLY';
  registrationRequired: boolean;
  registrationMode: 'REQUIRED' | 'NOT_NEEDED' | 'RECOMMENDED';
  registrationOpen: boolean;
  closedReason: string | null;
  questions: { id: number; text: string; type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE'; required: boolean; options: { id: number; label: string }[] }[];
}

export interface AnswerInput {
  questionId: number;
  textValue?: string | null;
  optionId?: number | null;
  optionIds?: number[] | null;
}

// ======================= שפ"ח =======================
export type Track = 'PRIVATE' | 'SMAT';
export type TreatmentStatus = 'PENDING_THERAPIST' | 'PENDING_CONTRACT' | 'ACTIVE' | 'ACTIVE_EXTENSION' | 'PENDING_EXTENSION_SIGNATURE' | 'PAUSED' | 'FROZEN' | 'FINISHED';

export interface Therapist {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  type: Track;
  pricePerSession: number;
  active: boolean;
}

export interface Treatment {
  id: number;
  memberId: number;
  memberName: string;
  therapist: { id: number; fullName: string } | null;
  socialWorker: string | null;
  track: Track;
  status: TreatmentStatus;
  baseApprovedSessions: number;
  extensionSessions: number;
  pendingExtensionSessions: number;
  pendingExtensionIds: number[];
  approvedSessions: number;
  heldSessions: number;
  remainingSessions: number;
  overQuota: boolean;
  sessionCost: number | null;
  copayPerSession: number;
  yehudaApproval: boolean;
  intakeRef: string | null;
  startDate: string;
  endDate: string | null;
  endReason: string | null;
}

export interface MonthlyReport {
  id: number;
  treatmentId: number;
  therapistId: number;
  therapistName: string;
  year: number;
  month: number;
  sessionsHeld: number;
  paidCancellations: number;
  notes: string | null;
  ratePerSession: number;
  copayPerSession: number;
  sessionsCost: number;
  cancellationsCost: number;
  therapistTotal: number;
  copayTotal: number;
  status: 'DRAFT' | 'PENDING' | 'APPROVED';
  approvedAt: string | null;
  therapistPaymentStatus: 'PENDING' | 'ACCOUNTING' | 'PAID';
  copayPaymentStatus: 'PENDING' | 'PAID';
}

export interface TreatmentEvent {
  id: number;
  type: string;
  date: string;
  description: string;
  actor: string | null;
  details: string | null;
  exceptionKind: string | null;
}

export interface TreatmentHistory {
  therapists: { id: number; therapistId: number; therapistName: string; fromDate: string; toDate: string | null; changeReason: string | null; note: string | null; heldSessions: number }[];
  statuses: { id: number; fromStatus: string | null; toStatus: TreatmentStatus; reason: string | null; source: 'MANUAL' | 'AUTO'; createdAt: string }[];
  extensions: { id: number; number: number; additionalSessions: number; copayPerSession: number; extensionDate: string; yehudaApproval: boolean; signedAt: string | null }[];
}

export interface SocialReport {
  id: number;
  date: string;
  type: 'PSYCHOSOCIAL' | 'FIRST_SESSION_SUMMARY' | 'THERAPIST_FOLLOWUP' | 'GENERAL';
  title: string;
  content: string;
}

export interface MemberCopayRow {
  reportId: number;
  treatmentId: number;
  period: string;
  therapistName: string;
  amount: number;
  status: 'PENDING' | 'PAID';
}

export interface TreatmentExceptionRow {
  id: string;
  type: 'TREATMENT_LATE_PAYMENT' | 'TREATMENT_VIOLATION' | 'TREATMENT_MANUAL';
  treatmentId: number;
  date: string;
  details: string;
}

// ======================= פניות וליווי עו"ס =======================
export type RequestStatus = 'NEW' | 'REVIEW' | 'WAITING_INFO' | 'IN_PROGRESS' | 'HANDLED' | 'REJECTED' | 'CLOSED';
export interface ServiceRequest {
  id: number;
  memberId: number;
  memberName: string;
  type: string;
  subject: string;
  description: string | null;
  openedAt: string;
  source: string;
  assignee: string | null;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  status: RequestStatus;
  internalNote: string | null;
  decision: string | null;
  closeReason: string | null;
  updatedAt: string;
}
export interface RequestEvent {
  id: number;
  type: string;
  description: string;
  actor: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
}

export type SocialStatus = 'NOT_STARTED' | 'ACTIVE' | 'FROZEN' | 'FINISHED';
export interface SocialProcess {
  id: number;
  memberId: number;
  memberName: string;
  nationalInsurance: boolean;
  requestId: number | null;
  socialWorker: string | null;
  kinds: string[];
  type: 'ONE_TIME' | 'ONGOING';
  typeManual: boolean;
  suggestedType: 'ONE_TIME' | 'ONGOING' | null;
  goal: string | null;
  status: SocialStatus;
  startDate: string;
  endDate: string | null;
  endReason: string | null;
  endSummary: string | null;
  meetingCount: number;
  lastActivity: string;
}
export interface SocialMeeting {
  id: number;
  processId: number;
  date: string;
  time: string;
  subject: string;
  mode: string;
  durationMinutes: number | null;
  summary: string | null;
  followUpNotes: string | null;
  followUpRequired: boolean;
  number: number | null;
  status: 'HELD' | 'CANCELLED';
  cancelReason: string | null;
  topics: string[];
  meetingActions: string[];
  externalPartner: string | null;
}
export interface SocialIntervention {
  id: number;
  processId: number;
  date: string;
  type: string;
  description: string;
  involved: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  treatmentId: number | null;
  meetingId: number | null;
}
export interface SwReport {
  id: number;
  processId: number;
  type: 'PERIODIC' | 'GENERAL' | 'CLOSING';
  date: string;
  title: string;
  content: string;
}
export interface SocialEvent {
  id: number;
  type: string;
  description: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
}
export interface RequestRelated {
  socialProcesses: SocialProcess[];
  treatments: Treatment[];
}
export interface ProcessRelated {
  request: { id: number; subject: string; type: string; status: RequestStatus; openedAt: string } | null;
  treatments: { id: number; status: TreatmentStatus; track: Track; therapist: string | null; startDate: string }[];
  otherProcesses: SocialProcess[];
}
export interface TreatmentLinks {
  socialProcesses: SocialProcess[];
  requests: { id: number; subject: string; status: RequestStatus; openedAt: string }[];
}

// ======================= השלמות לפי מסמך הדרישות =======================
export interface MemberNote {
  id: number;
  text: string;
  author: string | null;
  createdAt: string;
}
export interface TreatmentMeeting {
  id: number;
  date: string;
  subject: string;
  subjectLabel: string;
  summary: string | null;
}
export interface TreatmentTask {
  id: number;
  title: string;
  dueDate: string | null;
  done: boolean;
}
