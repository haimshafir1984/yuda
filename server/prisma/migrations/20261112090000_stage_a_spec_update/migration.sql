-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN "eventType" TEXT;

-- AlterTable
ALTER TABLE "SocialWorkProcess" ADD COLUMN "externalResponses" TEXT;
ALTER TABLE "SocialWorkProcess" ADD COLUMN "needs" TEXT;
ALTER TABLE "SocialWorkProcess" ADD COLUMN "needsNote" TEXT;
ALTER TABLE "SocialWorkProcess" ADD COLUMN "programNote" TEXT;
ALTER TABLE "SocialWorkProcess" ADD COLUMN "programStartDate" DATETIME;
ALTER TABLE "SocialWorkProcess" ADD COLUMN "responses" TEXT;

-- CreateTable
CREATE TABLE "MemberRemoval" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "handledBy" TEXT,
    "endDate" DATETIME,
    "condition" TEXT,
    "complaintId" INTEGER,
    "returnedAt" DATETIME,
    "returnedBy" TEXT,
    "returnNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberRemoval_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receivedAt" DATETIME NOT NULL,
    "complainantType" TEXT NOT NULL,
    "complainantMemberId" INTEGER,
    "complainantName" TEXT,
    "subjectMemberId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "actionTaken" TEXT,
    "actionNote" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Complaint_subjectMemberId_fkey" FOREIGN KEY ("subjectMemberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Complaint_complainantMemberId_fkey" FOREIGN KEY ("complainantMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplaintEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "complaintId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintEntry_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediationCase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "mediator" TEXT NOT NULL,
    "mediator2" TEXT,
    "parents" TEXT NOT NULL,
    "parentsOther" TEXT,
    "initiatedBy" TEXT NOT NULL,
    "need" TEXT,
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "goalAchieved" BOOLEAN,
    "endSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediationCase_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediationContact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "caseId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "withWhom" TEXT,
    "summary" TEXT,
    "place" TEXT,
    "effect" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediationContact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "MediationCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Member" (
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
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Member" ("birthYear", "createdAt", "email", "firstName", "gender", "id", "joinDate", "lastName", "maritalStatus", "nationalId", "nationalInsurance", "phone", "phoneNormalized", "preferredChannel", "updatedAt") SELECT "birthYear", "createdAt", "email", "firstName", "gender", "id", "joinDate", "lastName", "maritalStatus", "nationalId", "nationalInsurance", "phone", "phoneNormalized", "preferredChannel", "updatedAt" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE UNIQUE INDEX "Member_nationalId_key" ON "Member"("nationalId");
CREATE INDEX "Member_phoneNormalized_idx" ON "Member"("phoneNormalized");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MemberRemoval_memberId_idx" ON "MemberRemoval"("memberId");

-- CreateIndex
CREATE INDEX "Complaint_subjectMemberId_idx" ON "Complaint"("subjectMemberId");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "ComplaintEntry_complaintId_idx" ON "ComplaintEntry"("complaintId");

-- CreateIndex
CREATE INDEX "MediationCase_memberId_idx" ON "MediationCase"("memberId");

-- CreateIndex
CREATE INDEX "MediationContact_caseId_idx" ON "MediationContact"("caseId");

