import type { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { listScheduleConflicts } from "./conflicts";
import { normalizeNullableId, parseIsoDateOnly, resolveReadableBrandIds, toIsoDateOnly } from "./common";
import type {
  ScheduleEventOccurrenceRecord,
  ScheduleOccurrenceVisibilityState,
  ScheduleOccurrenceVisibilitySummaryRecord,
  SchedulingScope,
} from "./types";

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

type OccurrenceVisibilityWithRelations = Prisma.ScheduleEventOccurrenceGetPayload<{
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
    assignments: {
      select: {
        status: true;
      };
    };
  };
}>;

function buildOccurrenceWhere(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  seriesId?: string | null;
  occurrenceId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return { brandIds, where: null };

  const seriesId = normalizeNullableId(params.seriesId);
  const occurrenceId = normalizeNullableId(params.occurrenceId);
  const from = params.from ? parseIsoDateOnly(params.from, "From date") : null;
  const to = params.to ? parseIsoDateOnly(params.to, "To date") : null;

  const where: Prisma.ScheduleEventOccurrenceWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(seriesId ? { scheduleEventSeriesId: seriesId } : {}),
    ...(occurrenceId ? { id: occurrenceId } : {}),
    ...(from || to
      ? {
          occursOn: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  return { brandIds, where };
}

function deriveVisibilityState(params: {
  totalAssignments: number;
  draftCount: number;
  publishedCount: number;
}): ScheduleOccurrenceVisibilityState {
  if (params.totalAssignments === 0 || params.publishedCount === 0) return "NOT_PUBLIC";
  if (params.draftCount === 0 && params.publishedCount === params.totalAssignments) return "FULLY_PUBLIC";
  return "PARTIALLY_PUBLIC";
}

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

function toOccurrenceVisibilitySummary(
  occurrence: OccurrenceVisibilityWithRelations,
  conflictCount: number
): ScheduleOccurrenceVisibilitySummaryRecord {
  const draftCount = occurrence.assignments.filter((assignment) => assignment.status === "DRAFT").length;
  const publishedCount = occurrence.assignments.filter((assignment) => assignment.status === "PUBLISHED").length;
  const cancelledCount = occurrence.assignments.filter((assignment) => assignment.status === "CANCELLED").length;
  const totalAssignments = occurrence.assignments.length;

  return {
    occurrenceId: occurrence.id,
    brandId: occurrence.brandId,
    brandKey: occurrence.brand.brandKey,
    brandName: occurrence.brand.name,
    seriesId: occurrence.series.id,
    seriesName: occurrence.series.name,
    occurrenceName: occurrence.name || null,
    occursOn: toIsoDateOnly(occurrence.occursOn),
    occurrenceStatus: occurrence.status,
    totalAssignments,
    draftCount,
    publishedCount,
    cancelledCount,
    conflictCount,
    visibilityState: deriveVisibilityState({ totalAssignments, draftCount, publishedCount }),
  };
}

export async function listScheduleOccurrences(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  seriesId?: string | null;
  occurrenceId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const query = buildOccurrenceWhere(params);
  if (query.brandIds !== null && Array.isArray(query.brandIds) && query.brandIds.length === 0) {
    return [] as ScheduleEventOccurrenceRecord[];
  }
  if (!query.where) return [] as ScheduleEventOccurrenceRecord[];

  const rows = await prisma.scheduleEventOccurrence.findMany({
    where: query.where,
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

export async function listScheduleOccurrenceVisibilitySummaries(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  seriesId?: string | null;
  occurrenceId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const query = buildOccurrenceWhere(params);
  if (query.brandIds !== null && Array.isArray(query.brandIds) && query.brandIds.length === 0) {
    return [] as ScheduleOccurrenceVisibilitySummaryRecord[];
  }
  if (!query.where) return [] as ScheduleOccurrenceVisibilitySummaryRecord[];

  const [rows, conflicts] = await Promise.all([
    prisma.scheduleEventOccurrence.findMany({
      where: query.where,
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
        assignments: {
          select: {
            status: true,
          },
        },
      },
      orderBy: [{ occursOn: "asc" }, { createdAt: "asc" }],
    }),
    listScheduleConflicts({
      scope: params.scope,
      brandId: params.brandId || null,
      seriesId: params.seriesId || null,
      occurrenceId: params.occurrenceId || null,
      from: params.from || null,
      to: params.to || null,
    }),
  ]);

  const conflictCounts = new Map<string, number>();
  for (const conflict of conflicts) {
    conflictCounts.set(conflict.occurrenceId, (conflictCounts.get(conflict.occurrenceId) || 0) + 1);
  }

  return rows.map((occurrence) => toOccurrenceVisibilitySummary(occurrence, conflictCounts.get(occurrence.id) || 0));
}
