import {
  createContentGuide,
  createContentGuideCategory,
  deleteContentGuide,
  deleteContentGuideCategory,
  listContentGuideCategories,
  listContentGuides,
  updateContentGuide,
  updateContentGuideCategory,
  type ContentGuideCategoryRecord,
  type ContentGuideRecord,
} from "./guides";
import type { ContentScope } from "./prompts";

export type ContentArticleRecord = ContentGuideRecord;
export type ContentArticleCategoryRecord = ContentGuideCategoryRecord;

function rewriteArticleMessage(message: string) {
  return message
    .replace(/Guide category/g, "Article category")
    .replace(/guide category/g, "article category")
    .replace(/Guide slug/g, "Article slug")
    .replace(/guide slug/g, "article slug")
    .replace(/\bGuides\b/g, "Articles")
    .replace(/\bguides\b/g, "articles")
    .replace(/\bGuide\b/g, "Article")
    .replace(/\bguide\b/g, "article");
}

async function withArticleErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    throw new Error(rewriteArticleMessage(message));
  }
}

export async function listContentArticles(params: {
  scope: ContentScope;
  q?: string;
  status?: unknown;
  categoryId?: unknown;
  brandId?: unknown;
}) {
  return withArticleErrors(() => listContentGuides(params));
}

export async function createContentArticle(
  scope: ContentScope,
  input: {
    title?: unknown;
    slug?: unknown;
    summary?: unknown;
    content?: unknown;
    status?: unknown;
    brandId?: unknown;
    categoryId?: unknown;
    tags?: unknown;
  }
) {
  return withArticleErrors(() => createContentGuide(scope, input));
}

export async function updateContentArticle(
  scope: ContentScope,
  id: string,
  input: {
    title?: unknown;
    slug?: unknown;
    summary?: unknown;
    content?: unknown;
    status?: unknown;
    categoryId?: unknown;
    tags?: unknown;
  }
) {
  return withArticleErrors(() => updateContentGuide(scope, id, input));
}

export async function deleteContentArticle(scope: ContentScope, id: string) {
  return withArticleErrors(() => deleteContentGuide(scope, id));
}

export async function listContentArticleCategories(params: {
  scope: ContentScope;
  q?: string;
  brandId?: string | null;
}) {
  return withArticleErrors(() => listContentGuideCategories(params));
}

export async function createContentArticleCategory(scope: ContentScope, input: { name?: unknown; brandId?: unknown }) {
  return withArticleErrors(() => createContentGuideCategory(scope, input));
}

export async function updateContentArticleCategory(scope: ContentScope, id: string, input: { name?: unknown }) {
  return withArticleErrors(() => updateContentGuideCategory(scope, id, input));
}

export async function deleteContentArticleCategory(scope: ContentScope, id: string) {
  return withArticleErrors(() => deleteContentGuideCategory(scope, id));
}
