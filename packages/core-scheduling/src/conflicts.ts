import type { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { formatConflictTimeRange, normalizeNullableId, parseIsoDateOnly, resolveReadableBrandIds, toIsoDateOnly } from "./common";
import type { ScheduleConflictRecord, SchedulingScope } from "./types";

type AssignmentForConflict = Prisma.ScheduleAssignmentGetPayload<{
  include: {
    occurrence: {
      include: {
        series: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
    resource: {
      select: {
        id: true;
        name: true;
      };
    };
    participant: {
      select: {
        id: true;
        displayName: true;
      };
    };
  };
}>;

function overlaps(a: AssignmentForConflict, b: AssignmentForConflict) {
  return a.startsAtMinutes < b.endsAtMinutes && b.startsAtMinutes < a.endsAtMinutes;
}

function resourceConflictRecord(type: ScheduleConflictRecord["type"], left: AssignmentForConflict, right: AssignmentForConflict) {
  const participantNames = [left.participant.displayName, right.participant.displayName];
  const assignmentIds = [left.id, right.id].sort();
  const resourceName = left.resource.name;
  const occursOn = toIsoDateOnly(left.occurrence.occursOn);
  const sameRange = left.startsAtMinutes === right.startsAtMinutes && left.endsAtMinutes === right.endsAtMinutes;
  const rangeLabel = sameRange
    ? formatConflictTimeRange(left.startsAtMinutes, left.endsAtMinutes)
    : `${formatConflictTimeRange(left.startsAtMinutes, left.endsAtMinutes)} vs ${formatConflictTimeRange(
        right.startsAtMinutes,
        right.endsAtMinutes
      )}`;

  return {
    type,
    brandId: left.brandId,
    occursOn,
    occurrenceId: left.scheduleEventOccurrenceId,
    seriesId: left.occurrence.series.id,
    seriesName: left.occurrence.series.name,
    resourceIds: [left.scheduleResourceId],
    resourceNames: [resourceName],
    participantIds: [left.scheduleParticipantId, right.scheduleParticipantId],
    participantNames,
    assignmentIds,
    message: `${resourceName} has overlapping assignments on ${occursOn}: ${participantNames.join(" vs ")} (${rangeLabel}).`,
  } satisfies ScheduleConflictRecord;
}

function participantConflictRecord(left: AssignmentForConflict, right: AssignmentForConflict) {
  const assignmentIds = [left.id, right.id].sort();
  const occursOn = toIsoDateOnly(left.occurrence.occursOn);

  return {
    type: "PARTICIPANT_DOUBLE_BOOKED",
    brandId: left.brandId,
    occursOn,
    occurrenceId: left.scheduleEventOccurrenceId,
    seriesId: left.occurrence.series.id,
    seriesName: left.occurrence.series.name,
    resourceIds: [left.scheduleResourceId, right.scheduleResourceId],
    resourceNames: [left.resource.name, right.resource.name],
    participantIds: [left.scheduleParticipantId],
    participantNames: [left.participant.displayName],
    assignmentIds,
    message: `${left.participant.displayName} is double-booked on ${occursOn} across ${left.resource.name} and ${right.resource.name}.`,
  } satisfies ScheduleConflictRecord;
}

export function detectScheduleConflicts(assignments: AssignmentForConflict[]) {
  const conflicts: ScheduleConflictRecord[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < assignments.length; index += 1) {
    for (let cursor = index + 1; cursor < assignments.length; cursor += 1) {
      const left = assignments[index];
      const right = assignments[cursor];

      if (left.scheduleEventOccurrenceId !== right.scheduleEventOccurrenceId) continue;
      if (!overlaps(left, right)) continue;

      if (left.scheduleResourceId === right.scheduleResourceId) {
        const key = `resource:${[left.id, right.id].sort().join(":")}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push(resourceConflictRecord("RESOURCE_DOUBLE_BOOKED", left, right));
        }
      }

      if (left.scheduleParticipantId === right.scheduleParticipantId) {
        const key = `participant:${[left.id, right.id].sort().join(":")}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push(participantConflictRecord(left, right));
        }
      }
    }
  }

  return conflicts;
}

export async function listScheduleConflicts(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  seriesId?: string | null;
  occurrenceId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleConflictRecord[];

  const seriesId = normalizeNullableId(params.seriesId);
  const occurrenceId = normalizeNullableId(params.occurrenceId);
  const from = params.from ? parseIsoDateOnly(params.from, "From date") : null;
  const to = params.to ? parseIsoDateOnly(params.to, "To date") : null;

  const assignments = await prisma.scheduleAssignment.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
      ...(occurrenceId ? { scheduleEventOccurrenceId: occurrenceId } : {}),
      ...(seriesId || from || to
        ? {
            occurrence: {
              ...(seriesId ? { scheduleEventSeriesId: seriesId } : {}),
              ...(from || to
                ? {
                    occursOn: {
                      ...(from ? { gte: from } : {}),
                      ...(to ? { lte: to } : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
    include: {
      occurrence: {
        include: {
          series: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      resource: {
        select: {
          id: true,
          name: true,
        },
      },
      participant: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ scheduleEventOccurrenceId: "asc" }, { startsAtMinutes: "asc" }, { createdAt: "asc" }],
  });

  return detectScheduleConflicts(assignments);
}
