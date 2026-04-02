-- Add partner application, review, requirement, and sponsor tier foundations.

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN'
);

-- CreateEnum
CREATE TYPE "PartnerApplicationReviewDecision" AS ENUM (
  'NOTE',
  'MARK_IN_REVIEW',
  'APPROVE',
  'REJECT'
);

-- CreateEnum
CREATE TYPE "ParticipantRequirementType" AS ENUM (
  'BUSINESS_LICENSE',
  'HEALTH_PERMIT',
  'BUSINESS_INSURANCE',
  'FIRE_PERMIT'
);

-- CreateEnum
CREATE TYPE "ParticipantRequirementReviewerState" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "partnerProfileId" TEXT NOT NULL,
    "scheduleEventSeriesId" TEXT NOT NULL,
    "applicationKind" "PartnerKind" NOT NULL,
    "submittedProfileSnapshot" JSONB,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplicationReview" (
    "id" TEXT NOT NULL,
    "partnerApplicationId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "decision" "PartnerApplicationReviewDecision" NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApplicationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantRequirement" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "partnerProfileId" TEXT NOT NULL,
    "requirementType" "ParticipantRequirementType" NOT NULL,
    "partnerAssetId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "reviewerState" "ParticipantRequirementReviewerState" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewerNotes" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "lastReviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorTier" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorEventAssignment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sponsorPartnerProfileId" TEXT NOT NULL,
    "scheduleEventSeriesId" TEXT NOT NULL,
    "sponsorTierId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorEventAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_partnerProfileId_scheduleEventSeriesId_key" ON "PartnerApplication"("partnerProfileId", "scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "PartnerApplication_brandId_idx" ON "PartnerApplication"("brandId");

-- CreateIndex
CREATE INDEX "PartnerApplication_scheduleEventSeriesId_idx" ON "PartnerApplication"("scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_idx" ON "PartnerApplication"("status");

-- CreateIndex
CREATE INDEX "PartnerApplication_applicationKind_status_idx" ON "PartnerApplication"("applicationKind", "status");

-- CreateIndex
CREATE INDEX "PartnerApplicationReview_partnerApplicationId_idx" ON "PartnerApplicationReview"("partnerApplicationId");

-- CreateIndex
CREATE INDEX "PartnerApplicationReview_reviewerUserId_idx" ON "PartnerApplicationReview"("reviewerUserId");

-- CreateIndex
CREATE INDEX "PartnerApplicationReview_decision_idx" ON "PartnerApplicationReview"("decision");

-- CreateIndex
CREATE INDEX "PartnerApplicationReview_createdAt_idx" ON "PartnerApplicationReview"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantRequirement_partnerProfileId_requirementType_key" ON "ParticipantRequirement"("partnerProfileId", "requirementType");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantRequirement_partnerAssetId_key" ON "ParticipantRequirement"("partnerAssetId");

-- CreateIndex
CREATE INDEX "ParticipantRequirement_brandId_idx" ON "ParticipantRequirement"("brandId");

-- CreateIndex
CREATE INDEX "ParticipantRequirement_reviewerState_idx" ON "ParticipantRequirement"("reviewerState");

-- CreateIndex
CREATE INDEX "ParticipantRequirement_expiresAt_idx" ON "ParticipantRequirement"("expiresAt");

-- CreateIndex
CREATE INDEX "ParticipantRequirement_lastReviewedByUserId_idx" ON "ParticipantRequirement"("lastReviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorTier_brandId_name_key" ON "SponsorTier"("brandId", "name");

-- CreateIndex
CREATE INDEX "SponsorTier_brandId_idx" ON "SponsorTier"("brandId");

-- CreateIndex
CREATE INDEX "SponsorTier_brandId_isActive_sortOrder_idx" ON "SponsorTier"("brandId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorEventAssignment_sponsorPartnerProfileId_scheduleEventSeriesId_key" ON "SponsorEventAssignment"("sponsorPartnerProfileId", "scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "SponsorEventAssignment_brandId_idx" ON "SponsorEventAssignment"("brandId");

-- CreateIndex
CREATE INDEX "SponsorEventAssignment_scheduleEventSeriesId_idx" ON "SponsorEventAssignment"("scheduleEventSeriesId");

-- CreateIndex
CREATE INDEX "SponsorEventAssignment_sponsorTierId_idx" ON "SponsorEventAssignment"("sponsorTierId");

-- AddForeignKey
ALTER TABLE "PartnerApplication"
ADD CONSTRAINT "PartnerApplication_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication"
ADD CONSTRAINT "PartnerApplication_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication"
ADD CONSTRAINT "PartnerApplication_scheduleEventSeriesId_fkey"
FOREIGN KEY ("scheduleEventSeriesId") REFERENCES "ScheduleEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationReview"
ADD CONSTRAINT "PartnerApplicationReview_partnerApplicationId_fkey"
FOREIGN KEY ("partnerApplicationId") REFERENCES "PartnerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplicationReview"
ADD CONSTRAINT "PartnerApplicationReview_reviewerUserId_fkey"
FOREIGN KEY ("reviewerUserId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantRequirement"
ADD CONSTRAINT "ParticipantRequirement_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantRequirement"
ADD CONSTRAINT "ParticipantRequirement_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "ParticipantPartnerProfile"("partnerProfileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantRequirement"
ADD CONSTRAINT "ParticipantRequirement_partnerAssetId_fkey"
FOREIGN KEY ("partnerAssetId") REFERENCES "PartnerAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantRequirement"
ADD CONSTRAINT "ParticipantRequirement_lastReviewedByUserId_fkey"
FOREIGN KEY ("lastReviewedByUserId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorTier"
ADD CONSTRAINT "SponsorTier_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorEventAssignment"
ADD CONSTRAINT "SponsorEventAssignment_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorEventAssignment"
ADD CONSTRAINT "SponsorEventAssignment_sponsorPartnerProfileId_fkey"
FOREIGN KEY ("sponsorPartnerProfileId") REFERENCES "SponsorPartnerProfile"("partnerProfileId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorEventAssignment"
ADD CONSTRAINT "SponsorEventAssignment_scheduleEventSeriesId_fkey"
FOREIGN KEY ("scheduleEventSeriesId") REFERENCES "ScheduleEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorEventAssignment"
ADD CONSTRAINT "SponsorEventAssignment_sponsorTierId_fkey"
FOREIGN KEY ("sponsorTierId") REFERENCES "SponsorTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
