-- Remove the transitional ExternalUser -> legacy User bridge after retiring
-- the remaining xdragon-site admin surfaces that depended on it.
DROP INDEX IF EXISTS "ExternalUser_legacyUserId_idx";

ALTER TABLE "ExternalUser"
DROP CONSTRAINT IF EXISTS "ExternalUser_legacyUserId_fkey";

ALTER TABLE "ExternalUser"
DROP COLUMN IF EXISTS "legacyUserId";
