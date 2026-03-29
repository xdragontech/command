-- CreateEnum
CREATE TYPE "WebsiteAnalyticsSourceCategory" AS ENUM ('DIRECT', 'SEARCH', 'SOCIAL', 'REFERRAL', 'EMAIL', 'PAID', 'AI_REFERRAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WebsiteAnalyticsSourceMedium" AS ENUM ('DIRECT', 'ORGANIC', 'SOCIAL', 'REFERRAL', 'EMAIL', 'PAID', 'AI_REFERRAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WebsiteAnalyticsEventType" AS ENUM ('SESSION_START', 'PAGE_VIEW', 'ENGAGEMENT_PING', 'SESSION_END', 'CONVERSION', 'WEB_VITAL');

-- CreateEnum
CREATE TYPE "WebsiteAnalyticsConversionType" AS ENUM ('CONTACT_SUBMIT', 'CHAT_LEAD_SUBMIT', 'CLIENT_LOGIN_SUCCESS', 'CLIENT_SIGNUP_CREATED', 'CLIENT_SIGNUP_VERIFIED');

-- CreateTable
CREATE TABLE "WebsiteSession" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "landingUrl" TEXT,
    "landingPath" TEXT,
    "lastPath" TEXT,
    "pageViewCount" INTEGER NOT NULL DEFAULT 0,
    "engagedSeconds" INTEGER NOT NULL DEFAULT 0,
    "engaged" BOOLEAN NOT NULL DEFAULT false,
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCategory" "WebsiteAnalyticsSourceCategory" NOT NULL DEFAULT 'UNKNOWN',
    "sourcePlatform" TEXT,
    "sourceMedium" "WebsiteAnalyticsSourceMedium" NOT NULL DEFAULT 'UNKNOWN',
    "referrerHost" TEXT,
    "referer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "msclkid" TEXT,
    "ttclid" TEXT,
    "countryIso2" TEXT,
    "countryName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "websiteSessionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" "WebsiteAnalyticsEventType" NOT NULL,
    "path" TEXT,
    "url" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceCategory" "WebsiteAnalyticsSourceCategory" NOT NULL DEFAULT 'UNKNOWN',
    "sourcePlatform" TEXT,
    "sourceMedium" "WebsiteAnalyticsSourceMedium" NOT NULL DEFAULT 'UNKNOWN',
    "referer" TEXT,
    "referrerHost" TEXT,
    "countryIso2" TEXT,
    "countryName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "conversionType" "WebsiteAnalyticsConversionType",
    "metricName" TEXT,
    "metricValue" DOUBLE PRECISION,
    "engagedSeconds" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteSession_brandId_sessionId_key" ON "WebsiteSession"("brandId", "sessionId");

-- CreateIndex
CREATE INDEX "WebsiteSession_brandId_startedAt_idx" ON "WebsiteSession"("brandId", "startedAt");

-- CreateIndex
CREATE INDEX "WebsiteSession_brandId_sourceCategory_startedAt_idx" ON "WebsiteSession"("brandId", "sourceCategory", "startedAt");

-- CreateIndex
CREATE INDEX "WebsiteSession_brandId_landingPath_startedAt_idx" ON "WebsiteSession"("brandId", "landingPath", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteAnalyticsEvent_brandId_eventId_key" ON "WebsiteAnalyticsEvent"("brandId", "eventId");

-- CreateIndex
CREATE INDEX "WebsiteAnalyticsEvent_brandId_occurredAt_idx" ON "WebsiteAnalyticsEvent"("brandId", "occurredAt");

-- CreateIndex
CREATE INDEX "WebsiteAnalyticsEvent_brandId_websiteSessionId_occurredAt_idx" ON "WebsiteAnalyticsEvent"("brandId", "websiteSessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "WebsiteAnalyticsEvent_brandId_eventType_occurredAt_idx" ON "WebsiteAnalyticsEvent"("brandId", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "WebsiteSession" ADD CONSTRAINT "WebsiteSession_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAnalyticsEvent" ADD CONSTRAINT "WebsiteAnalyticsEvent_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAnalyticsEvent" ADD CONSTRAINT "WebsiteAnalyticsEvent_websiteSessionId_fkey" FOREIGN KEY ("websiteSessionId") REFERENCES "WebsiteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
