import { Prisma } from "@prisma/client";
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
  ScheduleParticipantRecord,
  SchedulingScope,
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
    displayName: participant.displayName,
    slug: participant.slug,
    type: participant.type,
    status: participant.status,
    summary: participant.summary || null,
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
  };
}

async function buildUniqueParticipantSlug(brandId: string, preferred: string, excludeId?: string) {
  const base = slugify(preferred) || "participant";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.scheduleParticipant.findFirst({
      where: { brandId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${index}`;
  }

  throw new Error("Unable to allocate a unique participant slug");
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
      slug: await buildUniqueParticipantSlug(brandId, normalizeText(params.input.slug) || displayName),
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

  const displayName = normalizeText(params.input.displayName ?? existing.displayName);
  if (!displayName) throw new Error("Participant display name is required");

  const updated = await prisma.scheduleParticipant.update({
    where: { id: existing.id },
    data: {
      displayName,
      slug:
        params.input.slug !== undefined || displayName !== existing.displayName
          ? await buildUniqueParticipantSlug(brandId, normalizeText(params.input.slug) || displayName, existing.id)
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

export async function deleteScheduleParticipant(params: {
  scope: SchedulingScope;
  id: string;
}) {
  const existing = await prisma.scheduleParticipant.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Participant not found");

  const brandId = resolveWriteBrandId(params.scope, existing.brandId, { allowSingleBrandFallback: false });
  if (brandId !== existing.brandId) throw new Error("Participant brand cannot be reassigned");

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
