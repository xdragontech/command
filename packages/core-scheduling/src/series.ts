import { Prisma, ScheduleRecurrencePattern, type ScheduleWeekday } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  DEFAULT_SCHEDULE_EVENT_COLOR,
  addDays,
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  parseScheduleEventColor,
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
    color: series.color,
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

  const color = parseScheduleEventColor(params.input.color, DEFAULT_SCHEDULE_EVENT_COLOR);
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
        color,
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

  const color = params.input.color === undefined ? existing.color : parseScheduleEventColor(params.input.color, existing.color);
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

  const occurrenceDatesChanged =
    recurrencePattern !== existing.recurrencePattern ||
    recurrenceInterval !== existing.recurrenceInterval ||
    JSON.stringify(recurrenceDays) !== JSON.stringify(existing.recurrenceDays) ||
    seasonStartsOn.getTime() !== existing.seasonStartsOn.getTime() ||
    seasonEndsOn.getTime() !== existing.seasonEndsOn.getTime();
  const occurrenceWindowChanged =
    occurrenceDayStartsAtMinutes !== existing.occurrenceDayStartsAtMinutes ||
    occurrenceDayEndsAtMinutes !== existing.occurrenceDayEndsAtMinutes;
  const recurrenceChanged = occurrenceDatesChanged || occurrenceWindowChanged;

  const slug =
    params.input.slug !== undefined || name !== existing.name
      ? await buildUniqueSeriesSlug(brandId, normalizeText(params.input.slug) || name, existing.id)
      : existing.slug;

  const nextOccurrenceDates = occurrenceDatesChanged
    ? buildOccurrenceDates({
        seasonStartsOn,
        seasonEndsOn,
        recurrencePattern,
        recurrenceInterval,
        recurrenceDays,
      })
    : [];

  if (occurrenceDatesChanged && nextOccurrenceDates.length === 0) {
    throw new Error("This recurrence does not generate any occurrences within the selected season");
  }

  const existingOccurrences = recurrenceChanged
    ? await prisma.scheduleEventOccurrence.findMany({
        where: { scheduleEventSeriesId: existing.id },
        include: {
          assignments: {
            select: {
              id: true,
              status: true,
              kind: true,
              startsAtMinutes: true,
              endsAtMinutes: true,
            },
          },
        },
      })
    : [];

  const nextOccurrenceDateKeys = occurrenceDatesChanged
    ? new Set(nextOccurrenceDates.map((occursOn) => toIsoDateOnly(occursOn)))
    : null;
  const keptOccurrences = occurrenceDatesChanged
    ? existingOccurrences.filter((occurrence) => nextOccurrenceDateKeys?.has(toIsoDateOnly(occurrence.occursOn)))
    : existingOccurrences;
  const removedOccurrences = occurrenceDatesChanged
    ? existingOccurrences.filter((occurrence) => !nextOccurrenceDateKeys?.has(toIsoDateOnly(occurrence.occursOn)))
    : [];
  const addedOccurrenceDates = occurrenceDatesChanged
    ? nextOccurrenceDates.filter(
        (occursOn) => !existingOccurrences.some((occurrence) => toIsoDateOnly(occurrence.occursOn) === toIsoDateOnly(occursOn))
      )
    : [];

  if (occurrenceDatesChanged) {
    const removedWithAssignments = removedOccurrences.find((occurrence) => occurrence.assignments.length > 0);
    if (removedWithAssignments) {
      throw new Error("Cannot remove occurrences that still have assignment history");
    }
  }

  if (occurrenceWindowChanged) {
    const invalidAssignment = keptOccurrences
      .flatMap((occurrence) =>
        occurrence.assignments
          .filter((assignment) => assignment.status !== "CANCELLED" && assignment.kind !== "FULL_DAY")
          .map((assignment) => ({
            occursOn: toIsoDateOnly(occurrence.occursOn),
            assignment,
          }))
      )
      .find(
        ({ assignment }) =>
          assignment.startsAtMinutes < occurrenceDayStartsAtMinutes ||
          assignment.endsAtMinutes > occurrenceDayEndsAtMinutes
      );

    if (invalidAssignment) {
      throw new Error(
        `Cannot shorten the occurrence window because a scheduled slot on ${invalidAssignment.occursOn} would fall outside it`
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.scheduleEventSeries.update({
      where: { id: existing.id },
      data: {
        name,
        slug,
        color,
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
      if (occurrenceDatesChanged && removedOccurrences.length > 0) {
        await tx.scheduleEventOccurrence.deleteMany({
          where: {
            id: {
              in: removedOccurrences.map((occurrence) => occurrence.id),
            },
          },
        });
      }

      if (occurrenceWindowChanged && keptOccurrences.length > 0) {
        await tx.scheduleEventOccurrence.updateMany({
          where: {
            id: {
              in: keptOccurrences.map((occurrence) => occurrence.id),
            },
          },
          data: {
            dayStartsAtMinutes: occurrenceDayStartsAtMinutes,
            dayEndsAtMinutes: occurrenceDayEndsAtMinutes,
          },
        });

        await tx.scheduleAssignment.updateMany({
          where: {
            scheduleEventOccurrenceId: {
              in: keptOccurrences.map((occurrence) => occurrence.id),
            },
            kind: "FULL_DAY",
          },
          data: {
            startsAtMinutes: occurrenceDayStartsAtMinutes,
            endsAtMinutes: occurrenceDayEndsAtMinutes,
          },
        });
      }

      if (occurrenceDatesChanged && addedOccurrenceDates.length > 0) {
        await tx.scheduleEventOccurrence.createMany({
          data: addedOccurrenceDates.map((occursOn) => ({
            brandId,
            scheduleEventSeriesId: existing.id,
            occursOn,
            dayStartsAtMinutes: occurrenceDayStartsAtMinutes,
            dayEndsAtMinutes: occurrenceDayEndsAtMinutes,
          })),
        });
      }
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
