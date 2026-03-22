import { PromptStatus, type Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  assertBrandAccess,
  ensureExistingBrand,
  normalizeBrandId,
  normalizeText,
  parsePromptStatus,
  PROMPT_STATUSES,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
  type ContentScope,
} from "./prompts";

export type ContentGuideCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  sortOrder: number;
  createdAt: string;
  guideCount: number;
};

export type ContentGuideRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: PromptStatus;
  tags: string[];
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  createdAt: string;
  updatedAt: string;
};

type GuideCategoryWithBrand = Prisma.ArticleCategoryGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    _count: {
      select: {
        articles: true;
      };
    };
  };
}>;

type GuideWithRelations = Prisma.ArticleGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    category: {
      select: {
        id: true;
        name: true;
        slug: true;
      };
    };
  };
}>;

function normalizeGuideSlug(input: unknown) {
  return slugify(String(input || ""));
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

async function ensureUniqueGuideCategoryName(brandId: string, name: string, excludeId?: string) {
  const existing = await prisma.articleCategory.findFirst({
    where: {
      brandId,
      name: {
        equals: name,
        mode: "insensitive",
      },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Guide category name must be unique within the selected brand");
  }
}

async function buildUniqueGuideCategorySlug(brandId: string, name: string, excludeId?: string) {
  const base = slugify(name) || "category";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.articleCategory.findFirst({
      where: {
        brandId,
        slug,
      },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) break;
    slug = `${base}-${index}`;
  }

  return slug;
}

async function ensureUniqueGuideSlug(brandId: string, slug: string, excludeId?: string) {
  const existing = await prisma.article.findFirst({
    where: {
      brandId,
      slug,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Guide slug must be unique within the selected brand");
  }
}

function toGuideCategoryRecord(category: GuideCategoryWithBrand): ContentGuideCategoryRecord {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    brandId: category.brandId || null,
    brandKey: category.brand?.brandKey || null,
    brandName: category.brand?.name || null,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    guideCount: category._count.articles,
  };
}

function toGuideRecord(article: GuideWithRelations): ContentGuideRecord {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    content: article.content,
    status: article.status,
    tags: article.tags || [],
    brandId: article.brandId || null,
    brandKey: article.brand?.brandKey || null,
    brandName: article.brand?.name || null,
    categoryId: article.categoryId || null,
    categoryName: article.category?.name || null,
    categorySlug: article.category?.slug || null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export async function listContentGuideCategories(params: {
  scope: ContentScope;
  q?: string;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeBrandId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ContentGuideCategoryRecord[];

  const q = normalizeText(params.q);
  const where: Prisma.ArticleCategoryWhereInput =
    brandIds === null
      ? {}
      : { brandId: { in: brandIds } };

  const categories = await prisma.articleCategory.findMany({
    where:
      q.length > 0
        ? {
            AND: [
              where,
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { slug: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          }
        : where,
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          articles: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 500,
  });

  return categories.map(toGuideCategoryRecord);
}

export async function createContentGuideCategory(scope: ContentScope, input: { name?: unknown; brandId?: unknown }) {
  const name = normalizeText(input.name);
  if (!name) throw new Error("Name is required");

  const brandId = resolveWriteBrandId(scope, input.brandId, { allowSingleBrandFallback: true });
  await ensureExistingBrand(brandId);
  await ensureUniqueGuideCategoryName(brandId, name);
  const slug = await buildUniqueGuideCategorySlug(brandId, name);

  const category = await prisma.articleCategory.create({
    data: {
      brandId,
      name,
      slug,
      sortOrder: 0,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          articles: true,
        },
      },
    },
  });

  return toGuideCategoryRecord(category);
}

export async function updateContentGuideCategory(scope: ContentScope, id: string, input: { name?: unknown }) {
  const existing = await prisma.articleCategory.findUnique({
    where: { id },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          articles: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Guide category not found");
  assertBrandAccess(scope, existing.brandId);

  const brandId = existing.brandId;
  if (!brandId) {
    throw new Error("Guide category is missing brand ownership");
  }

  const name = normalizeText(input.name);
  if (!name) throw new Error("Name is required");

  await ensureUniqueGuideCategoryName(brandId, name, id);
  const slug = await buildUniqueGuideCategorySlug(brandId, name, id);

  const updated = await prisma.articleCategory.update({
    where: { id },
    data: { name, slug },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          articles: true,
        },
      },
    },
  });

  return toGuideCategoryRecord(updated);
}

export async function deleteContentGuideCategory(scope: ContentScope, id: string) {
  const existing = await prisma.articleCategory.findUnique({
    where: { id },
    select: {
      id: true,
      brandId: true,
      _count: {
        select: {
          articles: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Guide category not found");
  assertBrandAccess(scope, existing.brandId);

  if (existing._count.articles > 0) {
    throw new Error("Guide category cannot be deleted while guides are still assigned to it");
  }

  await prisma.articleCategory.delete({ where: { id } });
}

export async function listContentGuides(params: {
  scope: ContentScope;
  q?: string;
  status?: unknown;
  categoryId?: unknown;
  brandId?: unknown;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeBrandId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ContentGuideRecord[];

  const q = normalizeText(params.q);
  const status = normalizeText(params.status);
  const categoryId = normalizeBrandId(params.categoryId);

  const where: Prisma.ArticleWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(status && status !== "ALL" && PROMPT_STATUSES.includes(status as PromptStatus) ? { status: status as PromptStatus } : {}),
    ...(categoryId && categoryId !== "ALL" ? { categoryId } : {}),
  };

  const guides = await prisma.article.findMany({
    where:
      q.length > 0
        ? {
            AND: [
              where,
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { slug: { contains: q, mode: "insensitive" } },
                  { summary: { contains: q, mode: "insensitive" } },
                  { content: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          }
        : where,
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });

  return guides.map(toGuideRecord);
}

export async function createContentGuide(
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
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const status = parsePromptStatus(input.status);
  const brandId = resolveWriteBrandId(scope, input.brandId, { allowSingleBrandFallback: true });
  const categoryId = normalizeBrandId(input.categoryId);
  const slug = normalizeGuideSlug(input.slug || title);
  const tags = parseTags(input.tags);

  if (!title) throw new Error("Title is required");
  if (!slug) throw new Error("Slug is required");
  if (!summary) throw new Error("Summary is required");
  if (!content) throw new Error("Content is required");

  await ensureExistingBrand(brandId);
  await ensureUniqueGuideSlug(brandId, slug);

  if (categoryId) {
    const category = await prisma.articleCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, brandId: true },
    });
    if (!category) throw new Error("Guide category not found");
    assertBrandAccess(scope, category.brandId);
    if (category.brandId !== brandId) {
      throw new Error("Guide category brand does not match the selected brand");
    }
  }

  const guide = await prisma.article.create({
    data: {
      brandId,
      title,
      slug,
      summary,
      content,
      status,
      categoryId,
      tags,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return toGuideRecord(guide);
}

export async function updateContentGuide(
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
  const existing = await prisma.article.findUnique({
    where: { id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Guide not found");
  assertBrandAccess(scope, existing.brandId);

  const brandId = existing.brandId;
  if (!brandId) {
    throw new Error("Guide is missing brand ownership");
  }

  const data: Prisma.ArticleUpdateInput = {};

  if ("title" in input) {
    const title = normalizeText(input.title);
    if (!title) throw new Error("Title is required");
    data.title = title;
  }

  if ("slug" in input) {
    const slug = normalizeGuideSlug(input.slug);
    if (!slug) throw new Error("Slug is required");
    await ensureUniqueGuideSlug(brandId, slug, id);
    data.slug = slug;
  }

  if ("summary" in input) {
    const summary = normalizeText(input.summary);
    if (!summary) throw new Error("Summary is required");
    data.summary = summary;
  }

  if ("content" in input) {
    const content = normalizeText(input.content);
    if (!content) throw new Error("Content is required");
    data.content = content;
  }

  if ("status" in input && PROMPT_STATUSES.includes(input.status as PromptStatus)) {
    data.status = input.status as PromptStatus;
  }

  if ("categoryId" in input) {
    const categoryId = normalizeBrandId(input.categoryId);
    if (categoryId) {
      const category = await prisma.articleCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, brandId: true },
      });
      if (!category) throw new Error("Guide category not found");
      assertBrandAccess(scope, category.brandId);
      if (category.brandId !== brandId) {
        throw new Error("Guide category brand does not match the guide brand");
      }
      data.category = { connect: { id: categoryId } };
    } else {
      data.category = { disconnect: true };
    }
  }

  if ("tags" in input) {
    data.tags = parseTags(input.tags);
  }

  const guide = await prisma.article.update({
    where: { id },
    data,
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return toGuideRecord(guide);
}

export async function deleteContentGuide(scope: ContentScope, id: string) {
  const existing = await prisma.article.findUnique({
    where: { id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Guide not found");
  assertBrandAccess(scope, existing.brandId);
  await prisma.article.delete({ where: { id } });
}
