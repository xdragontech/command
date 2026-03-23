import type { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { normalizeNullableId, parseIsoDateOnly, resolveReadableBrandIds, toIsoDateOnly } from "./common";
import type { ScheduleEventOccurrenceRecord, SchedulingScope } from "./types";

type OccurrenceWithRelations = Prisma.ScheduleEventOccurrenceGetPayload<{
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
    _count: {
      select: {
        assignments: true;
      };
    };
  };
}>;

function toOccurrenceRecord(occurrence: OccurrenceWithRelations): ScheduleEventOccurrenceRecord {
  return {
    id: occurrence.id,
    brandId: occurrence.brandId,
    brandKey: occurrence.brand.brandKey,
    brandName: occurrence.brand.name,
    seriesId: occurrence.series.id,
    seriesName: occurrence.series.name,
    name: occurrence.name || null,
    occursOn: toIsoDateOnly(occurrence.occursOn),
    dayStartsAtMinutes: occurrence.dayStartsAtMinutes,
    dayEndsAtMinutes: occurrence.dayEndsAtMinutes,
    status: occurrence.status,
    assignmentCount: occurrence._count.assignments,
    createdAt: occurrence.createdAt.toISOString(),
    updatedAt: occurrence.updatedAt.toISOString(),
  };
}

export async function listScheduleOccurrences(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  seriesId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleEventOccurrenceRecord[];

  const seriesId = normalizeNullableId(params.seriesId);
  const from = params.from ? parseIsoDateOnly(params.from, "From date") : null;
  const to = params.to ? parseIsoDateOnly(params.to, "To date") : null;

  const where: Prisma.ScheduleEventOccurrenceWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(seriesId ? { scheduleEventSeriesId: seriesId } : {}),
    ...(from || to
      ? {
          occursOn: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.scheduleEventOccurrence.findMany({
    where,
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
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: [{ occursOn: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(toOccurrenceRecord);
}
