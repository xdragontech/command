DROP INDEX IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Category_slug_key";
DROP INDEX IF EXISTS "ArticleCategory_name_key";
DROP INDEX IF EXISTS "ArticleCategory_slug_key";
DROP INDEX IF EXISTS "Article_slug_key";

CREATE UNIQUE INDEX "Category_brandId_name_key" ON "Category"("brandId", "name");
CREATE UNIQUE INDEX "Category_brandId_slug_key" ON "Category"("brandId", "slug");
CREATE UNIQUE INDEX "ArticleCategory_brandId_name_key" ON "ArticleCategory"("brandId", "name");
CREATE UNIQUE INDEX "ArticleCategory_brandId_slug_key" ON "ArticleCategory"("brandId", "slug");
CREATE UNIQUE INDEX "Article_brandId_slug_key" ON "Article"("brandId", "slug");
