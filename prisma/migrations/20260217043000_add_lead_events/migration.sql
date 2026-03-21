-- Add LeadEvent table (append-only lead timeline; source of truth for Leads + Analytics)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadSource') THEN
    CREATE TYPE "LeadSource" AS ENUM ('CONTACT','CHAT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LeadEvent" (
  "id" TEXT PRIMARY KEY,
  "source" "LeadSource" NOT NULL,
  "leadId" TEXT,
  "conversationId" TEXT,
  "ip" TEXT,
  "countryIso2" TEXT,
  "countryName" TEXT,
  "userAgent" TEXT,
  "referer" TEXT,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign key (safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'LeadEvent_leadId_fkey'
      AND table_name = 'LeadEvent'
  ) THEN
    ALTER TABLE "LeadEvent"
      ADD CONSTRAINT "LeadEvent_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes (safe)
CREATE INDEX IF NOT EXISTS "LeadEvent_source_idx" ON "LeadEvent"("source");
CREATE INDEX IF NOT EXISTS "LeadEvent_createdAt_idx" ON "LeadEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "LeadEvent_leadId_idx" ON "LeadEvent"("leadId");
CREATE INDEX IF NOT EXISTS "LeadEvent_conversationId_idx" ON "LeadEvent"("conversationId");
