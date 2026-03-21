-- Add Cloudflare-derived country fields to LoginEvent for reliable geo metrics
ALTER TABLE "LoginEvent" ADD COLUMN IF NOT EXISTS "countryIso2" TEXT;
ALTER TABLE "LoginEvent" ADD COLUMN IF NOT EXISTS "countryName" TEXT;
