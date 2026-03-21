/*
  Warnings:

  - You are about to drop the `PasswordResetToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "LoginEvent_createdAt_idx";

-- DropIndex
DROP INDEX "LoginEvent_userId_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- AlterTable
ALTER TABLE "LoginEvent" ALTER COLUMN "ip" DROP NOT NULL;

-- DropTable
DROP TABLE "PasswordResetToken";

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
