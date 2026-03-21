CREATE TYPE "BackofficeMfaMethod" AS ENUM ('AUTHENTICATOR_APP');

ALTER TABLE "BackofficeUser"
ADD COLUMN "mfaMethod" "BackofficeMfaMethod",
ADD COLUMN "mfaRecoveryCodesEncrypted" TEXT,
ADD COLUMN "mfaRecoveryCodesGeneratedAt" TIMESTAMP(3);
