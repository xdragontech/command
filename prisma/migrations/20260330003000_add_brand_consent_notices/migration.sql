-- CreateEnum
CREATE TYPE "BrandConsentNoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "BrandConsentNotice" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BrandConsentNoticeStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "acceptLabel" TEXT NOT NULL,
    "declineLabel" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandConsentNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandConsentNotice_brandId_version_key" ON "BrandConsentNotice"("brandId", "version");

-- CreateIndex
CREATE INDEX "BrandConsentNotice_brandId_status_idx" ON "BrandConsentNotice"("brandId", "status");

-- CreateIndex
CREATE INDEX "BrandConsentNotice_brandId_publishedAt_idx" ON "BrandConsentNotice"("brandId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandConsentNotice_brandId_draft_key"
ON "BrandConsentNotice"("brandId")
WHERE "status" = 'DRAFT';

-- AddForeignKey
ALTER TABLE "BrandConsentNotice" ADD CONSTRAINT "BrandConsentNotice_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing brands with a published default notice so public sites have a live source of truth immediately.
INSERT INTO "BrandConsentNotice" (
    "id",
    "brandId",
    "version",
    "status",
    "title",
    "message",
    "acceptLabel",
    "declineLabel",
    "publishedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('brand-consent-', b."id", '-v1'),
    b."id",
    1,
    'PUBLISHED',
    'Website Analytics Consent',
    'We use consented analytics to understand website performance and improve the public experience. You can accept or decline analytics tracking.',
    'Accept analytics',
    'Decline',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Brand" b
WHERE NOT EXISTS (
    SELECT 1
    FROM "BrandConsentNotice" existing
    WHERE existing."brandId" = b."id"
);
