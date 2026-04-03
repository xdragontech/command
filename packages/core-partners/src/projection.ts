import { Prisma, ScheduleParticipantSource } from "@prisma/client";
import { prisma } from "@command/core-db";
import type { ScheduleParticipantRecord } from "@command/core-scheduling";

type ProjectionClient = Prisma.TransactionClient | typeof prisma;

type BrandRecord = {
  id: string;
  brandKey: string;
  name: string;
};

type ParticipantWithBrand = {
  id: string;
  brandId: string;
  displayName: string;
  slug: string;
  type: ScheduleParticipantRecord["type"];
  status: ScheduleParticipantRecord["status"];
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  brand: BrandRecord;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
  const next = normalizeText(value);
  return next ? next : null;
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    summary: participant.summary,
    createdAt: participant.createdAt.toISOString(),
    updatedAt: participant.updatedAt.toISOString(),
  };
}

async function buildUniqueParticipantSlug(db: ProjectionClient, brandId: string, preferred: string, excludeId?: string) {
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

export async function upsertPartnerScheduleParticipantProjection(params: {
  db?: ProjectionClient;
  brandId: string;
  partnerProfileId: string;
  displayName: string;
  slug?: string | null;
  type: ScheduleParticipantRecord["type"];
  status: ScheduleParticipantRecord["status"];
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

  const existing = await db.scheduleParticipant.findUnique({
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

  if (existing && existing.brandId !== brandId) {
    throw new Error("Partner-linked participant brand cannot be reassigned");
  }

  const slugInput = normalizeText(params.slug) || displayName;
  const resolvedSlug = existing
    ? existing.slug === slugInput
      ? existing.slug
      : await buildUniqueParticipantSlug(db, brandId, slugInput, existing.id)
    : await buildUniqueParticipantSlug(db, brandId, slugInput);

  if (existing) {
    const updated = await db.scheduleParticipant.update({
      where: { id: existing.id },
      data: {
        displayName,
        slug: resolvedSlug,
        type: params.type,
        status: params.status,
        summary: normalizeNullableText(params.summary),
        source: ScheduleParticipantSource.PARTNER_APPROVED,
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
  }

  const created = await db.scheduleParticipant.create({
    data: {
      brandId,
      partnerProfileId,
      displayName,
      slug: resolvedSlug,
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
