CREATE TABLE "InstallProfile" (
    "id" TEXT NOT NULL DEFAULT 'install',
    "displayName" TEXT,
    "setupCompletedAt" TIMESTAMP(3),
    "primaryBrandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InstallProfile_primaryBrandId_idx" ON "InstallProfile"("primaryBrandId");

INSERT INTO "InstallProfile" ("id", "displayName", "setupCompletedAt", "primaryBrandId", "createdAt", "updatedAt")
SELECT
    'install',
    COALESCE(seed_brand."name", 'Command Install'),
    CURRENT_TIMESTAMP,
    seed_brand."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT "id", "name", "createdAt"
    FROM "Brand"
    ORDER BY "createdAt" ASC
    LIMIT 1
) AS seed_brand
WHERE NOT EXISTS (
    SELECT 1 FROM "InstallProfile" WHERE "id" = 'install'
)
AND EXISTS (
    SELECT 1 FROM "Brand"
)
AND EXISTS (
    SELECT 1 FROM "BrandHost"
)
AND EXISTS (
    SELECT 1
    FROM "BackofficeUser"
    WHERE "role" = 'SUPERADMIN'
      AND "status" = 'ACTIVE'
);
