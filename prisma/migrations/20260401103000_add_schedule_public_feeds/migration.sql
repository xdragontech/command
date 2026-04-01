-- Add event-scoped resource location IDs and public schedule feed configuration.
-- Existing resources are seeded from slug so rollout is non-destructive.

-- CreateEnum
CREATE TYPE "SchedulePublicFeedOrderBy" AS ENUM ('TIME_ASC', 'TIME_DESC', 'LOCATION_ID', 'NAME_ASC', 'NAME_DESC');

-- AlterTable
ALTER TABLE "ScheduleResource"
ADD COLUMN "locationId" TEXT;

UPDATE "ScheduleResource"
SET "locationId" = "slug"
WHERE "locationId" IS NULL;

ALTER TABLE "ScheduleResource"
ALTER COLUMN "locationId" SET NOT NULL;

-- CreateTable
CREATE TABLE "SchedulePublicFeed" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "scheduleEventSeriesId" TEXT NOT NULL,
    "scheduleResourceId" TEXT,
    "feedId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "weekdays" "ScheduleWeekday"[] DEFAULT ARRAY[]::"ScheduleWeekday"[],
    "resourceType" "ScheduleResourceType" NOT NULL,
    "participantType" "ScheduleParticipantType" NOT NULL,
    "orderBy" "SchedulePublicFeedOrderBy" NOT NULL DEFAULT 'TIME_ASC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePublicFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResource_scheduleEventSeriesId_locationId_key" ON "ScheduleResource"("scheduleEventSeriesId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePublicFeed_feedId_key" ON "SchedulePublicFeed"("feedId");

-- CreateIndex
CREATE INDEX "SchedulePublicFeed_brandId_idx" ON "SchedulePublicFeed"("brandId");

-- CreateIndex
CREATE INDEX "SchedulePublicFeed_scheduleEventSeriesId_idx" ON "SchedulePublicFeed"("scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "SchedulePublicFeed_scheduleResourceId_idx" ON "SchedulePublicFeed"("scheduleResourceId");

-- CreateIndex
CREATE INDEX "SchedulePublicFeed_isActive_idx" ON "SchedulePublicFeed"("isActive");

-- AddForeignKey
ALTER TABLE "SchedulePublicFeed"
ADD CONSTRAINT "SchedulePublicFeed_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePublicFeed"
ADD CONSTRAINT "SchedulePublicFeed_scheduleEventSeriesId_fkey"
FOREIGN KEY ("scheduleEventSeriesId") REFERENCES "ScheduleEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePublicFeed"
ADD CONSTRAINT "SchedulePublicFeed_scheduleResourceId_fkey"
FOREIGN KEY ("scheduleResourceId") REFERENCES "ScheduleResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
