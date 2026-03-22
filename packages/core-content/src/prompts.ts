import { PromptStatus, type Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";

export type ContentScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export type ContentCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  sortOrder: number;
  createdAt: string;
  promptCount: number;
};

export type ContentPromptRecord = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: PromptStatus;
  sortOrder: number;
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

type CategoryWithBrand = Prisma.CategoryGetPayload<{
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
        prompts: true;
      };
    };
  };
}>;

type PromptWithRelations = Prisma.PromptGetPayload<{
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

const PROMPT_STATUSES: PromptStatus[] = [PromptStatus.DRAFT, PromptStatus.PUBLISHED, PromptStatus.ARCHIVED];

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeNullableText(value: unknown) {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeBrandId(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function assertBrandAccess(scope: ContentScope, brandId: string | null) {
  if (scope.role === "SUPERADMIN") return;
  if (!brandId || !scope.allowedBrandIds.includes(brandId)) {
    throw new Error("Forbidden brand scope");
  }
}

function resolveReadableBrandIds(scope: ContentScope, requestedBrandId: string | null) {
  if (scope.role === "SUPERADMIN") {
    return requestedBrandId ? [requestedBrandId] : null;
  }

  if (scope.allowedBrandIds.length === 0) return [];
  if (!requestedBrandId) return scope.allowedBrandIds;
  assertBrandAccess(scope, requestedBrandId);
  return [requestedBrandId];
}

function resolveWriteBrandId(scope: ContentScope, rawBrandId: unknown, options?: { allowSingleBrandFallback?: boolean }) {
  const requestedBrandId = normalizeBrandId(rawBrandId);
  const allowSingleBrandFallback = options?.allowSingleBrandFallback !== false;

  if (scope.role === "SUPERADMIN") {
    if (requestedBrandId) return requestedBrandId;
    throw new Error("Brand selection is required");
  }

  if (scope.allowedBrandIds.length === 0) throw new Error("No writable brands available");
  if (requestedBrandId) {
    assertBrandAccess(scope, requestedBrandId);
    return requestedBrandId;
  }
  if (allowSingleBrandFallback && scope.allowedBrandIds.length === 1) {
    return scope.allowedBrandIds[0];
  }
  throw new Error("Brand selection is required");
}

function parsePromptStatus(value: unknown) {
  return PROMPT_STATUSES.includes(value as PromptStatus) ? (value as PromptStatus) : PromptStatus.DRAFT;
}

async function ensureExistingBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, brandKey: true, name: true },
  });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

async function ensureUniqueCategoryName(name: string, excludeId?: string) {
  const existing = await prisma.category.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Category name must currently be unique across this command install");
  }
}

async function buildUniqueCategorySlug(name: string, excludeId?: string) {
  const base = slugify(name) || "category";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) break;
    slug = `${base}-${index}`;
  }

  return slug;
}

function toCategoryRecord(category: CategoryWithBrand): ContentCategoryRecord {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    brandId: category.brandId || null,
    brandKey: category.brand?.brandKey || null,
    brandName: category.brand?.name || null,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    promptCount: category._count.prompts,
  };
}

function toPromptRecord(prompt: PromptWithRelations): ContentPromptRecord {
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description || null,
    content: prompt.content,
    status: prompt.status,
    sortOrder: prompt.sortOrder,
    tags: prompt.tags || [],
    brandId: prompt.brandId || null,
    brandKey: prompt.brand?.brandKey || null,
    brandName: prompt.brand?.name || null,
    categoryId: prompt.categoryId || null,
    categoryName: prompt.category?.name || null,
    categorySlug: prompt.category?.slug || null,
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
  };
}

export async function listContentCategories(params: {
  scope: ContentScope;
  q?: string;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeBrandId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ContentCategoryRecord[];

  const q = normalizeText(params.q);
  const where: Prisma.CategoryWhereInput =
    brandIds === null
      ? {}
      : { brandId: { in: brandIds } };

  const categories = await prisma.category.findMany({
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
          prompts: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 500,
  });

  return categories.map(toCategoryRecord);
}

export async function createContentCategory(scope: ContentScope, input: { name?: unknown; brandId?: unknown }) {
  const name = normalizeText(input.name);
  if (!name) throw new Error("Name is required");

  const brandId = resolveWriteBrandId(scope, input.brandId, { allowSingleBrandFallback: true });
  await ensureExistingBrand(brandId);
  await ensureUniqueCategoryName(name);
  const slug = await buildUniqueCategorySlug(name);

  const category = await prisma.category.create({
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
          prompts: true,
        },
      },
    },
  });

  return toCategoryRecord(category);
}

export async function updateContentCategory(scope: ContentScope, id: string, input: { name?: unknown }) {
  const existing = await prisma.category.findUnique({
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
          prompts: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Category not found");
  assertBrandAccess(scope, existing.brandId);

  const name = normalizeText(input.name);
  if (!name) throw new Error("Name is required");

  await ensureUniqueCategoryName(name, id);
  const slug = await buildUniqueCategorySlug(name, id);
  const updated = await prisma.category.update({
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
          prompts: true,
        },
      },
    },
  });

  return toCategoryRecord(updated);
}

export async function deleteContentCategory(scope: ContentScope, id: string) {
  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      brandId: true,
      _count: {
        select: {
          prompts: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Category not found");
  assertBrandAccess(scope, existing.brandId);

  if (existing._count.prompts > 0) {
    throw new Error("Category cannot be deleted while prompts are still assigned to it");
  }

  await prisma.category.delete({ where: { id } });
}

export async function listContentPrompts(params: {
  scope: ContentScope;
  q?: string;
  status?: unknown;
  categoryId?: unknown;
  brandId?: unknown;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeBrandId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ContentPromptRecord[];

  const q = normalizeText(params.q);
  const status = normalizeText(params.status);
  const categoryId = normalizeBrandId(params.categoryId);

  const where: Prisma.PromptWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(status && status !== "ALL" && PROMPT_STATUSES.includes(status as PromptStatus) ? { status: status as PromptStatus } : {}),
    ...(categoryId && categoryId !== "ALL" ? { categoryId } : {}),
  };

  const prompts = await prisma.prompt.findMany({
    where:
      q.length > 0
        ? {
            AND: [
              where,
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
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
    orderBy: [{ sortOrder: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });

  return prompts.map(toPromptRecord);
}

export async function createContentPrompt(
  scope: ContentScope,
  input: {
    title?: unknown;
    description?: unknown;
    content?: unknown;
    status?: unknown;
    brandId?: unknown;
    categoryId?: unknown;
  }
) {
  const title = normalizeText(input.title);
  const content = normalizeText(input.content);
  const description = normalizeNullableText(input.description);
  const status = parsePromptStatus(input.status);
  const brandId = resolveWriteBrandId(scope, input.brandId, { allowSingleBrandFallback: true });
  const categoryId = normalizeBrandId(input.categoryId);

  if (!title) throw new Error("Title is required");
  if (!content) throw new Error("Content is required");

  await ensureExistingBrand(brandId);

  if (categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, brandId: true },
    });
    if (!category) throw new Error("Category not found");
    assertBrandAccess(scope, category.brandId);
    if (category.brandId !== brandId) {
      throw new Error("Category brand does not match the selected brand");
    }
  }

  const prompt = await prisma.prompt.create({
    data: {
      brandId,
      title,
      description,
      content,
      status,
      categoryId,
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

  return toPromptRecord(prompt);
}

export async function updateContentPrompt(
  scope: ContentScope,
  id: string,
  input: {
    title?: unknown;
    description?: unknown;
    content?: unknown;
    status?: unknown;
    categoryId?: unknown;
  }
) {
  const existing = await prisma.prompt.findUnique({
    where: { id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Prompt not found");
  assertBrandAccess(scope, existing.brandId);

  const data: Prisma.PromptUpdateInput = {};

  if ("title" in input) {
    const title = normalizeText(input.title);
    if (!title) throw new Error("Title is required");
    data.title = title;
  }

  if ("content" in input) {
    const content = normalizeText(input.content);
    if (!content) throw new Error("Content is required");
    data.content = content;
  }

  if ("description" in input) {
    data.description = normalizeNullableText(input.description);
  }

  if ("status" in input && PROMPT_STATUSES.includes(input.status as PromptStatus)) {
    data.status = input.status as PromptStatus;
  }

  if ("categoryId" in input) {
    const categoryId = normalizeBrandId(input.categoryId);
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, brandId: true },
      });
      if (!category) throw new Error("Category not found");
      assertBrandAccess(scope, category.brandId);
      if (category.brandId !== existing.brandId) {
        throw new Error("Category brand does not match the prompt brand");
      }
      data.category = { connect: { id: categoryId } };
    } else {
      data.category = { disconnect: true };
    }
  }

  const prompt = await prisma.prompt.update({
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

  return toPromptRecord(prompt);
}

export async function deleteContentPrompt(scope: ContentScope, id: string) {
  const existing = await prisma.prompt.findUnique({
    where: { id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Prompt not found");
  assertBrandAccess(scope, existing.brandId);
  await prisma.prompt.delete({ where: { id } });
}
