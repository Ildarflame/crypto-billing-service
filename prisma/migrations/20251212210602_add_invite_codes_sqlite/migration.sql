-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INVITE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "ownerEmail" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userEmail" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "licenseKey" TEXT,
    "status" TEXT NOT NULL,
    "startsAt" DATETIME,
    "expiresAt" DATETIME,
    "inviteCodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_inviteCodeId_fkey" FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("createdAt", "expiresAt", "id", "licenseKey", "planId", "productCode", "startsAt", "status", "updatedAt", "userEmail") SELECT "createdAt", "expiresAt", "id", "licenseKey", "planId", "productCode", "startsAt", "status", "updatedAt", "userEmail" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");
