-- Additive brand foundations for multi-brand rollout.
-- This migration intentionally avoids auth cutover and destructive changes.

CREATE TYPE "BrandStatus" AS ENUM ('SETUP_PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE "BrandEnvironment" AS ENUM ('PRODUCTION', 'PREVIEW');
CREATE TYPE "BrandHostKind" AS ENUM ('PUBLIC', 'APEX', 'ALIAS');
CREATE TYPE "BrandEmailConfigStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "BrandEmailProvider" AS ENUM ('RESEND');

CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BrandStatus" NOT NULL DEFAULT 'SETUP_PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandHost" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "environment" "BrandEnvironment" NOT NULL,
    "kind" "BrandHostKind" NOT NULL DEFAULT 'PUBLIC',
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandHost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandEmailConfig" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" "BrandEmailConfigStatus" NOT NULL DEFAULT 'INACTIVE',
    "provider" "BrandEmailProvider" NOT NULL DEFAULT 'RESEND',
    "fromName" TEXT,
    "fromEmail" TEXT,
    "replyToEmail" TEXT,
    "supportEmail" TEXT,
    "providerSecretRef" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandEmailConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Category" ADD COLUMN "brandId" TEXT;
ALTER TABLE "Prompt" ADD COLUMN "brandId" TEXT;
ALTER TABLE "ArticleCategory" ADD COLUMN "brandId" TEXT;
ALTER TABLE "Article" ADD COLUMN "brandId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "brandId" TEXT;
ALTER TABLE "LeadEvent" ADD COLUMN "brandId" TEXT;

CREATE UNIQUE INDEX "Brand_brandKey_key" ON "Brand"("brandKey");
CREATE UNIQUE INDEX "BrandHost_host_key" ON "BrandHost"("host");
CREATE UNIQUE INDEX "BrandEmailConfig_brandId_key" ON "BrandEmailConfig"("brandId");

CREATE INDEX "BrandHost_brandId_idx" ON "BrandHost"("brandId");
CREATE INDEX "BrandHost_environment_kind_idx" ON "BrandHost"("environment", "kind");
CREATE INDEX "Category_brandId_idx" ON "Category"("brandId");
CREATE INDEX "Prompt_brandId_idx" ON "Prompt"("brandId");
CREATE INDEX "ArticleCategory_brandId_idx" ON "ArticleCategory"("brandId");
CREATE INDEX "Article_brandId_idx" ON "Article"("brandId");
CREATE INDEX "Lead_brandId_idx" ON "Lead"("brandId");
CREATE INDEX "LeadEvent_brandId_idx" ON "LeadEvent"("brandId");

ALTER TABLE "BrandHost"
ADD CONSTRAINT "BrandHost_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandEmailConfig"
ADD CONSTRAINT "BrandEmailConfig_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category"
ADD CONSTRAINT "Category_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Prompt"
ADD CONSTRAINT "Prompt_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleCategory"
ADD CONSTRAINT "ArticleCategory_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Article"
ADD CONSTRAINT "Article_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadEvent"
ADD CONSTRAINT "LeadEvent_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
