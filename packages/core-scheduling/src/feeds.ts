import {
  Prisma,
  type ScheduleParticipantType,
  type SchedulePublicFeedOrderBy,
  type SchedulePublicFeedResourceSelectionMode,
  type ScheduleResourceType,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  normalizeNullableId,
  normalizeText,
  normalizeWeekdays,
  parseIsoDateOnly,
  parseParticipantType,
  parsePublicFeedOrderBy,
  parsePublicFeedResourceSelectionMode,
  parseResourceType,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  toIsoDateOnly,
} from "./common";
import type {
  CreateSchedulePublicFeedInput,
  SchedulePublicFeedRecord,
  SchedulingScope,
  UpdateSchedulePublicFeedInput,
} from "./types";

type FeedResourceSelection = {
  id: string;
  name: string;
  locationId: string;
  type: ScheduleResourceType;
};

type SchedulePublicFeedWithRelations = Prisma.SchedulePublicFeedGetPayload<{
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
    resources: {
      include: {
        resource: {
          select: {
            id: true;
            name: true;
            locationId: true;
            type: true;
          };
        };
      };
    };
  };
}>;

function compareText(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function toSchedulePublicFeedRecord(feed: SchedulePublicFeedWithRelations): SchedulePublicFeedRecord {
  const selectedResources = feed.resources
    .map((entry) => ({
      id: entry.resource.id,
      name: entry.resource.name,
      locationId: entry.resource.locationId,
    }))
    .sort((left, right) => compareText(left.name, right.name) || compareText(left.locationId, right.locationId));

  return {
    id: feed.id,
    brandId: feed.brandId,
    brandKey: feed.brand.brandKey,
    brandName: feed.brand.name,
    seriesId: feed.scheduleEventSeriesId,
    seriesName: feed.series.name,
    resourceType: feed.resourceType,
    resourceSelectionMode: feed.resourceSelectionMode,
    selectedResources,
    participantType: feed.participantType,
    feedId: feed.feedId,
    startsOn: toIsoDateOnly(feed.startsOn),
    endsOn: toIsoDateOnly(feed.endsOn),
    weekdays: feed.weekdays,
    orderBy: feed.orderBy,
    isActive: feed.isActive,
    createdAt: feed.createdAt.toISOString(),
    updatedAt: feed.updatedAt.toISOString(),
  };
}

async function resolveFeedSeries(params: { brandId: string; scheduleEventSeriesId: string }) {
  const scheduleEventSeriesId = normalizeText(params.scheduleEventSeriesId);
  if (!scheduleEventSeriesId) throw new Error("Event is required");

  const series = await prisma.scheduleEventSeries.findUnique({
    where: { id: scheduleEventSeriesId },
    select: { id: true, brandId: true, name: true },
  });

  if (!series) throw new Error("Event not found");
  if (series.brandId !== params.brandId) throw new Error("Feed event must match the selected brand");
  return series;
}

function normalizeResourceIds(value: unknown) {
  return Array.from(
    new Set((Array.isArray(value) ? value : []).map((entry) => normalizeText(entry)).filter(Boolean))
  );
}

async function resolveFeedResources(params: {
  brandId: string;
  scheduleEventSeriesId: string;
  scheduleResourceIds: string[];
  resourceType: ScheduleResourceType;
}) {
  if (params.scheduleResourceIds.length === 0) return [] as FeedResourceSelection[];

  const rows = await prisma.scheduleResource.findMany({
    where: {
      id: { in: params.scheduleResourceIds },
      brandId: params.brandId,
      scheduleEventSeriesId: params.scheduleEventSeriesId,
      type: params.resourceType,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      locationId: true,
      type: true,
    },
  });

  if (rows.length !== params.scheduleResourceIds.length) {
    throw new Error("Selected resources must be active resources in the selected event and resource type");
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  return params.scheduleResourceIds.map((id) => byId.get(id)!).filter(Boolean);
}

async function validateFeedResourceSelection(params: {
  brandId: string;
  scheduleEventSeriesId: string;
  scheduleResourceIds: string[];
  resourceType: ScheduleResourceType;
  resourceSelectionMode: SchedulePublicFeedResourceSelectionMode;
}) {
  if (params.resourceSelectionMode === "ALL") {
    const count = await prisma.scheduleResource.count({
      where: {
        brandId: params.brandId,
        scheduleEventSeriesId: params.scheduleEventSeriesId,
        type: params.resourceType,
        isActive: true,
      },
    });

    if (count === 0) {
      throw new Error("No active resources match the selected resource type");
    }

    return [] as FeedResourceSelection[];
  }

  const selectedResources = await resolveFeedResources(params);
  if (selectedResources.length === 0) {
    throw new Error("Select at least one active resource or choose all resources");
  }
  return selectedResources;
}

function parseFeedInput(input: {
  resourceSelectionMode?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  weekdays?: unknown;
  resourceType?: unknown;
  participantType?: unknown;
  orderBy?: unknown;
}) {
  const startsOn = parseIsoDateOnly(input.startsOn, "Feed start date");
  const endsOn = parseIsoDateOnly(input.endsOn, "Feed end date");
  if (endsOn < startsOn) {
    throw new Error("Feed end date must be on or after the feed start date");
  }

  const weekdays = normalizeWeekdays(input.weekdays);
  if (weekdays.length === 0) {
    throw new Error("Feed weekdays are required");
  }

  const resourceType = parseResourceType(input.resourceType);
  const resourceSelectionMode = parsePublicFeedResourceSelectionMode(input.resourceSelectionMode);
  const participantType = parseParticipantType(input.participantType);
  const orderBy = parsePublicFeedOrderBy(input.orderBy);
  if (resourceType !== "OTHER") {
    if (participantType === "ENTERTAINMENT" && resourceType !== "STAGE") {
      throw new Error("Entertainment feeds must use stage resources");
    }
    if (participantType === "FOOD_VENDOR" && resourceType !== "FOOD_SPOT") {
      throw new Error("Food vendor feeds must use food spot resources");
    }
    if (participantType === "MARKET_VENDOR" && resourceType !== "MARKET_SPOT") {
      throw new Error("Market vendor feeds must use market spot resources");
    }
  }

  return {
    startsOn,
    endsOn,
    weekdays,
    resourceType,
    resourceSelectionMode,
    participantType,
    orderBy,
  };
}

export async function listSchedulePublicFeeds(params: {
  scope: SchedulingScope;
  seriesId?: string | null;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as SchedulePublicFeedRecord[];

  const seriesId = normalizeNullableId(params.seriesId);

  const rows = await prisma.schedulePublicFeed.findMany({
    where: {
      ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
      ...(seriesId ? { scheduleEventSeriesId: seriesId } : {}),
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
      resources: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              locationId: true,
              type: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return rows.map((row) => toSchedulePublicFeedRecord(row as SchedulePublicFeedWithRelations));
}

export async function createSchedulePublicFeed(params: {
  scope: SchedulingScope;
  input: CreateSchedulePublicFeedInput;
}) {
  const brandId = resolveWriteBrandId(params.scope, params.input.brandId);
  await ensureBrand(brandId);
  const parsed = parseFeedInput(params.input);
  const series = await resolveFeedSeries({
    brandId,
    scheduleEventSeriesId: params.input.scheduleEventSeriesId,
  });
  const selectedResources = await validateFeedResourceSelection({
    brandId,
    scheduleEventSeriesId: series.id,
    scheduleResourceIds: normalizeResourceIds(params.input.scheduleResourceIds),
    resourceType: parsed.resourceType,
    resourceSelectionMode: parsed.resourceSelectionMode,
  });

  const feed = await prisma.schedulePublicFeed.create({
    data: {
      brandId,
      scheduleEventSeriesId: series.id,
      startsOn: parsed.startsOn,
      endsOn: parsed.endsOn,
      weekdays: parsed.weekdays,
      resourceType: parsed.resourceType,
      resourceSelectionMode: parsed.resourceSelectionMode,
      participantType: parsed.participantType,
      orderBy: parsed.orderBy,
      isActive: true,
      metadata: params.input.metadata,
      resources:
        parsed.resourceSelectionMode === "SELECTED"
          ? {
              createMany: {
                data: selectedResources.map((resource) => ({
                  scheduleResourceId: resource.id,
                })),
              },
            }
          : undefined,
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
      resources: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              locationId: true,
              type: true,
            },
          },
        },
      },
    },
  });

  return toSchedulePublicFeedRecord(feed as SchedulePublicFeedWithRelations);
}

export async function updateSchedulePublicFeed(params: {
  scope: SchedulingScope;
  id: string;
  input: UpdateSchedulePublicFeedInput;
}) {
  const existing = await prisma.schedulePublicFeed.findUnique({
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
      resources: {
        include: {
          resource: {
            select: {
              id: true,
              name: true,
              locationId: true,
              type: true,
            },
          },
        },
      },
    },
  });
  if (!existing) throw new Error("Feed not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Feed brand cannot be reassigned");

  const parsed = parseFeedInput({
    resourceSelectionMode: params.input.resourceSelectionMode ?? existing.resourceSelectionMode,
    startsOn: params.input.startsOn ?? toIsoDateOnly(existing.startsOn),
    endsOn: params.input.endsOn ?? toIsoDateOnly(existing.endsOn),
    weekdays: params.input.weekdays ?? existing.weekdays,
    resourceType: params.input.resourceType ?? existing.resourceType,
    participantType: params.input.participantType ?? existing.participantType,
    orderBy: params.input.orderBy ?? existing.orderBy,
  });

  const selectedResources = await validateFeedResourceSelection({
    brandId,
    scheduleEventSeriesId: existing.scheduleEventSeriesId,
    scheduleResourceIds: normalizeResourceIds(
      params.input.scheduleResourceIds ?? existing.resources.map((entry) => entry.scheduleResourceId)
    ),
    resourceType: parsed.resourceType,
    resourceSelectionMode: parsed.resourceSelectionMode,
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.schedulePublicFeed.update({
      where: { id: existing.id },
      data: {
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn,
        weekdays: parsed.weekdays,
        resourceType: parsed.resourceType,
        resourceSelectionMode: parsed.resourceSelectionMode,
        participantType: parsed.participantType,
        orderBy: parsed.orderBy,
        ...(params.input.metadata !== undefined ? { metadata: params.input.metadata } : {}),
      },
    });

    await tx.schedulePublicFeedResource.deleteMany({
      where: { schedulePublicFeedId: existing.id },
    });

    if (parsed.resourceSelectionMode === "SELECTED" && selectedResources.length > 0) {
      await tx.schedulePublicFeedResource.createMany({
        data: selectedResources.map((resource) => ({
          schedulePublicFeedId: existing.id,
          scheduleResourceId: resource.id,
        })),
      });
    }

    return tx.schedulePublicFeed.findUniqueOrThrow({
      where: { id: existing.id },
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
        resources: {
          include: {
            resource: {
              select: {
                id: true,
                name: true,
                locationId: true,
                type: true,
              },
            },
          },
        },
      },
    });
  });

  return toSchedulePublicFeedRecord(updated as SchedulePublicFeedWithRelations);
}

export async function deleteSchedulePublicFeed(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.schedulePublicFeed.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Feed not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Feed brand cannot be reassigned");

  await prisma.schedulePublicFeed.delete({
    where: { id: existing.id },
  });
}
