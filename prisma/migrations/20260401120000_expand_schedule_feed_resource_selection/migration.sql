-- Expand public schedule feeds from single-resource selection to all/selected-resource scopes.
-- Existing single-resource feeds are backfilled into the new join table.

-- CreateEnum
CREATE TYPE "SchedulePublicFeedResourceSelectionMode" AS ENUM ('ALL', 'SELECTED');

-- AlterTable
ALTER TABLE "SchedulePublicFeed"
ADD COLUMN "resourceSelectionMode" "SchedulePublicFeedResourceSelectionMode" NOT NULL DEFAULT 'SELECTED';

UPDATE "SchedulePublicFeed"
SET "resourceSelectionMode" = 'ALL'
WHERE "scheduleResourceId" IS NULL;

-- CreateTable
CREATE TABLE "SchedulePublicFeedResource" (
    "id" TEXT NOT NULL,
    "schedulePublicFeedId" TEXT NOT NULL,
    "scheduleResourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePublicFeedResource_pkey" PRIMARY KEY ("id")
);

-- Backfill previously single-resource feeds.
INSERT INTO "SchedulePublicFeedResource" (
    "id",
    "schedulePublicFeedId",
    "scheduleResourceId",
    "createdAt"
)
SELECT
    'feedres_' || substring(md5("id" || ':' || "scheduleResourceId") for 24),
    "id",
    "scheduleResourceId",
    CURRENT_TIMESTAMP
FROM "SchedulePublicFeed"
WHERE "scheduleResourceId" IS NOT NULL;

-- Drop legacy single-resource column.
DROP INDEX IF EXISTS "SchedulePublicFeed_scheduleResourceId_idx";

ALTER TABLE "SchedulePublicFeed"
DROP CONSTRAINT IF EXISTS "SchedulePublicFeed_scheduleResourceId_fkey";

ALTER TABLE "SchedulePublicFeed"
DROP COLUMN IF EXISTS "scheduleResourceId";

-- CreateIndex
CREATE INDEX "SchedulePublicFeedResource_schedulePublicFeedId_idx" ON "SchedulePublicFeedResource"("schedulePublicFeedId");

-- CreateIndex
CREATE INDEX "SchedulePublicFeedResource_scheduleResourceId_idx" ON "SchedulePublicFeedResource"("scheduleResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePublicFeedResource_schedulePublicFeedId_scheduleResourceId_key" ON "SchedulePublicFeedResource"("schedulePublicFeedId", "scheduleResourceId");

-- AddForeignKey
ALTER TABLE "SchedulePublicFeedResource"
ADD CONSTRAINT "SchedulePublicFeedResource_schedulePublicFeedId_fkey"
FOREIGN KEY ("schedulePublicFeedId") REFERENCES "SchedulePublicFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePublicFeedResource"
ADD CONSTRAINT "SchedulePublicFeedResource_scheduleResourceId_fkey"
FOREIGN KEY ("scheduleResourceId") REFERENCES "ScheduleResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
