ALTER TABLE "ExternalUser"
ADD COLUMN "legacyUserId" TEXT;

CREATE INDEX "ExternalUser_legacyUserId_idx" ON "ExternalUser"("legacyUserId");

ALTER TABLE "ExternalUser"
ADD CONSTRAINT "ExternalUser_legacyUserId_fkey"
FOREIGN KEY ("legacyUserId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE TABLE "ExternalLoginEvent" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "countryIso2" TEXT,
    "countryName" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalLoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalLoginEvent_externalUserId_idx" ON "ExternalLoginEvent"("externalUserId");
CREATE INDEX "ExternalLoginEvent_brandId_idx" ON "ExternalLoginEvent"("brandId");
CREATE INDEX "ExternalLoginEvent_createdAt_idx" ON "ExternalLoginEvent"("createdAt");

ALTER TABLE "ExternalLoginEvent"
ADD CONSTRAINT "ExternalLoginEvent_externalUserId_fkey"
FOREIGN KEY ("externalUserId") REFERENCES "ExternalUser"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ExternalLoginEvent"
ADD CONSTRAINT "ExternalLoginEvent_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
