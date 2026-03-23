import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
} from "./common";
import type { CreateScheduleResourceInput, ScheduleResourceRecord, SchedulingScope } from "./types";

type ResourceWithBrand = Prisma.ScheduleResourceGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
  };
}>;

function toResourceRecord(resource: ResourceWithBrand): ScheduleResourceRecord {
  return {
    id: resource.id,
    brandId: resource.brandId,
    brandKey: resource.brand.brandKey,
    brandName: resource.brand.name,
    name: resource.name,
    slug: resource.slug,
    type: resource.type,
    description: resource.description || null,
    sortOrder: resource.sortOrder,
    isActive: resource.isActive,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
  };
}

async function buildUniqueResourceSlug(brandId: string, preferred: string) {
  const base = slugify(preferred) || "resource";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.scheduleResource.findFirst({
      where: { brandId, slug },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${index}`;
  }

  throw new Error("Unable to allocate a unique resource slug");
}

export async function listScheduleResources(params: {
  scope: SchedulingScope;
  q?: string;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleResourceRecord[];

  const q = normalizeText(params.q);
  const where: Prisma.ScheduleResourceWhereInput = brandIds === null ? {} : { brandId: { in: brandIds } };
  const searchWhere: Prisma.ScheduleResourceWhereInput =
    q.length > 0
      ? {
          AND: [
            where,
            {
              OR: [
                { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            },
          ],
        }
      : where;

  const rows = await prisma.scheduleResource.findMany({
    where: searchWhere,
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => toResourceRecord(row as ResourceWithBrand));
}

export async function createScheduleResource(params: {
  scope: SchedulingScope;
  input: CreateScheduleResourceInput;
}) {
  const brandId = resolveWriteBrandId(params.scope, params.input.brandId);
  await ensureBrand(brandId);

  const name = normalizeText(params.input.name);
  if (!name) throw new Error("Resource name is required");

  const resource = await prisma.scheduleResource.create({
    data: {
      brandId,
      name,
      slug: await buildUniqueResourceSlug(brandId, normalizeText(params.input.slug) || name),
      type: params.input.type,
      description: normalizeNullableText(params.input.description),
      sortOrder: Number(params.input.sortOrder || 0),
      isActive: params.input.isActive !== false,
      metadata: params.input.metadata,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });

  return toResourceRecord(resource);
}
