import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  parseResourceType,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
} from "./common";
import type {
  CreateScheduleResourceInput,
  ScheduleResourceRecord,
  SchedulingScope,
  UpdateScheduleResourceInput,
} from "./types";

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

async function buildUniqueResourceSlug(brandId: string, preferred: string, excludeId?: string) {
  const base = slugify(preferred) || "resource";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.scheduleResource.findFirst({
      where: { brandId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
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
      type: parseResourceType(params.input.type),
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

export async function updateScheduleResource(params: {
  scope: SchedulingScope;
  id: string;
  input: UpdateScheduleResourceInput;
}) {
  const existing = await prisma.scheduleResource.findUnique({
    where: { id: params.id },
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
  if (!existing) throw new Error("Resource not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Resource brand cannot be reassigned");

  const name = normalizeText(params.input.name ?? existing.name);
  if (!name) throw new Error("Resource name is required");

  const updated = await prisma.scheduleResource.update({
    where: { id: existing.id },
    data: {
      name,
      slug:
        params.input.slug !== undefined || name !== existing.name
          ? await buildUniqueResourceSlug(brandId, normalizeText(params.input.slug) || name, existing.id)
          : existing.slug,
      type: params.input.type === undefined ? existing.type : parseResourceType(params.input.type),
      description:
        params.input.description === undefined ? existing.description : normalizeNullableText(params.input.description),
      sortOrder: params.input.sortOrder === undefined ? existing.sortOrder : Number(params.input.sortOrder || 0),
      isActive: params.input.isActive === undefined ? existing.isActive : params.input.isActive,
      ...(params.input.metadata !== undefined ? { metadata: params.input.metadata } : {}),
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

  return toResourceRecord(updated as ResourceWithBrand);
}

export async function deleteScheduleResource(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.scheduleResource.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Resource not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Resource brand cannot be reassigned");

  const assignmentCount = await prisma.scheduleAssignment.count({
    where: {
      scheduleResourceId: existing.id,
      status: { not: "CANCELLED" },
    },
  });
  if (assignmentCount > 0) {
    throw new Error("Cannot delete a resource that still has schedule assignments");
  }

  await prisma.scheduleResource.delete({
    where: { id: existing.id },
  });
}
