-- CreateTable
CREATE TABLE "SourceStatus" (
    "sourceName" TEXT NOT NULL PRIMARY KEY,
    "lastAttemptAt" DATETIME NOT NULL,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    "lastItemCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0
);
