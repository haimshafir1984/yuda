-- AlterTable
ALTER TABLE "MemberRestriction" ADD COLUMN "kind" TEXT;

-- AlterTable
ALTER TABLE "TreatmentExtension" ADD COLUMN "signedAt" DATETIME;

-- AlterTable
ALTER TABLE "SocialWorkIntervention" ADD COLUMN "meetingId" INTEGER;

-- CreateTable
CREATE TABLE "MemberNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SOCIAL',
    "text" TEXT NOT NULL,
    "author" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberNote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentMeeting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentMeeting_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreatmentTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "treatmentId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreatmentTask_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "PsychologicalTreatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- הוספת עמודות בלבד (ללא יצירה מחדש של טבלאות), כדי לשמור על כל הנתונים הקיימים.
ALTER TABLE "Workshop" ADD COLUMN "registrationMode" TEXT NOT NULL DEFAULT 'REQUIRED';
ALTER TABLE "Workshop" ADD COLUMN "autoCloseRegistration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workshop" ADD COLUMN "priceType" TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Workshop" ADD COLUMN "excludeParticipantsOfWorkshopId" INTEGER;
ALTER TABLE "Workshop" ADD COLUMN "rejectMessage" TEXT;
ALTER TABLE "Workshop" ADD COLUMN "closedMessage" TEXT;
ALTER TABLE "Workshop" ADD COLUMN "completionMessage" TEXT;
UPDATE "Workshop" SET "registrationMode" = 'NOT_NEEDED' WHERE "registrationRequired" = 0;

ALTER TABLE "SocialWorkProcess" ADD COLUMN "typeManual" BOOLEAN NOT NULL DEFAULT false;
-- תהליכים קיימים הוגדרו ידנית: שומרים את הסוג שלהם
UPDATE "SocialWorkProcess" SET "typeManual" = 1;

ALTER TABLE "SocialWorkMeeting" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'HELD';
ALTER TABLE "SocialWorkMeeting" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "SocialWorkMeeting" ADD COLUMN "topics" TEXT;
ALTER TABLE "SocialWorkMeeting" ADD COLUMN "meetingActions" TEXT;
ALTER TABLE "SocialWorkMeeting" ADD COLUMN "externalPartner" TEXT;

-- הארכות קיימות נכנסו לתוקף מיד, ולכן נחשבות חתומות
UPDATE "TreatmentExtension" SET "signedAt" = "createdAt" WHERE "signedAt" IS NULL;

-- CreateIndex
CREATE INDEX "MemberNote_memberId_idx" ON "MemberNote"("memberId");

-- CreateIndex
CREATE INDEX "TreatmentMeeting_treatmentId_idx" ON "TreatmentMeeting"("treatmentId");

-- CreateIndex
CREATE INDEX "TreatmentTask_treatmentId_idx" ON "TreatmentTask"("treatmentId");
