import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  ensureRequired,
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
    series: {
      select: {
        id: true;
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
    seriesId: resource.series?.id || null,
    seriesName: resource.series?.name || null,
    name: resource.name,
    slug: resource.slug,
    locationId: resource.locationId,
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

async function resolveResourceSeries(brandId: string, scheduleEventSeriesId: string | null | undefined) {
  const seriesId = normalizeNullableId(scheduleEventSeriesId);
  if (!seriesId) throw new Error("Event is required");

  const series = await prisma.scheduleEventSeries.findUnique({
    where: { id: seriesId },
    select: { id: true, brandId: true, name: true },
  });
  if (!series) throw new Error("Event not found");
  if (series.brandId !== brandId) throw new Error("Resource event must match the resource brand");
  return series;
}

async function assertUniqueLocationId(params: {
  scheduleEventSeriesId: string;
  locationId: string;
  excludeId?: string;
}) {
  const existing = await prisma.scheduleResource.findFirst({
    where: {
      scheduleEventSeriesId: params.scheduleEventSeriesId,
      locationId: params.locationId,
      ...(params.excludeId ? { NOT: { id: params.excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Location ID must be unique within the selected event");
  }
}

export async function listScheduleResources(params: {
  scope: SchedulingScope;
  q?: string;
  brandId?: string | null;
  seriesId?: string | null;
  type?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleResourceRecord[];

  const q = normalizeText(params.q);
  const type = normalizeText(params.type);
  const seriesId = normalizeNullableId(params.seriesId);
  const where: Prisma.ScheduleResourceWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(seriesId ? { scheduleEventSeriesId: seriesId } : {}),
    ...(type ? { type: parseResourceType(type) } : {}),
  };
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
                { series: { is: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
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
      series: {
        select: {
          id: true,
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
  const series = await resolveResourceSeries(brandId, params.input.scheduleEventSeriesId);

  const name = normalizeText(params.input.name);
  if (!name) throw new Error("Resource name is required");
  const locationId = normalizeText(params.input.locationId);
  ensureRequired(locationId, "Location ID");
  await assertUniqueLocationId({ scheduleEventSeriesId: series.id, locationId });

  const resource = await prisma.scheduleResource.create({
    data: {
      brandId,
      scheduleEventSeriesId: series.id,
      name,
      slug: await buildUniqueResourceSlug(brandId, normalizeText(params.input.slug) || name),
      locationId,
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
      series: {
        select: {
          id: true,
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
      series: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Resource not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Resource brand cannot be reassigned");
  const series =
    params.input.scheduleEventSeriesId !== undefined
      ? await resolveResourceSeries(brandId, params.input.scheduleEventSeriesId)
      : existing.series;

  if (!series) throw new Error("Event is required");

  const name = normalizeText(params.input.name ?? existing.name);
  if (!name) throw new Error("Resource name is required");
  const locationId = normalizeText(params.input.locationId ?? existing.locationId);
  ensureRequired(locationId, "Location ID");
  const nextType = params.input.type === undefined ? existing.type : parseResourceType(params.input.type);

  const activeFeedCount = await prisma.schedulePublicFeed.count({
    where: {
      scheduleResourceId: existing.id,
      isActive: true,
    },
  });
  if (
    activeFeedCount > 0 &&
    (series.id !== existing.scheduleEventSeriesId || nextType !== existing.type)
  ) {
    throw new Error("Cannot change event or resource type while the resource is referenced by an active public feed");
  }

  await assertUniqueLocationId({
    scheduleEventSeriesId: series.id,
    locationId,
    excludeId: existing.id,
  });

  const updated = await prisma.scheduleResource.update({
    where: { id: existing.id },
    data: {
      scheduleEventSeriesId: params.input.scheduleEventSeriesId !== undefined ? series.id : existing.scheduleEventSeriesId,
      name,
      slug:
        params.input.slug !== undefined || name !== existing.name
          ? await buildUniqueResourceSlug(brandId, normalizeText(params.input.slug) || name, existing.id)
          : existing.slug,
      locationId,
      type: nextType,
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
      series: {
        select: {
          id: true,
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

  const feedCount = await prisma.schedulePublicFeed.count({
    where: {
      scheduleResourceId: existing.id,
      isActive: true,
    },
  });
  if (feedCount > 0) {
    throw new Error("Cannot delete a resource that is still referenced by an active public feed");
  }

  await prisma.scheduleResource.delete({
    where: { id: existing.id },
  });
}
