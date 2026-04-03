import { PartnerKind, PartnerUserStatus, Prisma, ScheduleParticipantStatus } from "@prisma/client";
import { prisma } from "@command/core-db";
import { normalizeNullableId, normalizeNullableText, normalizeText, resolveReadableBrandIds, toIsoString } from "./common";
import { upsertPartnerScheduleParticipantProjection } from "./projection";
import type { PartnerAdminScope, PartnerApplicationRecord } from "./types";

type PartnerApplicationWithRelations = Prisma.PartnerApplicationGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    eventSeries: {
      select: {
        id: true;
        name: true;
      };
    };
    profile: {
      include: {
        user: {
          select: {
            id: true;
            email: true;
            status: true;
          };
        };
        participantProfile: true;
        sponsorProfile: true;
      };
    };
    reviews: {
      include: {
        reviewer: {
          select: {
            id: true;
            username: true;
            email: true;
          };
        };
      };
      orderBy: [
        {
          createdAt: "desc";
        },
      ];
    };
  };
}>;

function toPartnerApplicationRecord(application: PartnerApplicationWithRelations): PartnerApplicationRecord {
  return {
    id: application.id,
    brandId: application.brandId,
    brandKey: application.brand.brandKey,
    brandName: application.brand.name,
    partnerProfileId: application.partnerProfileId,
    partnerUserId: application.profile.partnerUserId,
    applicationKind: application.applicationKind,
    status: application.status,
    submittedAt: toIsoString(application.submittedAt),
    approvedAt: toIsoString(application.approvedAt),
    rejectedAt: toIsoString(application.rejectedAt),
    withdrawnAt: toIsoString(application.withdrawnAt),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    eventSeriesId: application.scheduleEventSeriesId,
    eventSeriesName: application.eventSeries.name,
    partnerEmail: application.profile.user.email,
    partnerDisplayName: application.profile.displayName,
    partnerContactName: application.profile.contactName,
    partnerContactPhone: application.profile.contactPhone,
    participantType: application.profile.participantProfile?.participantType || null,
    sponsorProductServiceType: application.profile.sponsorProfile?.productServiceType || null,
    sponsorType: application.profile.sponsorProfile?.sponsorType || null,
    submittedProfileSnapshot: application.submittedProfileSnapshot,
    reviews: application.reviews.map((review) => ({
      id: review.id,
      decision: review.decision,
      notes: review.notes,
      reviewerUserId: review.reviewerUserId,
      reviewerDisplayName: review.reviewer?.username || review.reviewer?.email || null,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}

export async function listPartnerApplications(params: {
  scope: PartnerAdminScope;
  brandId?: string | null;
  eventSeriesId?: string | null;
  kind?: string | null;
  status?: string | null;
  pendingOnly?: boolean;
  q?: string;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as PartnerApplicationRecord[];

  const q = normalizeText(params.q);
  const eventSeriesId = normalizeNullableId(params.eventSeriesId);
  const filters: Prisma.PartnerApplicationWhereInput[] = [...(brandIds === null ? [] : [{ brandId: { in: brandIds } }])];

  if (eventSeriesId) {
    filters.push({ scheduleEventSeriesId: eventSeriesId });
  }

  if (params.pendingOnly) {
    filters.push({ status: { in: ["SUBMITTED", "IN_REVIEW"] } });
  } else if (normalizeNullableText(params.status)) {
    const requestedStatus = normalizeText(params.status);
    if (requestedStatus !== "ALL") {
      filters.push({ status: requestedStatus as any });
    }
  }

  if (normalizeNullableText(params.kind)) {
    const requestedKind = normalizeText(params.kind);
    if (requestedKind !== "ALL") {
      filters.push({ applicationKind: requestedKind as PartnerKind });
    }
  }

  if (q) {
    filters.push({
      OR: [
        { profile: { is: { displayName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        { profile: { is: { contactName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        { profile: { is: { user: { is: { email: { contains: q, mode: Prisma.QueryMode.insensitive } } } } } },
        { eventSeries: { is: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
      ],
    });
  }

  const rows = await prisma.partnerApplication.findMany({
    where: {
      AND: filters,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      eventSeries: {
        select: {
          id: true,
          name: true,
        },
      },
      profile: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              status: true,
            },
          },
          participantProfile: true,
          sponsorProfile: true,
        },
      },
      reviews: {
        include: {
          reviewer: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((row) => toPartnerApplicationRecord(row as PartnerApplicationWithRelations));
}

export async function reviewPartnerApplication(params: {
  scope: PartnerAdminScope;
  partnerApplicationId: string;
  reviewerUserId: string;
  decision: "MARK_IN_REVIEW" | "APPROVE" | "REJECT" | "NOTE";
  notes?: string | null;
}) {
  const existing = await prisma.partnerApplication.findUnique({
    where: { id: params.partnerApplicationId },
    include: {
      profile: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              status: true,
            },
          },
          participantProfile: true,
          sponsorProfile: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Partner application not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Partner application is not available for this backoffice user");
  }

  if (existing.status === "WITHDRAWN" && params.decision !== "NOTE") {
    throw new Error("Withdrawn applications cannot be reviewed");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.partnerApplicationReview.create({
      data: {
        partnerApplicationId: existing.id,
        reviewerUserId: params.reviewerUserId,
        decision: params.decision,
        notes: normalizeNullableText(params.notes),
      },
    });

    const nextStatus =
      params.decision === "MARK_IN_REVIEW"
        ? "IN_REVIEW"
        : params.decision === "APPROVE"
          ? "APPROVED"
          : params.decision === "REJECT"
            ? "REJECTED"
            : existing.status;

    await tx.partnerApplication.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        submittedAt: existing.submittedAt || (params.decision !== "NOTE" ? now : existing.submittedAt),
        approvedAt: params.decision === "APPROVE" ? now : params.decision === "REJECT" ? null : existing.approvedAt,
        rejectedAt: params.decision === "REJECT" ? now : params.decision === "APPROVE" ? null : existing.rejectedAt,
      },
    });

    if (params.decision === "APPROVE" && existing.applicationKind === PartnerKind.PARTICIPANT) {
      if (!existing.profile.participantProfile) {
        throw new Error("Participant application is missing participant profile details");
      }

      await upsertPartnerScheduleParticipantProjection({
        db: tx,
        brandId: existing.brandId,
        partnerProfileId: existing.partnerProfileId,
        displayName: existing.profile.displayName,
        slug: existing.profile.slug,
        type: existing.profile.participantProfile.participantType,
        status:
          existing.profile.user.status === PartnerUserStatus.ACTIVE
            ? ScheduleParticipantStatus.ACTIVE
            : ScheduleParticipantStatus.INACTIVE,
        summary: existing.profile.summary,
      });
    }

    return tx.partnerApplication.findUnique({
      where: { id: existing.id },
      include: {
        brand: {
          select: {
            id: true,
            brandKey: true,
            name: true,
          },
        },
        eventSeries: {
          select: {
            id: true,
            name: true,
          },
        },
        profile: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                status: true,
              },
            },
            participantProfile: true,
            sponsorProfile: true,
          },
        },
        reviews: {
          include: {
            reviewer: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });
  });

  if (!updated) throw new Error("Partner application not found after review");
  return toPartnerApplicationRecord(updated as PartnerApplicationWithRelations);
}
