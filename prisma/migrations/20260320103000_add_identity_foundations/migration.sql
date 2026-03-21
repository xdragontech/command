-- Additive identity foundations for backoffice and external auth split.
-- This intentionally does not cut over runtime auth behavior.

CREATE TYPE "BackofficeRole" AS ENUM ('SUPERADMIN', 'STAFF');
CREATE TYPE "BackofficeUserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
CREATE TYPE "ExternalUserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

CREATE TABLE "BackofficeUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "BackofficeRole" NOT NULL DEFAULT 'STAFF',
    "status" "BackofficeUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabledAt" TIMESTAMP(3),
    "mfaSecretEncrypted" TEXT,
    "lastSelectedBrandKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "BackofficeUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackofficeUserBrandAccess" (
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeUserBrandAccess_pkey" PRIMARY KEY ("userId","brandId")
);

CREATE TABLE "BackofficeAccount" (
    "id" TEXT NOT NULL,
    "backofficeUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "BackofficeAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackofficeSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "backofficeUserId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackofficeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackofficeVerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "BackofficePasswordResetToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ExternalUser" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "status" "ExternalUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "ExternalUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalVerificationToken" (
    "brandId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ExternalEmailVerificationToken" (
    "brandId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ExternalPasswordResetToken" (
    "brandId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "BackofficeUser_username_key" ON "BackofficeUser"("username");
CREATE UNIQUE INDEX "BackofficeUser_email_key" ON "BackofficeUser"("email");
CREATE INDEX "BackofficeUser_email_idx" ON "BackofficeUser"("email");
CREATE UNIQUE INDEX "BackofficeAccount_provider_providerAccountId_key" ON "BackofficeAccount"("provider", "providerAccountId");
CREATE INDEX "BackofficeAccount_backofficeUserId_idx" ON "BackofficeAccount"("backofficeUserId");
CREATE UNIQUE INDEX "BackofficeSession_sessionToken_key" ON "BackofficeSession"("sessionToken");
CREATE INDEX "BackofficeSession_backofficeUserId_idx" ON "BackofficeSession"("backofficeUserId");
CREATE UNIQUE INDEX "BackofficeVerificationToken_token_key" ON "BackofficeVerificationToken"("token");
CREATE UNIQUE INDEX "BackofficeVerificationToken_identifier_token_key" ON "BackofficeVerificationToken"("identifier", "token");
CREATE INDEX "BackofficeVerificationToken_identifier_idx" ON "BackofficeVerificationToken"("identifier");
CREATE UNIQUE INDEX "BackofficePasswordResetToken_token_key" ON "BackofficePasswordResetToken"("token");
CREATE INDEX "BackofficePasswordResetToken_identifier_idx" ON "BackofficePasswordResetToken"("identifier");
CREATE UNIQUE INDEX "ExternalUser_brandId_email_key" ON "ExternalUser"("brandId", "email");
CREATE INDEX "ExternalUser_brandId_idx" ON "ExternalUser"("brandId");
CREATE INDEX "ExternalUser_email_idx" ON "ExternalUser"("email");
CREATE UNIQUE INDEX "ExternalAccount_brandId_provider_providerAccountId_key" ON "ExternalAccount"("brandId", "provider", "providerAccountId");
CREATE INDEX "ExternalAccount_externalUserId_idx" ON "ExternalAccount"("externalUserId");
CREATE INDEX "ExternalAccount_brandId_idx" ON "ExternalAccount"("brandId");
CREATE UNIQUE INDEX "ExternalSession_sessionToken_key" ON "ExternalSession"("sessionToken");
CREATE INDEX "ExternalSession_externalUserId_idx" ON "ExternalSession"("externalUserId");
CREATE UNIQUE INDEX "ExternalVerificationToken_token_key" ON "ExternalVerificationToken"("token");
CREATE UNIQUE INDEX "ExternalVerificationToken_brandId_identifier_token_key" ON "ExternalVerificationToken"("brandId", "identifier", "token");
CREATE INDEX "ExternalVerificationToken_brandId_identifier_idx" ON "ExternalVerificationToken"("brandId", "identifier");
CREATE UNIQUE INDEX "ExternalEmailVerificationToken_token_key" ON "ExternalEmailVerificationToken"("token");
CREATE INDEX "ExternalEmailVerificationToken_brandId_identifier_idx" ON "ExternalEmailVerificationToken"("brandId", "identifier");
CREATE UNIQUE INDEX "ExternalPasswordResetToken_token_key" ON "ExternalPasswordResetToken"("token");
CREATE INDEX "ExternalPasswordResetToken_brandId_identifier_idx" ON "ExternalPasswordResetToken"("brandId", "identifier");
CREATE INDEX "BackofficeUserBrandAccess_brandId_idx" ON "BackofficeUserBrandAccess"("brandId");

ALTER TABLE "BackofficeUserBrandAccess"
ADD CONSTRAINT "BackofficeUserBrandAccess_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "BackofficeUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackofficeUserBrandAccess"
ADD CONSTRAINT "BackofficeUserBrandAccess_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackofficeAccount"
ADD CONSTRAINT "BackofficeAccount_backofficeUserId_fkey"
FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackofficeSession"
ADD CONSTRAINT "BackofficeSession_backofficeUserId_fkey"
FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalUser"
ADD CONSTRAINT "ExternalUser_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalAccount"
ADD CONSTRAINT "ExternalAccount_externalUserId_fkey"
FOREIGN KEY ("externalUserId") REFERENCES "ExternalUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalAccount"
ADD CONSTRAINT "ExternalAccount_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalSession"
ADD CONSTRAINT "ExternalSession_externalUserId_fkey"
FOREIGN KEY ("externalUserId") REFERENCES "ExternalUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalVerificationToken"
ADD CONSTRAINT "ExternalVerificationToken_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalEmailVerificationToken"
ADD CONSTRAINT "ExternalEmailVerificationToken_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalPasswordResetToken"
ADD CONSTRAINT "ExternalPasswordResetToken_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
