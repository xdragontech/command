import {
  Prisma,
  type ScheduleParticipantType,
  type SchedulePublicFeedOrderBy,
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
    resource: {
      select: {
        id: true;
        name: true;
        locationId: true;
        type: true;
      };
    };
  };
}>;

function toSchedulePublicFeedRecord(feed: SchedulePublicFeedWithRelations): SchedulePublicFeedRecord {
  return {
    id: feed.id,
    brandId: feed.brandId,
    brandKey: feed.brand.brandKey,
    brandName: feed.brand.name,
    seriesId: feed.scheduleEventSeriesId,
    seriesName: feed.series.name,
    resourceId: feed.scheduleResourceId || "",
    resourceName: feed.resource?.name || "",
    resourceLocationId: feed.resource?.locationId || "",
    resourceType: feed.resourceType,
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

async function resolveFeedResource(params: {
  brandId: string;
  scheduleEventSeriesId: string;
  scheduleResourceId: string;
  resourceType: ScheduleResourceType;
}) {
  const scheduleResourceId = normalizeText(params.scheduleResourceId);
  if (!scheduleResourceId) throw new Error("Resource is required");

  const resource = await prisma.scheduleResource.findUnique({
    where: { id: scheduleResourceId },
    select: {
      id: true,
      brandId: true,
      scheduleEventSeriesId: true,
      name: true,
      locationId: true,
      type: true,
    },
  });

  if (!resource) throw new Error("Resource not found");
  if (resource.brandId !== params.brandId) throw new Error("Feed resource must match the selected brand");
  if (resource.scheduleEventSeriesId !== params.scheduleEventSeriesId) {
    throw new Error("Feed resource must belong to the selected event");
  }
  if (resource.type !== params.resourceType) {
    throw new Error("Feed resource type must match the selected resource");
  }

  return resource;
}

function parseFeedInput(input: {
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
      resource: {
        select: {
          id: true,
          name: true,
          locationId: true,
          type: true,
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
  const resource = await resolveFeedResource({
    brandId,
    scheduleEventSeriesId: series.id,
    scheduleResourceId: params.input.scheduleResourceId,
    resourceType: parsed.resourceType,
  });

  const feed = await prisma.schedulePublicFeed.create({
    data: {
      brandId,
      scheduleEventSeriesId: series.id,
      scheduleResourceId: resource.id,
      startsOn: parsed.startsOn,
      endsOn: parsed.endsOn,
      weekdays: parsed.weekdays,
      resourceType: parsed.resourceType,
      participantType: parsed.participantType,
      orderBy: parsed.orderBy,
      isActive: true,
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
      resource: {
        select: {
          id: true,
          name: true,
          locationId: true,
          type: true,
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
      resource: {
        select: {
          id: true,
          name: true,
          locationId: true,
          type: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Feed not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Feed brand cannot be reassigned");

  const parsed = parseFeedInput({
    startsOn: params.input.startsOn ?? toIsoDateOnly(existing.startsOn),
    endsOn: params.input.endsOn ?? toIsoDateOnly(existing.endsOn),
    weekdays: params.input.weekdays ?? existing.weekdays,
    resourceType: params.input.resourceType ?? existing.resourceType,
    participantType: params.input.participantType ?? existing.participantType,
    orderBy: params.input.orderBy ?? existing.orderBy,
  });

  const resource = await resolveFeedResource({
    brandId,
    scheduleEventSeriesId: existing.scheduleEventSeriesId,
    scheduleResourceId: params.input.scheduleResourceId ?? existing.scheduleResourceId ?? "",
    resourceType: parsed.resourceType,
  });

  const updated = await prisma.schedulePublicFeed.update({
    where: { id: existing.id },
    data: {
      scheduleResourceId: resource.id,
      startsOn: parsed.startsOn,
      endsOn: parsed.endsOn,
      weekdays: parsed.weekdays,
      resourceType: parsed.resourceType,
      participantType: parsed.participantType,
      orderBy: parsed.orderBy,
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
      resource: {
        select: {
          id: true,
          name: true,
          locationId: true,
          type: true,
        },
      },
    },
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
