import { Prisma, ScheduleParticipantSource } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  parseParticipantStatus,
  parseParticipantType,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
} from "./common";
import type {
  CreateScheduleParticipantInput,
  ScheduleParticipantAdoptionCandidateRecord,
  ScheduleParticipantRecord,
  SchedulingScope,
  UpsertApprovedPartnerScheduleParticipantInput,
  UpdateScheduleParticipantInput,
} from "./types";

type ParticipantWithBrand = Prisma.ScheduleParticipantGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
  };
}>;

function toParticipantRecord(participant: ParticipantWithBrand): ScheduleParticipantRecord {
  return {
    id: participant.id,
    brandId: participant.brandId,
    brandKey: participant.brand.brandKey,
    brandName: participant.brand.name,
    partnerProfileId: participant.partnerProfileId,
    displayName: participant.displayName,
    slug: participant.slug,
    type: participant.type,
    status: participant.status,
    source: participant.source,
    summary: participant.summary || null,
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
  };
}

type ParticipantCandidateWithCounts = Prisma.ScheduleParticipantGetPayload<{
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
        assignments: true;
      };
    };
  };
}>;

function normalizeDisplayNameKey(value: string) {
  return normalizeText(value).toLocaleLowerCase();
}

function toAdoptionCandidateRecord(
  participant: ParticipantCandidateWithCounts,
  params: { displayName: string; slug: string }
): ScheduleParticipantAdoptionCandidateRecord {
  return {
    id: participant.id,
    brandId: participant.brandId,
    brandKey: participant.brand.brandKey,
    brandName: participant.brand.name,
    partnerProfileId: participant.partnerProfileId,
    displayName: participant.displayName,
    slug: participant.slug,
    type: participant.type,
    status: participant.status,
    source: participant.source,
    summary: participant.summary || null,
    assignmentCount: participant._count.assignments,
    exactSlugMatch: participant.slug === params.slug,
    exactDisplayNameMatch: normalizeDisplayNameKey(participant.displayName) === normalizeDisplayNameKey(params.displayName),
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
  };
}

function compareAdoptionCandidates(
  left: ScheduleParticipantAdoptionCandidateRecord,
  right: ScheduleParticipantAdoptionCandidateRecord
) {
  if (left.exactSlugMatch !== right.exactSlugMatch) return left.exactSlugMatch ? -1 : 1;
  if (left.exactDisplayNameMatch !== right.exactDisplayNameMatch) return left.exactDisplayNameMatch ? -1 : 1;
  if (left.assignmentCount !== right.assignmentCount) return right.assignmentCount - left.assignmentCount;
  return left.displayName.localeCompare(right.displayName);
}

function resolveAutoAdoptionCandidate(
  candidates: ScheduleParticipantAdoptionCandidateRecord[]
): ScheduleParticipantAdoptionCandidateRecord | null {
  const exactSlugMatches = candidates.filter((candidate) => candidate.exactSlugMatch);
  if (exactSlugMatches.length > 1) {
    throw new Error("Multiple existing schedulable participants match this partner by slug. Select the correct participant before approval.");
  }
  if (exactSlugMatches.length === 1) return exactSlugMatches[0];

  const exactNameMatches = candidates.filter((candidate) => candidate.exactDisplayNameMatch);
  if (exactNameMatches.length > 1) {
    throw new Error("Multiple existing schedulable participants match this partner by name. Select the correct participant before approval.");
  }
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  return null;
}

async function buildUniqueParticipantSlug(
  db: Prisma.TransactionClient | typeof prisma,
  brandId: string,
  preferred: string,
  excludeId?: string
) {
  const base = slugify(preferred) || "participant";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await db.scheduleParticipant.findFirst({
      where: { brandId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${index}`;
  }

  throw new Error("Unable to allocate a unique participant slug");
}

export async function listScheduleParticipantAdoptionCandidates(params: {
  db?: Prisma.TransactionClient;
  brandId: string;
  type: UpsertApprovedPartnerScheduleParticipantInput["type"];
  displayName: string;
  slug?: string | null;
}) {
  const db = params.db ?? prisma;
  const brandId = normalizeText(params.brandId);
  const displayName = normalizeText(params.displayName);
  if (!brandId) throw new Error("Partner participant brand is required");
  if (!displayName) throw new Error("Participant display name is required");

  const slugInput = normalizeText(params.slug) || displayName;
  const normalizedSlug = slugify(slugInput) || "participant";

  const rows = await db.scheduleParticipant.findMany({
    where: {
      brandId,
      type: params.type,
      partnerProfileId: null,
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
          assignments: {
            where: {
              status: { not: "CANCELLED" },
            },
          },
        },
      },
    },
    orderBy: [{ displayName: "asc" }],
  });

  return rows
    .map((row) =>
      toAdoptionCandidateRecord(row as ParticipantCandidateWithCounts, {
        displayName,
        slug: normalizedSlug,
      })
    )
    .sort(compareAdoptionCandidates);
}

export async function listScheduleParticipants(params: {
  scope: SchedulingScope;
  q?: string;
  brandId?: string | null;
  seriesId?: string | null;
  type?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleParticipantRecord[];

  const q = normalizeText(params.q);
  const seriesId = normalizeNullableId(params.seriesId);
  const participantType = normalizeNullableText(params.type) ? parseParticipantType(params.type) : undefined;
  const where: Prisma.ScheduleParticipantWhereInput = {
    ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
    ...(participantType ? { type: participantType } : {}),
    ...(seriesId
      ? {
          assignments: {
            some: {
              status: { not: "CANCELLED" },
              occurrence: {
                scheduleEventSeriesId: seriesId,
              },
            },
          },
        }
      : {}),
  };
  const searchWhere: Prisma.ScheduleParticipantWhereInput =
    q.length > 0
      ? {
          AND: [
            where,
            {
              OR: [
                { displayName: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { summary: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            },
          ],
        }
      : where;

  const rows = await prisma.scheduleParticipant.findMany({
    where: searchWhere,
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
    orderBy: [{ displayName: "asc" }],
  });

  return rows.map((row) => toParticipantRecord(row as ParticipantWithBrand));
}

export async function createScheduleParticipant(params: {
  scope: SchedulingScope;
  input: CreateScheduleParticipantInput;
}) {
  const brandId = resolveWriteBrandId(params.scope, params.input.brandId);
  await ensureBrand(brandId);

  const displayName = normalizeText(params.input.displayName);
  if (!displayName) throw new Error("Participant display name is required");

  const participant = await prisma.scheduleParticipant.create({
    data: {
      brandId,
      displayName,
      slug: await buildUniqueParticipantSlug(prisma, brandId, normalizeText(params.input.slug) || displayName),
      type: parseParticipantType(params.input.type),
      status: parseParticipantStatus(params.input.status),
      summary: normalizeNullableText(params.input.summary),
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
    },
  });

  return toParticipantRecord(participant);
}

export async function updateScheduleParticipant(params: {
  scope: SchedulingScope;
  id: string;
  input: UpdateScheduleParticipantInput;
}) {
  const existing = await prisma.scheduleParticipant.findUnique({
    where: { id: params.id },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Participant not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Participant brand cannot be reassigned");
  if (existing.partnerProfileId) {
    throw new Error("Partner-linked participants are managed from the partner account and cannot be edited here");
  }

  const displayName = normalizeText(params.input.displayName ?? existing.displayName);
  if (!displayName) throw new Error("Participant display name is required");

  const updated = await prisma.scheduleParticipant.update({
    where: { id: existing.id },
    data: {
      displayName,
      slug:
        params.input.slug !== undefined || displayName !== existing.displayName
          ? await buildUniqueParticipantSlug(prisma, brandId, normalizeText(params.input.slug) || displayName, existing.id)
          : existing.slug,
      type: params.input.type === undefined ? existing.type : parseParticipantType(params.input.type),
      status: params.input.status === undefined ? existing.status : parseParticipantStatus(params.input.status),
      summary: params.input.summary === undefined ? existing.summary : normalizeNullableText(params.input.summary),
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
    },
  });

  return toParticipantRecord(updated as ParticipantWithBrand);
}

export async function upsertApprovedPartnerScheduleParticipant(params: {
  db?: Prisma.TransactionClient;
  input?: never;
  brandId: string;
  partnerProfileId: string;
  scheduleParticipantId?: string | null;
  displayName: string;
  slug?: string | null;
  type: UpsertApprovedPartnerScheduleParticipantInput["type"];
  status: UpsertApprovedPartnerScheduleParticipantInput["status"];
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const db = params.db ?? prisma;
  const brandId = normalizeText(params.brandId);
  const partnerProfileId = normalizeText(params.partnerProfileId);
  if (!brandId) throw new Error("Partner participant brand is required");
  if (!partnerProfileId) throw new Error("Partner profile linkage is required");

  const displayName = normalizeText(params.displayName);
  if (!displayName) throw new Error("Participant display name is required");
  const requestedScheduleParticipantId = normalizeNullableId(params.scheduleParticipantId);
  const linked = await db.scheduleParticipant.findUnique({
    where: { partnerProfileId },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });

  if (linked && linked.brandId !== brandId) {
    throw new Error("Partner-linked participant brand cannot be reassigned");
  }

  if (linked && requestedScheduleParticipantId && linked.id !== requestedScheduleParticipantId) {
    throw new Error("This partner is already linked to a different schedulable participant");
  }

  const slugInput = normalizeText(params.slug) || displayName;
  const updateParticipant = async (participant: {
    id: string;
    brandId: string;
    slug: string;
    source: ScheduleParticipantSource;
  }) => {
    const resolvedSlug =
      participant.slug === slugInput
        ? participant.slug
        : await buildUniqueParticipantSlug(db, brandId, slugInput, participant.id);

    const updated = await db.scheduleParticipant.update({
      where: { id: participant.id },
      data: {
        partnerProfileId,
        displayName,
        slug: resolvedSlug,
        type: params.type,
        status: params.status,
        summary: normalizeNullableText(params.summary),
        source: participant.source,
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
      include: {
        brand: {
          select: {
            id: true,
            brandKey: true,
            name: true,
          },
        },
      },
    });

    return toParticipantRecord(updated as ParticipantWithBrand);
  };

  if (linked) {
    return updateParticipant({
      id: linked.id,
      brandId: linked.brandId,
      slug: linked.slug,
      source: linked.source,
    });
  }

  let participantToAdopt:
    | {
        id: string;
        brandId: string;
        slug: string;
        source: ScheduleParticipantSource;
        type: UpsertApprovedPartnerScheduleParticipantInput["type"];
        partnerProfileId: string | null;
      }
    | null = null;

  if (requestedScheduleParticipantId) {
    const requested = await db.scheduleParticipant.findUnique({
      where: { id: requestedScheduleParticipantId },
      select: {
        id: true,
        brandId: true,
        slug: true,
        source: true,
        type: true,
        partnerProfileId: true,
      },
    });
    if (!requested) throw new Error("Selected schedulable participant was not found");
    if (requested.brandId !== brandId) {
      throw new Error("Selected schedulable participant belongs to a different brand");
    }
    if (requested.type !== params.type) {
      throw new Error("Selected schedulable participant must match the participant type before it can be linked");
    }
    if (requested.partnerProfileId && requested.partnerProfileId !== partnerProfileId) {
      throw new Error("Selected schedulable participant is already linked to a different partner");
    }
    participantToAdopt = requested;
  } else {
    const candidates = await listScheduleParticipantAdoptionCandidates({
      db,
      brandId,
      type: params.type,
      displayName,
      slug: params.slug,
    });
    const autoCandidate = resolveAutoAdoptionCandidate(candidates);
    if (autoCandidate) {
      participantToAdopt = {
        id: autoCandidate.id,
        brandId: autoCandidate.brandId,
        slug: autoCandidate.slug,
        source: autoCandidate.source,
        type: autoCandidate.type,
        partnerProfileId: autoCandidate.partnerProfileId,
      };
    }
  }

  if (participantToAdopt) {
    return updateParticipant(participantToAdopt);
  }

  const created = await db.scheduleParticipant.create({
    data: {
      brandId,
      partnerProfileId,
      displayName,
      slug: await buildUniqueParticipantSlug(db, brandId, slugInput),
      type: params.type,
      status: params.status,
      summary: normalizeNullableText(params.summary),
      source: ScheduleParticipantSource.PARTNER_APPROVED,
      metadata: params.metadata,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });

  return toParticipantRecord(created as ParticipantWithBrand);
}

export async function deleteScheduleParticipant(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.scheduleParticipant.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true, partnerProfileId: true },
  });
  if (!existing) throw new Error("Participant not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Participant brand cannot be reassigned");
  if (existing.partnerProfileId) {
    throw new Error("Partner-linked participants cannot be deleted from the scheduling participants page");
  }

  const assignmentCount = await prisma.scheduleAssignment.count({
    where: {
      scheduleParticipantId: existing.id,
      status: { not: "CANCELLED" },
    },
  });
  if (assignmentCount > 0) {
    throw new Error("Cannot delete a participant that still has schedule assignments");
  }

  await prisma.scheduleParticipant.delete({
    where: { id: existing.id },
  });
}
