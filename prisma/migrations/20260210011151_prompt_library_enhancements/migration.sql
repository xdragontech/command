-- Prompt Library enhancements: ordering + tags
ALTER TABLE "Prompt" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Prompt" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "Prompt_sortOrder_idx" ON "Prompt"("sortOrder");
