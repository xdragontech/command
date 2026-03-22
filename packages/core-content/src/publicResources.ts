import { PromptStatus, type Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";

export type PublicPromptItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
};

export type PublicGuideListItem = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  tags: string[] | null;
};

export type PublicGuideDetail = PublicGuideListItem & {
  body: string;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function parseLimit(value: unknown) {
  const raw = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(raw) || raw <= 0) return 25;
  return Math.min(raw, 100);
}

function buildCategoryFilter(category: string): Prisma.CategoryWhereInput {
  return {
    OR: [
      { name: { equals: category, mode: "insensitive" } },
      { slug: { equals: category.toLowerCase(), mode: "insensitive" } },
    ],
  };
}

function buildArticleCategoryFilter(category: string): Prisma.ArticleCategoryWhereInput {
  return {
    OR: [
      { name: { equals: category, mode: "insensitive" } },
      { slug: { equals: category.toLowerCase(), mode: "insensitive" } },
    ],
  };
}

export async function listPublicPrompts(params: {
  brandId: string;
  q?: unknown;
  category?: unknown;
  limit?: unknown;
}) {
  const q = normalizeText(params.q);
  const category = normalizeText(params.category);
  const limit = parseLimit(params.limit);

  const where: Prisma.PromptWhereInput = {
    brandId: params.brandId,
    status: PromptStatus.PUBLISHED,
    ...(category
      ? {
          category: { is: buildCategoryFilter(category) },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { tags: { has: q } },
          ],
        }
      : {}),
  };

  const prompts = await prisma.prompt.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      content: true,
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { title: "asc" }],
    take: limit,
  });

  return prompts.map<PublicPromptItem>((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    description: prompt.description || null,
    category: prompt.category?.name || prompt.category?.slug || "Uncategorized",
    content: prompt.content,
  }));
}

export async function listPublicGuides(params: {
  brandId: string;
  q?: unknown;
  category?: unknown;
  limit?: unknown;
}) {
  const q = normalizeText(params.q);
  const category = normalizeText(params.category);
  const limit = parseLimit(params.limit);

  const where: Prisma.ArticleWhereInput = {
    brandId: params.brandId,
    status: PromptStatus.PUBLISHED,
    ...(category
      ? {
          category: { is: buildArticleCategoryFilter(category) },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { tags: { has: q } },
          ],
        }
      : {}),
  };

  const guides = await prisma.article.findMany({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      updatedAt: true,
      tags: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    take: limit,
  });

  return guides.map<PublicGuideListItem>((guide) => ({
    id: guide.id,
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    updatedAt: guide.updatedAt.toISOString(),
    category: guide.category
      ? {
          id: guide.category.id,
          name: guide.category.name,
          slug: guide.category.slug,
        }
      : null,
    tags: guide.tags?.length ? guide.tags : null,
  }));
}

export async function getPublicGuideBySlug(params: {
  brandId: string;
  slug: string;
}) {
  const slug = normalizeText(params.slug).toLowerCase();
  if (!slug) return null;

  const guide = await prisma.article.findFirst({
    where: {
      brandId: params.brandId,
      slug,
      status: PromptStatus.PUBLISHED,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      updatedAt: true,
      tags: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!guide) return null;

  return {
    id: guide.id,
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    body: guide.content,
    updatedAt: guide.updatedAt.toISOString(),
    category: guide.category
      ? {
          id: guide.category.id,
          name: guide.category.name,
          slug: guide.category.slug,
        }
      : null,
    tags: guide.tags?.length ? guide.tags : null,
  } satisfies PublicGuideDetail;
}
