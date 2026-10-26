-- CreateTable
CREATE TABLE "Therapist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "type" TEXT NOT NULL,
    "pricePerSession" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PsychologicalTreatment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "socialWorker" TEXT,
    "track" TEXT NOT NULL,
    "currentTherapistId" INTEGER,
    "status" TEXT NOT NULL,
    "approvedSessions" INTEGER NOT NULL,
    "sessionCost" REAL,
    "copayPerSession" REAL NOT NULL DEFAULT 0,
    "yehudaApproval" BOOLEAN NOT NULL DEFAULT false,
    "intakeRef" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "endReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PsychologicalTreatment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PsychologicalTreatment_currentTherapistId_fkey" FOREIGN KEY ("currentTherapistId") REFERENCES "Therapist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentMonthlyReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "therapistId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "sessionsHeld" INTEGER NOT NULL,
    "paidCancellations" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "ratePerSession" REAL NOT NULL,
    "copayPerSession" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "therapistPaymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "copayPaymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TreatmentMonthlyReport_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TreatmentMonthlyReport_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentExtension" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "additionalSessions" INTEGER NOT NULL,
    "copayPerSession" REAL NOT NULL,
    "yehudaApproval" BOOLEAN NOT NULL,
    "extensionDate" DATETIME NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentExtension_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "actor" TEXT,
    "details" TEXT,
    "exceptionKind" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentEvent_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentStatusHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentStatusHistory_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentTherapistHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "therapistId" INTEGER NOT NULL,
    "fromDate" DATETIME NOT NULL,
    "toDate" DATETIME,
    "changeReason" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentTherapistHistory_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TreatmentTherapistHistory_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentSocialWorkerReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TreatmentSocialWorkerReport_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PsychologicalTreatment_memberId_idx" ON "PsychologicalTreatment"("memberId");

-- CreateIndex
CREATE INDEX "PsychologicalTreatment_status_idx" ON "PsychologicalTreatment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentMonthlyReport_treatmentId_therapistId_year_month_key" ON "TreatmentMonthlyReport"("treatmentId", "therapistId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentExtension_treatmentId_idempotencyKey_key" ON "TreatmentExtension"("treatmentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TreatmentEvent_treatmentId_date_idx" ON "TreatmentEvent"("treatmentId", "date");

-- CreateIndex
CREATE INDEX "TreatmentStatusHistory_treatmentId_idx" ON "TreatmentStatusHistory"("treatmentId");

-- CreateIndex
CREATE INDEX "TreatmentTherapistHistory_treatmentId_idx" ON "TreatmentTherapistHistory"("treatmentId");

-- CreateIndex
CREATE INDEX "TreatmentSocialWorkerReport_treatmentId_idx" ON "TreatmentSocialWorkerReport"("treatmentId");

