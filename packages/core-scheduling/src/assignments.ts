import type { Prisma, ScheduleAssignmentKind, ScheduleParticipantType, ScheduleResourceType } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  SchedulingConflictError,
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  normalizeUrl,
  parseAssignmentStatus,
  parseMinuteOfDay,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  toIsoDateOnly,
} from "./common";
import { detectScheduleConflicts } from "./conflicts";
import type { CreateScheduleAssignmentInput, ScheduleAssignmentRecord, SchedulingScope } from "./types";

type AssignmentWithRelations = Prisma.ScheduleAssignmentGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
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
        type: true;
      };
    };
    participant: {
      select: {
        id: true;
        displayName: true;
        type: true;
      };
    };
  };
}>;

function toAssignmentRecord(assignment: AssignmentWithRelations): ScheduleAssignmentRecord {
  return {
    id: assignment.id,
    brandId: assignment.brandId,
    brandKey: assignment.brand.brandKey,
    brandName: assignment.brand.name,
    occurrenceId: assignment.scheduleEventOccurrenceId,
    occursOn: toIsoDateOnly(assignment.occurrence.occursOn),
    occurrenceName: assignment.occurrence.name || null,
    seriesId: assignment.occurrence.series.id,
    seriesName: assignment.occurrence.series.name,
    resourceId: assignment.scheduleResourceId,
    resourceName: assignment.resource.name,
    resourceType: assignment.resource.type,
    participantId: assignment.scheduleParticipantId,
    participantName: assignment.participant.displayName,
    participantType: assignment.participant.type,
    kind: assignment.kind,
    status: assignment.status,
    startsAtMinutes: assignment.startsAtMinutes,
    endsAtMinutes: assignment.endsAtMinutes,
    publicTitle: assignment.publicTitle || null,
    publicSubtitle: assignment.publicSubtitle || null,
    publicDescription: assignment.publicDescription || null,
    publicLocationLabel: assignment.publicLocationLabel || null,
    publicUrl: assignment.publicUrl || null,
    internalNotes: assignment.internalNotes || null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

function assertKindMatchesParticipantType(kind: ScheduleAssignmentKind, participantType: ScheduleParticipantType) {
  if (participantType === "ENTERTAINMENT" && kind !== "TIMED_SLOT") {
    throw new Error("Entertainment participants must use timed slots");
  }

  if (participantType !== "ENTERTAINMENT" && kind !== "FULL_DAY") {
    throw new Error("Vendor participants must use full-day assignments");
  }
}

function assertResourceSupportsParticipantType(resourceType: ScheduleResourceType, participantType: ScheduleParticipantType) {
  if (resourceType === "OTHER") return;

  if (participantType === "ENTERTAINMENT" && resourceType !== "STAGE") {
    throw new Error("Entertainment participants must be assigned to stage resources");
  }

  if (participantType === "FOOD_VENDOR" && resourceType !== "FOOD_SPOT") {
    throw new Error("Food vendors must be assigned to food spot resources");
  }

  if (participantType === "MARKET_VENDOR" && resourceType !== "MARKET_SPOT") {
    throw new Error("Market vendors must be assigned to market spot resources");
  }
}

export async function listScheduleAssignments(params: {
  scope: SchedulingScope;
  brandId?: string | null;
  occurrenceId?: string | null;
  participantId?: string | null;
  resourceId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleAssignmentRecord[];

  const rows = await prisma.scheduleAssignment.findMany({
    where: {
      ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
      ...(normalizeNullableId(params.occurrenceId) ? { scheduleEventOccurrenceId: normalizeNullableId(params.occurrenceId)! } : {}),
      ...(normalizeNullableId(params.participantId) ? { scheduleParticipantId: normalizeNullableId(params.participantId)! } : {}),
      ...(normalizeNullableId(params.resourceId) ? { scheduleResourceId: normalizeNullableId(params.resourceId)! } : {}),
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
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
          type: true,
        },
      },
      participant: {
        select: {
          id: true,
          displayName: true,
          type: true,
        },
      },
    },
    orderBy: [{ occurrence: { occursOn: "asc" } }, { startsAtMinutes: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(toAssignmentRecord);
}

export async function createScheduleAssignment(params: {
  scope: SchedulingScope;
  input: CreateScheduleAssignmentInput;
}) {
  const occurrence = await prisma.scheduleEventOccurrence.findUnique({
    where: { id: params.input.occurrenceId },
    include: {
      series: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!occurrence) throw new Error("Occurrence not found");

  const brandId = resolveWriteBrandId(params.scope, params.input.brandId || occurrence.brandId, {
    allowSingleBrandFallback: false,
  });
  if (brandId !== occurrence.brandId) throw new Error("Assignment brand must match the occurrence brand");
  const brand = await ensureBrand(brandId);

  const resource = await prisma.scheduleResource.findUnique({
    where: { id: params.input.resourceId },
    select: { id: true, brandId: true, name: true, type: true },
  });
  if (!resource) throw new Error("Resource not found");
  if (resource.brandId !== brandId) throw new Error("Resource brand must match the assignment brand");

  const participant = await prisma.scheduleParticipant.findUnique({
    where: { id: params.input.participantId },
    select: { id: true, brandId: true, displayName: true, type: true },
  });
  if (!participant) throw new Error("Participant not found");
  if (participant.brandId !== brandId) throw new Error("Participant brand must match the assignment brand");

  const status = parseAssignmentStatus(params.input.status);
  assertKindMatchesParticipantType(params.input.kind, participant.type);
  assertResourceSupportsParticipantType(resource.type, participant.type);
  const startsAtMinutes =
    params.input.kind === "FULL_DAY"
      ? occurrence.dayStartsAtMinutes
      : parseMinuteOfDay(params.input.startsAtMinutes, "Start time");
  const endsAtMinutes =
    params.input.kind === "FULL_DAY"
      ? occurrence.dayEndsAtMinutes
      : parseMinuteOfDay(params.input.endsAtMinutes, "End time");

  if (endsAtMinutes <= startsAtMinutes) {
    throw new Error("Assignment end time must be after start time");
  }

  if (startsAtMinutes < occurrence.dayStartsAtMinutes || endsAtMinutes > occurrence.dayEndsAtMinutes) {
    throw new Error("Assignment time must fit within the occurrence window");
  }

  const pendingAssignment = {
    id: "pending",
    brandId,
    scheduleEventOccurrenceId: occurrence.id,
    scheduleResourceId: resource.id,
    scheduleParticipantId: participant.id,
    kind: params.input.kind,
    status,
    startsAtMinutes,
    endsAtMinutes,
    publicTitle: null,
    publicSubtitle: null,
    publicDescription: null,
    publicLocationLabel: null,
    publicUrl: null,
    internalNotes: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    brand,
    occurrence: {
      ...occurrence,
      series: occurrence.series,
    },
    resource,
    participant,
  } as unknown as AssignmentWithRelations;

  const existingAssignments = await prisma.scheduleAssignment.findMany({
    where: {
      brandId,
      scheduleEventOccurrenceId: occurrence.id,
      status: { not: "CANCELLED" },
      OR: [{ scheduleResourceId: resource.id }, { scheduleParticipantId: participant.id }],
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
  });

  const conflicts = detectScheduleConflicts([...existingAssignments, pendingAssignment as any]).filter((conflict) =>
    conflict.assignmentIds.includes("pending")
  );

  if (conflicts.length > 0 && !params.input.allowConflicts) {
    throw new SchedulingConflictError("Assignment conflicts with the current schedule", conflicts);
  }

  const created = await prisma.scheduleAssignment.create({
    data: {
      brandId,
      scheduleEventOccurrenceId: occurrence.id,
      scheduleResourceId: resource.id,
      scheduleParticipantId: participant.id,
      kind: params.input.kind,
      status,
      startsAtMinutes,
      endsAtMinutes,
      publicTitle: normalizeNullableText(params.input.publicTitle),
      publicSubtitle: normalizeNullableText(params.input.publicSubtitle),
      publicDescription: normalizeNullableText(params.input.publicDescription),
      publicLocationLabel: normalizeNullableText(params.input.publicLocationLabel),
      publicUrl: normalizeUrl(params.input.publicUrl),
      internalNotes: normalizeNullableText(params.input.internalNotes),
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
          type: true,
        },
      },
      participant: {
        select: {
          id: true,
          displayName: true,
          type: true,
        },
      },
    },
  });

  return toAssignmentRecord(created);
}
