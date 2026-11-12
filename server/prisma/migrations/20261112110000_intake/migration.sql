-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN "candidateId" INTEGER;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalId" TEXT,
    "birthDate" DATETIME,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "childrenCount" INTEGER,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "preferredChannel" TEXT NOT NULL DEFAULT 'SMS',
    "community" TEXT,
    "elementarySchool" TEXT,
    "highSchool" TEXT,
    "howHeard" TEXT,
    "whyJoin" TEXT,
    "anythingElse" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "statusChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeCode" TEXT,
    "rejectionReason" TEXT,
    "rejectionNote" TEXT,
    "coordinator" TEXT,
    "callDate" DATETIME,
    "callSummary" TEXT,
    "previousId" INTEGER,
    "repeatReason" TEXT,
    "existingMemberId" INTEGER,
    "memberId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Candidate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateInvitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "offered" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "response" TEXT,
    "note" TEXT,
    "chosen" TEXT,
    CONSTRAINT "CandidateInvitation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "coordinator" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InterviewSignup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "attended" BOOLEAN,
    "decision" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewSignup_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InterviewSignup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "signupId" INTEGER,
    "token" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filledAt" DATETIME,
    "answers" TEXT,
    CONSTRAINT "Questionnaire_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonalMeeting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "scheduledAt" DATETIME,
    "heldAt" DATETIME,
    "noShow" BOOLEAN NOT NULL DEFAULT false,
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalMeeting_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "Candidate_phoneNormalized_idx" ON "Candidate"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Candidate_nationalId_idx" ON "Candidate"("nationalId");

-- CreateIndex
CREATE INDEX "CandidateEvent_candidateId_idx" ON "CandidateEvent"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateInvitation_token_key" ON "CandidateInvitation"("token");

-- CreateIndex
CREATE INDEX "CandidateInvitation_candidateId_idx" ON "CandidateInvitation"("candidateId");

-- CreateIndex
CREATE INDEX "InterviewSession_date_idx" ON "InterviewSession"("date");

-- CreateIndex
CREATE INDEX "InterviewSignup_sessionId_idx" ON "InterviewSignup"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSignup_candidateId_sessionId_key" ON "InterviewSignup"("candidateId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Questionnaire_token_key" ON "Questionnaire"("token");

-- CreateIndex
CREATE INDEX "Questionnaire_candidateId_idx" ON "Questionnaire"("candidateId");

-- CreateIndex
CREATE INDEX "PersonalMeeting_candidateId_idx" ON "PersonalMeeting"("candidateId");

