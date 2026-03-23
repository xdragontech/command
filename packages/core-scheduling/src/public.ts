import type {
  Prisma,
  ScheduleAssignmentKind,
  ScheduleEventOccurrenceStatus,
  ScheduleParticipantType,
  ScheduleResourceType,
  ScheduleEventSeriesStatus,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  normalizeText,
  parseIsoDateOnly,
  parseParticipantType,
  parseResourceType,
  toIsoDateOnly,
} from "./common";
import type {
  PublicScheduleEntry,
  PublicScheduleFeedRange,
} from "./types";

type PublicScheduleAssignmentRow = Prisma.ScheduleAssignmentGetPayload<{
  include: {
    occurrence: {
      include: {
        series: {
          select: {
            id: true;
            slug: true;
            name: true;
            timezone: true;
            status: true;
          };
        };
      };
    };
    resource: {
      select: {
        id: true;
        slug: true;
        name: true;
        type: true;
        sortOrder: true;
      };
    };
    participant: {
      select: {
        id: true;
        slug: true;
        displayName: true;
        type: true;
      };
    };
  };
}>;

export class PublicScheduleQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicScheduleQueryError";
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date.toISOString());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatLocalDateTime(occursOn: string, minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${occursOn}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function formatTimeLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatTimeRange(start: number, end: number) {
  return `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`;
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const raw = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, max);
}

function parseExactDate(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? parseIsoDateOnly(normalized, "Date") : null;
}

function parseRange(params: {
  from?: unknown;
  to?: unknown;
  exactDate?: unknown;
  fallbackDays: number;
  maxDays: number;
}) {
  const exactDate = parseExactDate(params.exactDate);
  let from = params.from ? parseIsoDateOnly(params.from, "From date") : null;
  let to = params.to ? parseIsoDateOnly(params.to, "To date") : null;

  if (exactDate) {
    from = exactDate;
    to = exactDate;
  }

  if (!from && !to) {
    from = parseIsoDateOnly(new Date().toISOString().slice(0, 10), "From date");
    to = addDays(from, params.fallbackDays - 1);
  } else if (from && !to) {
    to = addDays(from, params.fallbackDays - 1);
  } else if (!from && to) {
    from = addDays(to, -(params.fallbackDays - 1));
  }

  if (!from || !to) {
    throw new PublicScheduleQueryError("Schedule range is required");
  }

  if (to < from) {
    throw new PublicScheduleQueryError("Schedule range end must be on or after range start");
  }

  const maxExclusive = addDays(from, params.maxDays);
  if (to >= maxExclusive) {
    throw new PublicScheduleQueryError(`Schedule range cannot exceed ${params.maxDays} days`);
  }

  return {
    from,
    to,
    range: {
      from: toIsoDateOnly(from),
      to: toIsoDateOnly(to),
    } satisfies PublicScheduleFeedRange,
  };
}

function buildSlugOrNameFilter(value: string) {
  return {
    OR: [
      { slug: { equals: value.toLowerCase(), mode: "insensitive" as const } },
      { name: { equals: value, mode: "insensitive" as const } },
    ],
  };
}

function normalizeQueryText(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function buildPublicScheduleFilters(params: {
  eventSeries?: unknown;
  resource?: unknown;
  location?: unknown;
  participantType?: unknown;
  resourceType?: unknown;
}) {
  const eventSeries = normalizeText(params.eventSeries);
  const resourceOrLocation = normalizeText(params.resource) || normalizeText(params.location);
  const participantType = normalizeText(params.participantType)
    ? parseParticipantType(params.participantType)
    : null;
  const resourceType = normalizeText(params.resourceType)
    ? parseResourceType(params.resourceType)
    : null;

  return {
    eventSeries,
    resourceOrLocation,
    participantType,
    resourceType,
  };
}

function toPublicScheduleEntry(row: PublicScheduleAssignmentRow, sequence: number | null): PublicScheduleEntry {
  const occursOn = toIsoDateOnly(row.occurrence.occursOn);
  const allDay = row.kind === "FULL_DAY";
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    allDay,
    occursOn,
    timezone: row.occurrence.series.timezone,
    start: allDay ? occursOn : formatLocalDateTime(occursOn, row.startsAtMinutes),
    end: allDay ? toIsoDateOnly(addDays(row.occurrence.occursOn, 1)) : formatLocalDateTime(occursOn, row.endsAtMinutes),
    startsAtMinutes: row.startsAtMinutes,
    endsAtMinutes: row.endsAtMinutes,
    timeLabel: allDay ? "All Day" : formatTimeRange(row.startsAtMinutes, row.endsAtMinutes),
    occurrenceWindowLabel: formatTimeRange(row.occurrence.dayStartsAtMinutes, row.occurrence.dayEndsAtMinutes),
    sequence,
    title: row.publicTitle || row.participant.displayName,
    subtitle: row.publicSubtitle || null,
    description: row.publicDescription || null,
    locationLabel: row.publicLocationLabel || row.resource.name,
    url: row.publicUrl || null,
    eventSeries: {
      id: row.occurrence.series.id,
      slug: row.occurrence.series.slug,
      name: row.occurrence.series.name,
    },
    occurrence: {
      id: row.scheduleEventOccurrenceId,
      name: row.occurrence.name || null,
      status: row.occurrence.status as ScheduleEventOccurrenceStatus,
    },
    resource: {
      id: row.resource.id,
      slug: row.resource.slug,
      name: row.resource.name,
      type: row.resource.type,
    },
    participant: {
      id: row.participant.id,
      slug: row.participant.slug,
      displayName: row.participant.displayName,
      type: row.participant.type,
    },
  };
}

function deriveSequences(rows: PublicScheduleAssignmentRow[]) {
  const counters = new Map<string, number>();

  return rows.map((row) => {
    if (row.participant.type !== "ENTERTAINMENT" || row.kind !== "TIMED_SLOT") {
      return null;
    }

    const key = `${row.scheduleEventOccurrenceId}:${row.scheduleResourceId}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    return next;
  });
}

function applyPostFilters(params: {
  items: PublicScheduleEntry[];
  q?: unknown;
  sequence?: unknown;
  limit: number;
}) {
  const q = normalizeQueryText(params.q);
  const sequenceRaw = normalizeText(params.sequence);
  const sequence = sequenceRaw ? Number.parseInt(sequenceRaw, 10) : null;

  if (sequenceRaw && (!Number.isInteger(sequence) || !sequence || sequence < 1)) {
    throw new PublicScheduleQueryError("Sequence must be a positive integer");
  }

  let items = params.items;

  if (q) {
    items = items.filter((item) =>
      [
        item.title,
        item.subtitle || "",
        item.description || "",
        item.locationLabel,
        item.eventSeries.name,
        item.occurrence.name || "",
        item.resource.name,
        item.resource.slug,
        item.participant.displayName,
        item.participant.slug,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  if (sequence) {
    items = items.filter((item) => item.sequence === sequence);
  }

  return items.slice(0, params.limit);
}

async function loadPublishedScheduleAssignments(params: {
  brandId: string;
  from: Date;
  to: Date;
  eventSeries?: unknown;
  resource?: unknown;
  location?: unknown;
  participantType?: unknown;
  resourceType?: unknown;
}) {
  const filters = buildPublicScheduleFilters(params);

  const where: Prisma.ScheduleAssignmentWhereInput = {
    brandId: params.brandId,
    status: "PUBLISHED",
    occurrence: {
      occursOn: {
        gte: params.from,
        lte: params.to,
      },
      status: "SCHEDULED",
      series: {
        status: {
          in: ["ACTIVE", "ARCHIVED"] satisfies ScheduleEventSeriesStatus[],
        },
        ...(filters.eventSeries ? buildSlugOrNameFilter(filters.eventSeries) : {}),
      },
    },
    ...(filters.resourceOrLocation
      ? {
          resource: buildSlugOrNameFilter(filters.resourceOrLocation),
        }
      : {}),
    ...(filters.participantType
      ? {
          participant: { type: filters.participantType },
        }
      : {}),
    ...(filters.resourceType
      ? {
          resource: {
            ...(filters.resourceOrLocation ? buildSlugOrNameFilter(filters.resourceOrLocation) : {}),
            type: filters.resourceType,
          },
        }
      : {}),
  };

  return prisma.scheduleAssignment.findMany({
    where,
    include: {
      occurrence: {
        include: {
          series: {
            select: {
              id: true,
              slug: true,
              name: true,
              timezone: true,
              status: true,
            },
          },
        },
      },
      resource: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          sortOrder: true,
        },
      },
      participant: {
        select: {
          id: true,
          slug: true,
          displayName: true,
          type: true,
        },
      },
    },
    orderBy: [
      { occurrence: { occursOn: "asc" } },
      { startsAtMinutes: "asc" },
      { resource: { sortOrder: "asc" } },
      { resource: { name: "asc" } },
      { participant: { displayName: "asc" } },
    ],
  });
}

export async function listPublicScheduleCalendar(params: {
  brandId: string;
  from?: unknown;
  to?: unknown;
  occurrenceDate?: unknown;
  eventSeries?: unknown;
  participantType?: unknown;
  resource?: unknown;
  location?: unknown;
  resourceType?: unknown;
  q?: unknown;
  sequence?: unknown;
  limit?: unknown;
}) {
  const { from, to, range } = parseRange({
    from: params.from,
    to: params.to,
    exactDate: params.occurrenceDate,
    fallbackDays: 60,
    maxDays: 180,
  });

  const rows = await loadPublishedScheduleAssignments({
    brandId: params.brandId,
    from,
    to,
    eventSeries: params.eventSeries,
    participantType: params.participantType,
    resource: params.resource,
    location: params.location,
    resourceType: params.resourceType,
  });

  const sequences = deriveSequences(rows);
  const items = applyPostFilters({
    items: rows.map((row, index) => toPublicScheduleEntry(row, sequences[index])),
    q: params.q,
    sequence: params.sequence,
    limit: parseLimit(params.limit, 300, 500),
  });

  return { range, items };
}

export async function listPublicScheduleList(params: {
  brandId: string;
  date?: unknown;
  from?: unknown;
  to?: unknown;
  occurrenceDate?: unknown;
  eventSeries?: unknown;
  participantType?: unknown;
  resource?: unknown;
  location?: unknown;
  resourceType?: unknown;
  q?: unknown;
  sequence?: unknown;
  limit?: unknown;
}) {
  const { from, to, range } = parseRange({
    from: params.from,
    to: params.to,
    exactDate: params.date ?? params.occurrenceDate,
    fallbackDays: 30,
    maxDays: 120,
  });

  const rows = await loadPublishedScheduleAssignments({
    brandId: params.brandId,
    from,
    to,
    eventSeries: params.eventSeries,
    participantType: params.participantType,
    resource: params.resource,
    location: params.location,
    resourceType: params.resourceType,
  });

  const sequences = deriveSequences(rows);
  const items = applyPostFilters({
    items: rows.map((row, index) => toPublicScheduleEntry(row, sequences[index])),
    q: params.q,
    sequence: params.sequence,
    limit: parseLimit(params.limit, 100, 200),
  });

  return { range, items };
}
