-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenCategories" TEXT NOT NULL DEFAULT '',
    "onboardingCompletedAt" DATETIME,
    "feedCutoff" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- existing accounts start from "now", stored as epoch milliseconds like
-- every DateTime Prisma writes — CURRENT_TIMESTAMP would store text, and in
-- SQLite text never compares as less than a number
INSERT INTO "new_User" ("createdAt", "email", "hiddenCategories", "id", "onboardingCompletedAt", "passwordHash", "feedCutoff") SELECT "createdAt", "email", "hiddenCategories", "id", "onboardingCompletedAt", "passwordHash", CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
