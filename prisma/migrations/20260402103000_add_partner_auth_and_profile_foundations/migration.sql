-- Add shared partner auth, profile subtypes, upload metadata, and schedulable participant linkage.

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('PARTICIPANT', 'SPONSOR');

-- CreateEnum
CREATE TYPE "PartnerUserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ScheduleParticipantSource" AS ENUM ('MANUAL', 'PARTNER_APPROVED');

-- CreateEnum
CREATE TYPE "PartnerEntertainmentType" AS ENUM ('LIVE_BAND', 'DJ', 'COMEDY', 'MAGIC');

-- CreateEnum
CREATE TYPE "PartnerFoodSetupType" AS ENUM ('TRUCK', 'TRAILER', 'CART', 'STAND');

-- CreateEnum
CREATE TYPE "PartnerMarketType" AS ENUM ('APPAREL', 'JEWELRY', 'DECOR', 'SKINCARE', 'FOOD', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerSponsorType" AS ENUM ('DIRECT', 'IN_KIND', 'MEDIA');

-- CreateEnum
CREATE TYPE "PartnerAssetKind" AS ENUM ('PROFILE_IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "PartnerAssetStorageProvider" AS ENUM ('CF_R2');

-- CreateEnum
CREATE TYPE "PartnerAssetStorageBucket" AS ENUM ('PUBLIC_MEDIA', 'PRIVATE_DOCUMENTS');

-- AlterTable
ALTER TABLE "ScheduleParticipant"
ADD COLUMN "partnerProfileId" TEXT,
ADD COLUMN "source" "ScheduleParticipantSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "PartnerUser" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "status" "PartnerUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "PartnerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLoginEvent" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "countryIso2" TEXT,
    "countryName" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerEmailVerificationToken" (
    "brandId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PartnerPasswordResetToken" (
    "brandId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "profileCompletedAt" TIMESTAMP(3),
    "mainImageAssetId" TEXT,
    "mainWebsiteUrl" TEXT,
    "socialLinks" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantPartnerProfile" (
    "partnerProfileId" TEXT NOT NULL,
    "participantType" "ScheduleParticipantType" NOT NULL,
    "entertainmentType" "PartnerEntertainmentType",
    "entertainmentStyle" TEXT,
    "foodStyle" TEXT,
    "foodSetupType" "PartnerFoodSetupType",
    "marketType" "PartnerMarketType",
    "specialRequirements" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantPartnerProfile_pkey" PRIMARY KEY ("partnerProfileId")
);

-- CreateTable
CREATE TABLE "SponsorPartnerProfile" (
    "partnerProfileId" TEXT NOT NULL,
    "productServiceType" TEXT NOT NULL,
    "audienceProfile" TEXT,
    "marketingGoals" TEXT,
    "onsitePlacement" TEXT,
    "signageInformation" TEXT,
    "staffed" BOOLEAN,
    "sponsorType" "PartnerSponsorType",
    "requests" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorPartnerProfile_pkey" PRIMARY KEY ("partnerProfileId")
);

-- CreateTable
CREATE TABLE "PartnerAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "partnerProfileId" TEXT NOT NULL,
    "kind" "PartnerAssetKind" NOT NULL,
    "storageProvider" "PartnerAssetStorageProvider" NOT NULL DEFAULT 'CF_R2',
    "storageBucket" "PartnerAssetStorageBucket" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleParticipant_partnerProfileId_key" ON "ScheduleParticipant"("partnerProfileId");

-- CreateIndex
CREATE INDEX "ScheduleParticipant_source_idx" ON "ScheduleParticipant"("source");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerUser_brandId_email_key" ON "PartnerUser"("brandId", "email");

-- CreateIndex
CREATE INDEX "PartnerUser_brandId_idx" ON "PartnerUser"("brandId");

-- CreateIndex
CREATE INDEX "PartnerUser_email_idx" ON "PartnerUser"("email");

-- CreateIndex
CREATE INDEX "PartnerUser_kind_status_idx" ON "PartnerUser"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerSession_sessionToken_key" ON "PartnerSession"("sessionToken");

-- CreateIndex
CREATE INDEX "PartnerSession_partnerUserId_idx" ON "PartnerSession"("partnerUserId");

-- CreateIndex
CREATE INDEX "PartnerLoginEvent_partnerUserId_idx" ON "PartnerLoginEvent"("partnerUserId");

-- CreateIndex
CREATE INDEX "PartnerLoginEvent_brandId_idx" ON "PartnerLoginEvent"("brandId");

-- CreateIndex
CREATE INDEX "PartnerLoginEvent_createdAt_idx" ON "PartnerLoginEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerEmailVerificationToken_token_key" ON "PartnerEmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "PartnerEmailVerificationToken_brandId_identifier_idx" ON "PartnerEmailVerificationToken"("brandId", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPasswordResetToken_token_key" ON "PartnerPasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PartnerPasswordResetToken_brandId_identifier_idx" ON "PartnerPasswordResetToken"("brandId", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_partnerUserId_key" ON "PartnerProfile"("partnerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_mainImageAssetId_key" ON "PartnerProfile"("mainImageAssetId");

-- CreateIndex
CREATE INDEX "PartnerProfile_brandId_idx" ON "PartnerProfile"("brandId");

-- CreateIndex
CREATE INDEX "PartnerProfile_displayName_idx" ON "PartnerProfile"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_brandId_slug_key" ON "PartnerProfile"("brandId", "slug");

-- CreateIndex
CREATE INDEX "ParticipantPartnerProfile_participantType_idx" ON "ParticipantPartnerProfile"("participantType");

-- CreateIndex
CREATE INDEX "PartnerAsset_brandId_idx" ON "PartnerAsset"("brandId");

-- CreateIndex
CREATE INDEX "PartnerAsset_partnerProfileId_idx" ON "PartnerAsset"("partnerProfileId");

-- CreateIndex
CREATE INDEX "PartnerAsset_kind_idx" ON "PartnerAsset"("kind");

-- CreateIndex
CREATE INDEX "PartnerAsset_storageBucket_idx" ON "PartnerAsset"("storageBucket");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAsset_storageBucket_objectKey_key" ON "PartnerAsset"("storageBucket", "objectKey");

-- AddForeignKey
ALTER TABLE "ScheduleParticipant"
ADD CONSTRAINT "ScheduleParticipant_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser"
ADD CONSTRAINT "PartnerUser_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSession"
ADD CONSTRAINT "PartnerSession_partnerUserId_fkey"
FOREIGN KEY ("partnerUserId") REFERENCES "PartnerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLoginEvent"
ADD CONSTRAINT "PartnerLoginEvent_partnerUserId_fkey"
FOREIGN KEY ("partnerUserId") REFERENCES "PartnerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLoginEvent"
ADD CONSTRAINT "PartnerLoginEvent_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerEmailVerificationToken"
ADD CONSTRAINT "PartnerEmailVerificationToken_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPasswordResetToken"
ADD CONSTRAINT "PartnerPasswordResetToken_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_partnerUserId_fkey"
FOREIGN KEY ("partnerUserId") REFERENCES "PartnerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantPartnerProfile"
ADD CONSTRAINT "ParticipantPartnerProfile_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorPartnerProfile"
ADD CONSTRAINT "SponsorPartnerProfile_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAsset"
ADD CONSTRAINT "PartnerAsset_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAsset"
ADD CONSTRAINT "PartnerAsset_partnerProfileId_fkey"
FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile"
ADD CONSTRAINT "PartnerProfile_mainImageAssetId_fkey"
FOREIGN KEY ("mainImageAssetId") REFERENCES "PartnerAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
