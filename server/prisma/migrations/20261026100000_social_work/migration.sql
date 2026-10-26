-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "openedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "assignee" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "internalNote" TEXT,
    "decision" TEXT,
    "closeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceRequestEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actor" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceRequestTreatment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "treatmentId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRequestTreatment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequestTreatment_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkProcess" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "requestId" INTEGER,
    "socialWorker" TEXT,
    "kinds" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "endReason" TEXT,
    "endSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialWorkProcess_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialWorkProcess_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkMeeting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "meetingAt" DATETIME NOT NULL,
    "subject" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "summary" TEXT,
    "followUpNotes" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialWorkMeeting_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SocialWorkProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkIntervention" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "involved" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "treatmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialWorkIntervention_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SocialWorkProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialWorkIntervention_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialWorkReport_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SocialWorkProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialWorkEvent_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SocialWorkProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialWorkProcessTreatment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "treatmentId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialWorkProcessTreatment_processId_fkey" FOREIGN KEY ("processId") REFERENCES "SocialWorkProcess" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialWorkProcessTreatment_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceRequest_memberId_idx" ON "ServiceRequest"("memberId");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "ServiceRequestEvent_requestId_idx" ON "ServiceRequestEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestTreatment_requestId_treatmentId_key" ON "ServiceRequestTreatment"("requestId", "treatmentId");

-- CreateIndex
CREATE INDEX "SocialWorkProcess_memberId_idx" ON "SocialWorkProcess"("memberId");

-- CreateIndex
CREATE INDEX "SocialWorkProcess_requestId_idx" ON "SocialWorkProcess"("requestId");

-- CreateIndex
CREATE INDEX "SocialWorkProcess_status_idx" ON "SocialWorkProcess"("status");

-- CreateIndex
CREATE INDEX "SocialWorkMeeting_processId_meetingAt_idx" ON "SocialWorkMeeting"("processId", "meetingAt");

-- CreateIndex
CREATE INDEX "SocialWorkIntervention_processId_idx" ON "SocialWorkIntervention"("processId");

-- CreateIndex
CREATE INDEX "SocialWorkReport_processId_idx" ON "SocialWorkReport"("processId");

-- CreateIndex
CREATE INDEX "SocialWorkEvent_processId_idx" ON "SocialWorkEvent"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialWorkProcessTreatment_processId_treatmentId_key" ON "SocialWorkProcessTreatment"("processId", "treatmentId");

