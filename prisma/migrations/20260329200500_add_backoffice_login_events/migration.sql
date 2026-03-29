-- CreateTable
CREATE TABLE "BackofficeLoginEvent" (
    "id" TEXT NOT NULL,
    "backofficeUserId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "countryIso2" TEXT,
    "countryName" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackofficeLoginEvent_backofficeUserId_idx" ON "BackofficeLoginEvent"("backofficeUserId");

-- CreateIndex
CREATE INDEX "BackofficeLoginEvent_createdAt_idx" ON "BackofficeLoginEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "BackofficeLoginEvent" ADD CONSTRAINT "BackofficeLoginEvent_backofficeUserId_fkey" FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
