-- CreateEnum
CREATE TYPE "ScheduleEventSeriesStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleRecurrencePattern" AS ENUM ('NONE', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ScheduleWeekday" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "ScheduleEventOccurrenceStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleResourceType" AS ENUM ('STAGE', 'FOOD_SPOT', 'MARKET_SPOT', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleParticipantType" AS ENUM ('ENTERTAINMENT', 'FOOD_VENDOR', 'MARKET_VENDOR');

-- CreateEnum
CREATE TYPE "ScheduleParticipantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentKind" AS ENUM ('TIMED_SLOT', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ScheduleEventSeries" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "status" "ScheduleEventSeriesStatus" NOT NULL DEFAULT 'DRAFT',
    "recurrencePattern" "ScheduleRecurrencePattern" NOT NULL DEFAULT 'NONE',
    "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
    "recurrenceDays" "ScheduleWeekday"[] DEFAULT ARRAY[]::"ScheduleWeekday"[],
    "seasonStartsOn" TIMESTAMP(3) NOT NULL,
    "seasonEndsOn" TIMESTAMP(3) NOT NULL,
    "occurrenceDayStartsAtMinutes" INTEGER NOT NULL DEFAULT 0,
    "occurrenceDayEndsAtMinutes" INTEGER NOT NULL DEFAULT 1440,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEventOccurrence" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "scheduleEventSeriesId" TEXT NOT NULL,
    "name" TEXT,
    "occursOn" TIMESTAMP(3) NOT NULL,
    "dayStartsAtMinutes" INTEGER NOT NULL,
    "dayEndsAtMinutes" INTEGER NOT NULL,
    "status" "ScheduleEventOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleResource" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ScheduleResourceType" NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleParticipant" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ScheduleParticipantType" NOT NULL,
    "status" "ScheduleParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "scheduleEventOccurrenceId" TEXT NOT NULL,
    "scheduleResourceId" TEXT NOT NULL,
    "scheduleParticipantId" TEXT NOT NULL,
    "kind" "ScheduleAssignmentKind" NOT NULL,
    "status" "ScheduleAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAtMinutes" INTEGER NOT NULL,
    "endsAtMinutes" INTEGER NOT NULL,
    "publicTitle" TEXT,
    "publicSubtitle" TEXT,
    "publicDescription" TEXT,
    "publicLocationLabel" TEXT,
    "publicUrl" TEXT,
    "internalNotes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleEventSeries_brandId_idx" ON "ScheduleEventSeries"("brandId");

-- CreateIndex
CREATE INDEX "ScheduleEventSeries_status_idx" ON "ScheduleEventSeries"("status");

-- CreateIndex
CREATE INDEX "ScheduleEventSeries_seasonStartsOn_seasonEndsOn_idx" ON "ScheduleEventSeries"("seasonStartsOn", "seasonEndsOn");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEventSeries_brandId_slug_key" ON "ScheduleEventSeries"("brandId", "slug");

-- CreateIndex
CREATE INDEX "ScheduleEventOccurrence_brandId_idx" ON "ScheduleEventOccurrence"("brandId");

-- CreateIndex
CREATE INDEX "ScheduleEventOccurrence_scheduleEventSeriesId_idx" ON "ScheduleEventOccurrence"("scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "ScheduleEventOccurrence_occursOn_idx" ON "ScheduleEventOccurrence"("occursOn");

-- CreateIndex
CREATE INDEX "ScheduleEventOccurrence_brandId_occursOn_idx" ON "ScheduleEventOccurrence"("brandId", "occursOn");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEventOccurrence_scheduleEventSeriesId_occursOn_key" ON "ScheduleEventOccurrence"("scheduleEventSeriesId", "occursOn");

-- CreateIndex
CREATE INDEX "ScheduleResource_brandId_idx" ON "ScheduleResource"("brandId");

-- CreateIndex
CREATE INDEX "ScheduleResource_type_isActive_idx" ON "ScheduleResource"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResource_brandId_slug_key" ON "ScheduleResource"("brandId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleResource_brandId_name_key" ON "ScheduleResource"("brandId", "name");

-- CreateIndex
CREATE INDEX "ScheduleParticipant_brandId_idx" ON "ScheduleParticipant"("brandId");

-- CreateIndex
CREATE INDEX "ScheduleParticipant_type_status_idx" ON "ScheduleParticipant"("type", "status");

-- CreateIndex
CREATE INDEX "ScheduleParticipant_displayName_idx" ON "ScheduleParticipant"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleParticipant_brandId_slug_key" ON "ScheduleParticipant"("brandId", "slug");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_brandId_idx" ON "ScheduleAssignment"("brandId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleEventOccurrenceId_idx" ON "ScheduleAssignment"("scheduleEventOccurrenceId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_brandId_scheduleEventOccurrenceId_idx" ON "ScheduleAssignment"("brandId", "scheduleEventOccurrenceId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleResourceId_idx" ON "ScheduleAssignment"("scheduleResourceId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleParticipantId_idx" ON "ScheduleAssignment"("scheduleParticipantId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_status_idx" ON "ScheduleAssignment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_scheduleEventOccurrenceId_scheduleResourceI_key" ON "ScheduleAssignment"("scheduleEventOccurrenceId", "scheduleResourceId", "scheduleParticipantId", "startsAtMinutes", "endsAtMinutes");

-- AddForeignKey
ALTER TABLE "ScheduleEventSeries" ADD CONSTRAINT "ScheduleEventSeries_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEventOccurrence" ADD CONSTRAINT "ScheduleEventOccurrence_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEventOccurrence" ADD CONSTRAINT "ScheduleEventOccurrence_scheduleEventSeriesId_fkey" FOREIGN KEY ("scheduleEventSeriesId") REFERENCES "ScheduleEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleResource" ADD CONSTRAINT "ScheduleResource_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleParticipant" ADD CONSTRAINT "ScheduleParticipant_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleEventOccurrenceId_fkey" FOREIGN KEY ("scheduleEventOccurrenceId") REFERENCES "ScheduleEventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleResourceId_fkey" FOREIGN KEY ("scheduleResourceId") REFERENCES "ScheduleResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleParticipantId_fkey" FOREIGN KEY ("scheduleParticipantId") REFERENCES "ScheduleParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
