import type { Prisma, ScheduleAssignmentKind, ScheduleParticipantType, ScheduleResourceType } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  SchedulingConflictError,
  ensureBrand,
  parseAssignmentKind,
  parseIsoDateOnly,
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
import { listScheduleOccurrenceVisibilitySummaries } from "./occurrences";
import type {
  CreateScheduleAssignmentInput,
  ScheduleAssignmentRecord,
  ScheduleAssignmentBulkStatusAction,
  ScheduleAssignmentBulkStatusResult,
  SchedulingScope,
  UpdateScheduleAssignmentInput,
} from "./types";

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

async function listOccurrenceAssignmentsForConflictCheck(params: {
  brandId: string;
  occurrenceId: string;
  excludeAssignmentId?: string;
}) {
  return prisma.scheduleAssignment.findMany({
    where: {
      brandId: params.brandId,
      scheduleEventOccurrenceId: params.occurrenceId,
      status: { not: "CANCELLED" },
      ...(params.excludeAssignmentId ? { NOT: { id: params.excludeAssignmentId } } : {}),
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
    orderBy: [{ startsAtMinutes: "asc" }, { createdAt: "asc" }],
  });
}

async function listOccurrencePublishConflicts(params: {
  brandId: string;
  occurrenceId: string;
  excludeAssignmentId?: string;
  pendingAssignment?: AssignmentWithRelations;
}) {
  const existingAssignments = await listOccurrenceAssignmentsForConflictCheck({
    brandId: params.brandId,
    occurrenceId: params.occurrenceId,
    excludeAssignmentId: params.excludeAssignmentId,
  });

  return detectScheduleConflicts(params.pendingAssignment ? [...existingAssignments, params.pendingAssignment] : existingAssignments);
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
  seriesId?: string | null;
  occurrenceId?: string | null;
  participantId?: string | null;
  resourceId?: string | null;
  from?: string | null;
  to?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleAssignmentRecord[];

  const seriesId = normalizeNullableId(params.seriesId);
  const from = params.from ? parseIsoDateOnly(params.from, "From date") : null;
  const to = params.to ? parseIsoDateOnly(params.to, "To date") : null;

  const rows = await prisma.scheduleAssignment.findMany({
    where: {
      ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
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
  const {
    brandId,
    occurrence,
    resource,
    participant,
    kind,
    status,
    startsAtMinutes,
    endsAtMinutes,
    conflicts,
    publishConflicts,
  } = await resolveAssignmentMutation({
    scope: params.scope,
    input: {
      occurrenceId: params.input.occurrenceId,
      resourceId: params.input.resourceId,
      participantId: params.input.participantId,
      kind: params.input.kind,
      status: params.input.status,
      startsAtMinutes: params.input.startsAtMinutes,
      endsAtMinutes: params.input.endsAtMinutes,
      brandId: params.input.brandId,
    },
  });

  if (conflicts.length > 0 && !params.input.allowConflicts) {
    throw new SchedulingConflictError("Assignment conflicts with the current schedule", conflicts);
  }

  if (status === "PUBLISHED" && publishConflicts.length > 0 && !params.input.allowConflicts) {
    throw new SchedulingConflictError("Occurrence still has schedule conflicts and cannot be published safely", publishConflicts);
  }

  const created = await prisma.scheduleAssignment.create({
    data: {
      brandId,
      scheduleEventOccurrenceId: occurrence.id,
      scheduleResourceId: resource.id,
      scheduleParticipantId: participant.id,
      kind,
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

export async function updateScheduleAssignment(params: {
  scope: SchedulingScope;
  id: string;
  input: UpdateScheduleAssignmentInput;
}) {
  const existing = await prisma.scheduleAssignment.findUnique({
    where: { id: params.id },
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
          brandId: true,
          name: true,
          type: true,
        },
      },
      participant: {
        select: {
          id: true,
          brandId: true,
          displayName: true,
          type: true,
        },
      },
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Assignment not found");

  const {
    brandId,
    occurrence,
    resource,
    participant,
    kind,
    status,
    startsAtMinutes,
    endsAtMinutes,
    conflicts,
    publishConflicts,
  } = await resolveAssignmentMutation({
    scope: params.scope,
    existingAssignmentId: existing.id,
    input: {
      occurrenceId: params.input.occurrenceId ?? existing.scheduleEventOccurrenceId,
      resourceId: params.input.resourceId ?? existing.scheduleResourceId,
      participantId: params.input.participantId ?? existing.scheduleParticipantId,
      kind: params.input.kind ?? existing.kind,
      status: params.input.status ?? existing.status,
      startsAtMinutes: params.input.startsAtMinutes ?? existing.startsAtMinutes,
      endsAtMinutes: params.input.endsAtMinutes ?? existing.endsAtMinutes,
      brandId: existing.brandId,
    },
  });

  if (conflicts.length > 0 && !params.input.allowConflicts) {
    throw new SchedulingConflictError("Assignment conflicts with the current schedule", conflicts);
  }

  if (status === "PUBLISHED" && publishConflicts.length > 0 && !params.input.allowConflicts) {
    throw new SchedulingConflictError("Occurrence still has schedule conflicts and cannot be published safely", publishConflicts);
  }

  const updated = await prisma.scheduleAssignment.update({
    where: { id: existing.id },
    data: {
      brandId,
      scheduleEventOccurrenceId: occurrence.id,
      scheduleResourceId: resource.id,
      scheduleParticipantId: participant.id,
      kind,
      status,
      startsAtMinutes,
      endsAtMinutes,
      ...(params.input.publicTitle !== undefined ? { publicTitle: normalizeNullableText(params.input.publicTitle) } : {}),
      ...(params.input.publicSubtitle !== undefined ? { publicSubtitle: normalizeNullableText(params.input.publicSubtitle) } : {}),
      ...(params.input.publicDescription !== undefined
        ? { publicDescription: normalizeNullableText(params.input.publicDescription) }
        : {}),
      ...(params.input.publicLocationLabel !== undefined
        ? { publicLocationLabel: normalizeNullableText(params.input.publicLocationLabel) }
        : {}),
      ...(params.input.publicUrl !== undefined ? { publicUrl: normalizeUrl(params.input.publicUrl) } : {}),
      ...(params.input.internalNotes !== undefined ? { internalNotes: normalizeNullableText(params.input.internalNotes) } : {}),
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

  return toAssignmentRecord(updated);
}

export async function deleteScheduleAssignment(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.scheduleAssignment.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Assignment not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Assignment brand cannot be reassigned");

  await prisma.scheduleAssignment.delete({
    where: { id: existing.id },
  });
}

export async function bulkUpdateScheduleAssignmentStatus(params: {
  scope: SchedulingScope;
  occurrenceId: string;
  action: ScheduleAssignmentBulkStatusAction;
}): Promise<ScheduleAssignmentBulkStatusResult> {
  const occurrence = await prisma.scheduleEventOccurrence.findUnique({
    where: { id: params.occurrenceId },
    select: { id: true, brandId: true },
  });
  if (!occurrence) throw new Error("Occurrence not found");

  const brandId = resolveWriteBrandId(params.scope, occurrence.brandId, { allowSingleBrandFallback: false });
  if (brandId !== occurrence.brandId) throw new Error("Occurrence brand cannot be reassigned");

  if (params.action === "publish") {
    const conflicts = await listOccurrencePublishConflicts({ brandId, occurrenceId: occurrence.id });
    if (conflicts.length > 0) {
      throw new SchedulingConflictError("Occurrence still has schedule conflicts and cannot be published safely", conflicts);
    }
  }

  const updated = await prisma.scheduleAssignment.updateMany({
    where: {
      brandId,
      scheduleEventOccurrenceId: occurrence.id,
      status: params.action === "publish" ? "DRAFT" : "PUBLISHED",
    },
    data: {
      status: params.action === "publish" ? "PUBLISHED" : "DRAFT",
    },
  });

  const [summary] = await listScheduleOccurrenceVisibilitySummaries({
    scope: params.scope,
    occurrenceId: occurrence.id,
  });
  if (!summary) throw new Error("Failed to reload occurrence visibility");

  return {
    action: params.action,
    occurrenceId: occurrence.id,
    updatedCount: updated.count,
    summary,
  };
}

async function resolveAssignmentMutation(params: {
  scope: SchedulingScope;
  input: {
    brandId?: string | null;
    occurrenceId: string;
    resourceId: string;
    participantId: string;
    kind: ScheduleAssignmentKind | string;
    status?: unknown;
    startsAtMinutes?: number | null;
    endsAtMinutes?: number | null;
  };
  existingAssignmentId?: string;
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

  const kind = parseAssignmentKind(params.input.kind);
  const status = parseAssignmentStatus(params.input.status);
  assertKindMatchesParticipantType(kind, participant.type);
  assertResourceSupportsParticipantType(resource.type, participant.type);

  const startsAtMinutes =
    kind === "FULL_DAY"
      ? occurrence.dayStartsAtMinutes
      : parseMinuteOfDay(params.input.startsAtMinutes, "Start time");
  const endsAtMinutes =
    kind === "FULL_DAY"
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
    kind,
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
      ...(params.existingAssignmentId ? { NOT: { id: params.existingAssignmentId } } : {}),
      OR: [{ scheduleResourceId: resource.id }, { scheduleParticipantId: participant.id }],
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

  const conflicts = detectScheduleConflicts([...existingAssignments, pendingAssignment]).filter((conflict) =>
    conflict.assignmentIds.includes("pending")
  );
  const publishConflicts =
    status === "PUBLISHED"
      ? await listOccurrencePublishConflicts({
          brandId,
          occurrenceId: occurrence.id,
          excludeAssignmentId: params.existingAssignmentId,
          pendingAssignment,
        })
      : conflicts;

  return {
    brandId,
    occurrence,
    resource,
    participant,
    kind,
    status,
    startsAtMinutes,
    endsAtMinutes,
    conflicts,
    publishConflicts,
  };
}
