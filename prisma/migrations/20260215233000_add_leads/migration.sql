-- Idempotent safeguard: this migration accidentally duplicates Lead creation.
-- Make it safe to run even if LeadSource enum/table already exist.

DO $$
BEGIN
  -- Create enum if it does not exist (Postgres has no CREATE TYPE IF NOT EXISTS for enums)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'LeadSource' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "LeadSource" AS ENUM ('CONTACT', 'CHAT');
  END IF;
END
$$;

-- Create table if missing
CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "source" "LeadSource" NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "ip" TEXT,
  "raw" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- Indexes (safe)
CREATE INDEX IF NOT EXISTS "Lead_source_idx" ON "Lead"("source");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");
