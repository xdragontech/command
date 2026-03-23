import { Prisma, ScheduleRecurrencePattern, type ScheduleWeekday } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  addDays,
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  normalizeWeekdays,
  parseIsoDateOnly,
  parseMinuteOfDay,
  parsePositiveInt,
  parseRecurrencePattern,
  parseSeriesStatus,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
  toIsoDateOnly,
  validateTimezone,
  weekdayForDate,
  weeksBetween,
} from "./common";
import type {
  CreateScheduleEventSeriesInput,
  ScheduleEventSeriesRecord,
  SchedulingScope,
  UpdateScheduleEventSeriesInput,
} from "./types";

type SeriesWithBrand = Prisma.ScheduleEventSeriesGetPayload<{
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
        occurrences: true;
      };
    };
  };
}>;

function toSeriesRecord(series: SeriesWithBrand): ScheduleEventSeriesRecord {
  return {
    id: series.id,
    brandId: series.brandId,
    brandKey: series.brand.brandKey,
    brandName: series.brand.name,
    name: series.name,
    slug: series.slug,
    description: series.description || null,
    timezone: series.timezone,
    status: series.status,
    recurrencePattern: series.recurrencePattern,
    recurrenceInterval: series.recurrenceInterval,
    recurrenceDays: series.recurrenceDays,
    seasonStartsOn: toIsoDateOnly(series.seasonStartsOn),
    seasonEndsOn: toIsoDateOnly(series.seasonEndsOn),
    occurrenceDayStartsAtMinutes: series.occurrenceDayStartsAtMinutes,
    occurrenceDayEndsAtMinutes: series.occurrenceDayEndsAtMinutes,
    occurrenceCount: series._count.occurrences,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  };
}

function buildOccurrenceDates(params: {
  seasonStartsOn: Date;
  seasonEndsOn: Date;
  recurrencePattern: ScheduleRecurrencePattern;
  recurrenceInterval: number;
  recurrenceDays: ScheduleWeekday[];
}) {
  const { seasonStartsOn, seasonEndsOn, recurrencePattern, recurrenceInterval, recurrenceDays } = params;
  const dates: Date[] = [];

  if (seasonEndsOn < seasonStartsOn) {
    throw new Error("Season end must be on or after season start");
  }

  if (recurrencePattern === ScheduleRecurrencePattern.NONE) {
    dates.push(seasonStartsOn);
    return dates;
  }

  if (recurrenceDays.length === 0) {
    throw new Error("Weekly recurrence requires at least one weekday");
  }

  for (let current = new Date(seasonStartsOn.toISOString()); current <= seasonEndsOn; current = addDays(current, 1)) {
    const weekday = weekdayForDate(current);
    if (!recurrenceDays.includes(weekday)) continue;
    if (weeksBetween(seasonStartsOn, current) % recurrenceInterval !== 0) continue;
    dates.push(new Date(current.toISOString()));
  }

  return dates;
}

async function buildUniqueSeriesSlug(brandId: string, preferred: string, excludeId?: string) {
  const base = slugify(preferred) || "event-series";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.scheduleEventSeries.findFirst({
      where: { brandId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });

    if (!existing) return slug;
    slug = `${base}-${index}`;
  }

  throw new Error("Unable to allocate a unique series slug");
}

export async function listScheduleEventSeries(params: {
  scope: SchedulingScope;
  q?: string;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleEventSeriesRecord[];

  const q = normalizeText(params.q);
  const where: Prisma.ScheduleEventSeriesWhereInput = brandIds === null ? {} : { brandId: { in: brandIds } };
  const searchWhere: Prisma.ScheduleEventSeriesWhereInput =
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

  const rows = await prisma.scheduleEventSeries.findMany({
    where: searchWhere,
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
          occurrences: true,
        },
      },
    },
    orderBy: [{ seasonStartsOn: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => toSeriesRecord(row as SeriesWithBrand));
}

export async function createScheduleEventSeries(params: {
  scope: SchedulingScope;
  input: CreateScheduleEventSeriesInput;
}) {
  const brandId = resolveWriteBrandId(params.scope, params.input.brandId);
  await ensureBrand(brandId);

  const name = normalizeText(params.input.name);
  if (!name) throw new Error("Series name is required");

  const description = normalizeNullableText(params.input.description);
  const timezone = validateTimezone(params.input.timezone);
  const status = parseSeriesStatus(params.input.status);
  const recurrencePattern = parseRecurrencePattern(params.input.recurrencePattern);
  const recurrenceInterval = parsePositiveInt(params.input.recurrenceInterval, "Recurrence interval", 1);
  const recurrenceDays = normalizeWeekdays(params.input.recurrenceDays);
  const seasonStartsOn = parseIsoDateOnly(params.input.seasonStartsOn, "Season start");
  const seasonEndsOn = parseIsoDateOnly(params.input.seasonEndsOn, "Season end");
  const occurrenceDayStartsAtMinutes = parseMinuteOfDay(
    params.input.occurrenceDayStartsAtMinutes,
    "Occurrence day start",
    0
  );
  const occurrenceDayEndsAtMinutes = parseMinuteOfDay(
    params.input.occurrenceDayEndsAtMinutes,
    "Occurrence day end",
    1440
  );

  if (occurrenceDayEndsAtMinutes <= occurrenceDayStartsAtMinutes) {
    throw new Error("Occurrence day end must be after occurrence day start");
  }

  const slug = await buildUniqueSeriesSlug(brandId, normalizeText(params.input.slug) || name);
  const occurrenceDates = buildOccurrenceDates({
    seasonStartsOn,
    seasonEndsOn,
    recurrencePattern,
    recurrenceInterval,
    recurrenceDays,
  });

  if (occurrenceDates.length === 0) {
    throw new Error("This recurrence does not generate any occurrences within the selected season");
  }

  const series = await prisma.$transaction(async (tx) => {
    const created = await tx.scheduleEventSeries.create({
      data: {
        brandId,
        name,
        slug,
        description,
        timezone,
        status,
        recurrencePattern,
        recurrenceInterval,
        recurrenceDays,
        seasonStartsOn,
        seasonEndsOn,
        occurrenceDayStartsAtMinutes,
        occurrenceDayEndsAtMinutes,
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
        _count: {
          select: {
            occurrences: true,
          },
        },
      },
    });

    await tx.scheduleEventOccurrence.createMany({
      data: occurrenceDates.map((occursOn) => ({
        brandId,
        scheduleEventSeriesId: created.id,
        occursOn,
        dayStartsAtMinutes: occurrenceDayStartsAtMinutes,
        dayEndsAtMinutes: occurrenceDayEndsAtMinutes,
      })),
      skipDuplicates: true,
    });

    return tx.scheduleEventSeries.findUniqueOrThrow({
      where: { id: created.id },
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
            occurrences: true,
          },
        },
      },
    });
  });

  return toSeriesRecord(series);
}

export async function updateScheduleEventSeries(params: {
  scope: SchedulingScope;
  id: string;
  input: UpdateScheduleEventSeriesInput;
}) {
  const existing = await prisma.scheduleEventSeries.findUnique({
    where: { id: params.id },
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
          occurrences: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Series not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Series brand cannot be reassigned");

  const name = normalizeText(params.input.name ?? existing.name);
  if (!name) throw new Error("Series name is required");

  const description = params.input.description === undefined ? existing.description : normalizeNullableText(params.input.description);
  const timezone = params.input.timezone === undefined ? existing.timezone : validateTimezone(params.input.timezone);
  const status = params.input.status === undefined ? existing.status : parseSeriesStatus(params.input.status);
  const recurrencePattern =
    params.input.recurrencePattern === undefined
      ? existing.recurrencePattern
      : parseRecurrencePattern(params.input.recurrencePattern);
  const recurrenceInterval =
    params.input.recurrenceInterval === undefined
      ? existing.recurrenceInterval
      : parsePositiveInt(params.input.recurrenceInterval, "Recurrence interval", 1);
  const recurrenceDays =
    params.input.recurrenceDays === undefined ? existing.recurrenceDays : normalizeWeekdays(params.input.recurrenceDays);
  const seasonStartsOn =
    params.input.seasonStartsOn === undefined
      ? existing.seasonStartsOn
      : parseIsoDateOnly(params.input.seasonStartsOn, "Season start");
  const seasonEndsOn =
    params.input.seasonEndsOn === undefined ? existing.seasonEndsOn : parseIsoDateOnly(params.input.seasonEndsOn, "Season end");
  const occurrenceDayStartsAtMinutes =
    params.input.occurrenceDayStartsAtMinutes === undefined
      ? existing.occurrenceDayStartsAtMinutes
      : parseMinuteOfDay(params.input.occurrenceDayStartsAtMinutes, "Occurrence day start", 0);
  const occurrenceDayEndsAtMinutes =
    params.input.occurrenceDayEndsAtMinutes === undefined
      ? existing.occurrenceDayEndsAtMinutes
      : parseMinuteOfDay(params.input.occurrenceDayEndsAtMinutes, "Occurrence day end", 1440);

  if (occurrenceDayEndsAtMinutes <= occurrenceDayStartsAtMinutes) {
    throw new Error("Occurrence day end must be after occurrence day start");
  }

  const recurrenceChanged =
    recurrencePattern !== existing.recurrencePattern ||
    recurrenceInterval !== existing.recurrenceInterval ||
    JSON.stringify(recurrenceDays) !== JSON.stringify(existing.recurrenceDays) ||
    seasonStartsOn.getTime() !== existing.seasonStartsOn.getTime() ||
    seasonEndsOn.getTime() !== existing.seasonEndsOn.getTime() ||
    occurrenceDayStartsAtMinutes !== existing.occurrenceDayStartsAtMinutes ||
    occurrenceDayEndsAtMinutes !== existing.occurrenceDayEndsAtMinutes;

  const slug =
    params.input.slug !== undefined || name !== existing.name
      ? await buildUniqueSeriesSlug(brandId, normalizeText(params.input.slug) || name, existing.id)
      : existing.slug;

  const nextOccurrenceDates = recurrenceChanged
    ? buildOccurrenceDates({
        seasonStartsOn,
        seasonEndsOn,
        recurrencePattern,
        recurrenceInterval,
        recurrenceDays,
      })
    : [];

  if (recurrenceChanged && nextOccurrenceDates.length === 0) {
    throw new Error("This recurrence does not generate any occurrences within the selected season");
  }

  if (recurrenceChanged) {
    const assignmentCount = await prisma.scheduleAssignment.count({
      where: {
        scheduleEventOccurrenceId: {
          in: (
            await prisma.scheduleEventOccurrence.findMany({
              where: { scheduleEventSeriesId: existing.id },
              select: { id: true },
            })
          ).map((occurrence) => occurrence.id),
        },
        status: { not: "CANCELLED" },
      },
    });

    if (assignmentCount > 0) {
      throw new Error("Cannot change recurrence or occurrence window after assignments exist");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.scheduleEventSeries.update({
      where: { id: existing.id },
      data: {
        name,
        slug,
        description,
        timezone,
        status,
        recurrencePattern,
        recurrenceInterval,
        recurrenceDays,
        seasonStartsOn,
        seasonEndsOn,
        occurrenceDayStartsAtMinutes,
        occurrenceDayEndsAtMinutes,
        ...(params.input.metadata !== undefined ? { metadata: params.input.metadata } : {}),
      },
    });

    if (recurrenceChanged) {
      await tx.scheduleEventOccurrence.deleteMany({
        where: { scheduleEventSeriesId: existing.id },
      });

      await tx.scheduleEventOccurrence.createMany({
        data: nextOccurrenceDates.map((occursOn) => ({
          brandId,
          scheduleEventSeriesId: existing.id,
          occursOn,
          dayStartsAtMinutes: occurrenceDayStartsAtMinutes,
          dayEndsAtMinutes: occurrenceDayEndsAtMinutes,
        })),
      });
    }

    return tx.scheduleEventSeries.findUniqueOrThrow({
      where: { id: existing.id },
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
            occurrences: true,
          },
        },
      },
    });
  });

  return toSeriesRecord(updated as SeriesWithBrand);
}

export async function deleteScheduleEventSeries(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.scheduleEventSeries.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Series not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Series brand cannot be reassigned");

  const assignmentCount = await prisma.scheduleAssignment.count({
    where: {
      occurrence: {
        scheduleEventSeriesId: existing.id,
      },
      status: { not: "CANCELLED" },
    },
  });

  if (assignmentCount > 0) {
    throw new Error("Cannot delete a series that still has schedule assignments");
  }

  await prisma.scheduleEventSeries.delete({
    where: { id: existing.id },
  });
}
