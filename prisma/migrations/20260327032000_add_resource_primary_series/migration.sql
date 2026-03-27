-- AlterTable
ALTER TABLE "ScheduleResource"
ADD COLUMN "scheduleEventSeriesId" TEXT;

-- CreateIndex
CREATE INDEX "ScheduleResource_scheduleEventSeriesId_idx" ON "ScheduleResource"("scheduleEventSeriesId");

-- AddForeignKey
ALTER TABLE "ScheduleResource"
ADD CONSTRAINT "ScheduleResource_scheduleEventSeriesId_fkey"
FOREIGN KEY ("scheduleEventSeriesId") REFERENCES "ScheduleEventSeries"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
