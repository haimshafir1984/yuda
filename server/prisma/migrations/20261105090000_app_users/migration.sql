-- AlterTable
ALTER TABLE "TreatmentEvent" ADD COLUMN "performedBy" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequestEvent" ADD COLUMN "performedBy" TEXT;

-- AlterTable
ALTER TABLE "SocialWorkEvent" ADD COLUMN "performedBy" TEXT;

-- CreateTable
CREATE TABLE "AppUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_name_key" ON "AppUser"("name");

