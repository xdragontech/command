import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  parseParticipantStatus,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  slugify,
} from "./common";
import type { CreateScheduleParticipantInput, ScheduleParticipantRecord, SchedulingScope } from "./types";

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

async function buildUniqueParticipantSlug(brandId: string, preferred: string) {
  const base = slugify(preferred) || "participant";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await prisma.scheduleParticipant.findFirst({
      where: { brandId, slug },
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
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as ScheduleParticipantRecord[];

  const q = normalizeText(params.q);
  const where: Prisma.ScheduleParticipantWhereInput = brandIds === null ? {} : { brandId: { in: brandIds } };
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
      type: params.input.type,
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
