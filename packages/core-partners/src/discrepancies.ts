import { ParticipantRequirementReviewerState, ParticipantRequirementType, Prisma, ScheduleParticipantType } from "@prisma/client";
import { prisma } from "@command/core-db";
import { normalizeNullableId, normalizeText, resolveReadableBrandIds } from "./common";
import type { PartnerAdminScope, PartnerDiscrepancyRecord, PartnerDiscrepancyState } from "./types";

type ApprovedApplicationWithRequirements = Prisma.PartnerApplicationGetPayload<{
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
            email: true;
          };
        };
        participantProfile: {
          include: {
            requirements: {
              include: {
                asset: {
                  select: {
                    id: true;
                    fileName: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

function requiredRequirementTypesForParticipantType(type: ScheduleParticipantType) {
  if (type === ScheduleParticipantType.FOOD_VENDOR) {
    return [
      ParticipantRequirementType.BUSINESS_LICENSE,
      ParticipantRequirementType.HEALTH_PERMIT,
      ParticipantRequirementType.BUSINESS_INSURANCE,
      ParticipantRequirementType.FIRE_PERMIT,
    ];
  }

  if (type === ScheduleParticipantType.MARKET_VENDOR) {
    return [ParticipantRequirementType.BUSINESS_LICENSE];
  }

  return [] as ParticipantRequirementType[];
}

function resolveDiscrepancyState(input: {
  reviewerState: ParticipantRequirementReviewerState | null;
  expiresAt: Date | null;
}): PartnerDiscrepancyState | null {
  if (!input.reviewerState) return "MISSING";
  if (input.reviewerState === ParticipantRequirementReviewerState.PENDING_REVIEW) return "PENDING_REVIEW";
  if (input.reviewerState === ParticipantRequirementReviewerState.REJECTED) return "REJECTED";
  if (input.reviewerState === ParticipantRequirementReviewerState.EXPIRED) return "EXPIRED";
  if (input.reviewerState === ParticipantRequirementReviewerState.APPROVED && input.expiresAt && input.expiresAt.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return null;
}

export async function listPartnerDiscrepancies(params: {
  scope: PartnerAdminScope;
  brandId?: string | null;
  eventSeriesId?: string | null;
  participantType?: string | null;
  requirementType?: string | null;
  state?: string | null;
  q?: string;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as PartnerDiscrepancyRecord[];

  const q = normalizeText(params.q);
  const eventSeriesId = normalizeNullableId(params.eventSeriesId);
  const requestedParticipantType = normalizeText(params.participantType || "");
  const requestedRequirementType = normalizeText(params.requirementType || "");
  const requestedState = normalizeText(params.state || "");

  const filters: Prisma.PartnerApplicationWhereInput[] = [
    { applicationKind: "PARTICIPANT" },
    { status: "APPROVED" },
    ...(brandIds === null ? [] : [{ brandId: { in: brandIds } }]),
  ];

  if (eventSeriesId) {
    filters.push({ scheduleEventSeriesId: eventSeriesId });
  }

  if (requestedParticipantType && requestedParticipantType !== "ALL") {
    filters.push({ profile: { is: { participantProfile: { is: { participantType: requestedParticipantType as ScheduleParticipantType } } } } });
  }

  if (q) {
    filters.push({
      OR: [
        { profile: { is: { displayName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        { profile: { is: { user: { is: { email: { contains: q, mode: Prisma.QueryMode.insensitive } } } } } },
        { eventSeries: { is: { name: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
      ],
    });
  }

  const applications = await prisma.partnerApplication.findMany({
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
              email: true,
            },
          },
          participantProfile: {
            include: {
              requirements: {
                include: {
                  asset: {
                    select: {
                      id: true,
                      fileName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const aggregated = new Map<string, PartnerDiscrepancyRecord>();

  for (const application of applications as ApprovedApplicationWithRequirements[]) {
    const participantProfile = application.profile.participantProfile;
    if (!participantProfile) continue;

    const requiredTypes = requiredRequirementTypesForParticipantType(participantProfile.participantType);
    for (const requirementType of requiredTypes) {
      if (requestedRequirementType && requestedRequirementType !== "ALL" && requestedRequirementType !== requirementType) {
        continue;
      }

      const requirement = participantProfile.requirements.find((entry) => entry.requirementType === requirementType) || null;
      const state = resolveDiscrepancyState({
        reviewerState: requirement?.reviewerState || null,
        expiresAt: requirement?.expiresAt || null,
      });
      if (!state) continue;
      if (requestedState && requestedState !== "ALL" && requestedState !== state) continue;

      const key = `${application.partnerProfileId}:${requirementType}`;
      const existing = aggregated.get(key);
      if (existing) {
        if (!existing.eventSeriesIds.includes(application.scheduleEventSeriesId)) {
          existing.eventSeriesIds.push(application.scheduleEventSeriesId);
          existing.eventSeriesNames.push(application.eventSeries.name);
        }
        continue;
      }

      aggregated.set(key, {
        partnerProfileId: application.partnerProfileId,
        brandId: application.brandId,
        brandKey: application.brand.brandKey,
        brandName: application.brand.name,
        partnerDisplayName: application.profile.displayName,
        partnerEmail: application.profile.user.email,
        participantType: participantProfile.participantType,
        requirementType,
        state,
        reviewerState: requirement?.reviewerState || null,
        expiresAt: requirement?.expiresAt ? requirement.expiresAt.toISOString() : null,
        assetId: requirement?.asset?.id || null,
        assetFileName: requirement?.asset?.fileName || null,
        eventSeriesIds: [application.scheduleEventSeriesId],
        eventSeriesNames: [application.eventSeries.name],
      });
    }
  }

  return Array.from(aggregated.values()).sort((a, b) => {
    if (a.partnerDisplayName !== b.partnerDisplayName) return a.partnerDisplayName.localeCompare(b.partnerDisplayName);
    return a.requirementType.localeCompare(b.requirementType);
  });
}
