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
  type: 'TEXT' | 'SINGLE_CHOICE';
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
  scope: 'GENERAL' | 'WORKSHOP';
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
  registrationRequired: boolean;
  registrationOpen: boolean;
  closedReason: string | null;
  questions: { id: number; text: string; type: 'TEXT' | 'SINGLE_CHOICE'; required: boolean; options: { id: number; label: string }[] }[];
}

export interface AnswerInput {
  questionId: number;
  textValue?: string | null;
  optionId?: number | null;
}
