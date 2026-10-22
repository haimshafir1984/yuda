-- CreateTable
CREATE TABLE "Member" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "nationalId" TEXT,
    "birthYear" INTEGER,
    "maritalStatus" TEXT,
    "nationalInsurance" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT NOT NULL DEFAULT 'SMS',
    "joinDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "facilitator" TEXT,
    "format" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "price" REAL,
    "nationalInsurance" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "registrationRequired" BOOLEAN NOT NULL DEFAULT true,
    "genderRestriction" TEXT,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "requireNationalInsurance" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkshopSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workshopId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkshopSession_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "workshopId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "Registration_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Registration_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "markedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkshopSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemberRestriction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "workshopId" INTEGER,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" DATETIME,
    CONSTRAINT "MemberRestriction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberRestriction_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkshopQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workshopId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WorkshopQuestion_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WorkshopQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistrationAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "textValue" TEXT,
    "optionId" INTEGER,
    CONSTRAINT "RegistrationAnswer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RegistrationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WorkshopQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RegistrationAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuestionOption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_nationalId_key" ON "Member"("nationalId");

-- CreateIndex
CREATE INDEX "Member_phoneNormalized_idx" ON "Member"("phoneNormalized");

-- CreateIndex
CREATE INDEX "WorkshopSession_workshopId_date_idx" ON "WorkshopSession"("workshopId", "date");

-- CreateIndex
CREATE INDEX "Registration_memberId_idx" ON "Registration"("memberId");

-- CreateIndex
CREATE INDEX "Registration_workshopId_status_idx" ON "Registration"("workshopId", "status");

-- CreateIndex
CREATE INDEX "Attendance_sessionId_idx" ON "Attendance"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_registrationId_sessionId_key" ON "Attendance"("registrationId", "sessionId");

-- CreateIndex
CREATE INDEX "MemberRestriction_memberId_removedAt_idx" ON "MemberRestriction"("memberId", "removedAt");

-- CreateIndex
CREATE INDEX "WorkshopQuestion_workshopId_idx" ON "WorkshopQuestion"("workshopId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationAnswer_registrationId_questionId_key" ON "RegistrationAnswer"("registrationId", "questionId");

-- מניעת הרשמה פעילה כפולה של אותו חבר לאותה סדנה (ביטולים נשמרים כהיסטוריה)
CREATE UNIQUE INDEX "Registration_one_active_per_member_workshop" ON "Registration"("memberId", "workshopId") WHERE "status" = 'ACTIVE';
