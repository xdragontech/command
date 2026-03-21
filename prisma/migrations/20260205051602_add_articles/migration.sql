-- Historical repair: production applied this migration before it was ever checked into git.
-- Keep it idempotent so existing preview/production databases can adopt the history safely.

CREATE TABLE IF NOT EXISTS "ArticleCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Article" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "PromptStatus" NOT NULL DEFAULT 'DRAFT',
  "categoryId" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "ArticleCategory_name_key" ON "ArticleCategory"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "ArticleCategory_slug_key" ON "ArticleCategory"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Article_slug_key" ON "Article"("slug");
CREATE INDEX IF NOT EXISTS "Article_status_idx" ON "Article"("status");
CREATE INDEX IF NOT EXISTS "Article_categoryId_idx" ON "Article"("categoryId");
CREATE INDEX IF NOT EXISTS "Article_title_idx" ON "Article"("title");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Article_categoryId_fkey'
      AND table_name = 'Article'
  ) THEN
    ALTER TABLE "Article"
      ADD CONSTRAINT "Article_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "ArticleCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
