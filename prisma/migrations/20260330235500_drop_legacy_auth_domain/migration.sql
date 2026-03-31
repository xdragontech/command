-- Remove the fully retired legacy auth domain after command-owned public and
-- backoffice identities replaced the old shared User/LoginEvent model.
DROP TABLE IF EXISTS "LoginEvent";
DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "EmailVerificationToken";
DROP TABLE IF EXISTS "VerificationToken";
DROP TABLE IF EXISTS "PasswordResetToken";
DROP TABLE IF EXISTS "User";

DROP TYPE IF EXISTS "UserRole";
DROP TYPE IF EXISTS "UserStatus";
