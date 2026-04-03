import { PartnerKind, PartnerUserStatus, Prisma, ScheduleParticipantStatus } from "@prisma/client";
import { prisma } from "@command/core-db";
import { emptyApplicationCounts, normalizeNullableId, normalizeText, resolveReadableBrandIds, toIsoString } from "./common";
import { upsertPartnerScheduleParticipantProjection } from "./projection";
import type { PartnerAccountRecord, PartnerAdminScope } from "./types";

type PartnerProfileWithRelations = Prisma.PartnerProfileGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    user: {
      select: {
        id: true;
        email: true;
        kind: true;
        status: true;
        emailVerified: true;
        createdAt: true;
        updatedAt: true;
        lastLoginAt: true;
      };
    };
    participantProfile: true;
    sponsorProfile: {
      include: {
        eventAssignments: {
          include: {
            eventSeries: {
              select: {
                id: true;
                name: true;
              };
            };
            tier: {
              select: {
                id: true;
                name: true;
              };
            };
          };
          orderBy: [
            {
              eventSeries: {
                name: "asc";
              };
            },
          ];
        };
      };
    };
    scheduleParticipant: {
      select: {
        id: true;
        status: true;
        source: true;
      };
    };
    applications: {
      include: {
        eventSeries: {
          select: {
            id: true;
            name: true;
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

function toPartnerAccountRecord(profile: PartnerProfileWithRelations): PartnerAccountRecord {
  const applicationCounts = emptyApplicationCounts();
  const approvedEventNames = new Set<string>();

  for (const application of profile.applications) {
    if (application.status === "DRAFT") applicationCounts.draft += 1;
    if (application.status === "SUBMITTED") applicationCounts.submitted += 1;
    if (application.status === "IN_REVIEW") applicationCounts.inReview += 1;
    if (application.status === "APPROVED") {
      applicationCounts.approved += 1;
      approvedEventNames.add(application.eventSeries.name);
    }
    if (application.status === "REJECTED") applicationCounts.rejected += 1;
    if (application.status === "WITHDRAWN") applicationCounts.withdrawn += 1;
  }

  return {
    id: profile.id,
    brandId: profile.brandId,
    brandKey: profile.brand.brandKey,
    brandName: profile.brand.name,
    partnerUserId: profile.partnerUserId,
    kind: profile.user.kind,
    email: profile.user.email,
    userStatus: profile.user.status,
    emailVerifiedAt: toIsoString(profile.user.emailVerified),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    lastLoginAt: toIsoString(profile.user.lastLoginAt),
    displayName: profile.displayName,
    slug: profile.slug,
    contactName: profile.contactName,
    contactPhone: profile.contactPhone,
    summary: profile.summary,
    description: profile.description,
    mainWebsiteUrl: profile.mainWebsiteUrl,
    participantType: profile.participantProfile?.participantType || null,
    sponsorProductServiceType: profile.sponsorProfile?.productServiceType || null,
    sponsorType: profile.sponsorProfile?.sponsorType || null,
    linkedScheduleParticipant: profile.scheduleParticipant
      ? {
          id: profile.scheduleParticipant.id,
          status: profile.scheduleParticipant.status,
          source: profile.scheduleParticipant.source,
        }
      : null,
    applicationCounts,
    approvedEventNames: Array.from(approvedEventNames),
    sponsorAssignments:
      profile.sponsorProfile?.eventAssignments.map((assignment) => ({
        id: assignment.id,
        eventSeriesId: assignment.scheduleEventSeriesId,
        eventName: assignment.eventSeries.name,
        sponsorTierId: assignment.sponsorTierId,
        sponsorTierName: assignment.tier?.name || null,
      })) || [],
  };
}

export async function listPartnerAccounts(params: {
  scope: PartnerAdminScope;
  kind: PartnerKind;
  brandId?: string | null;
  q?: string;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as PartnerAccountRecord[];

  const q = normalizeText(params.q);
  const filters: Prisma.PartnerProfileWhereInput[] = [
    ...(brandIds === null ? [] : [{ brandId: { in: brandIds } }]),
    { user: { is: { kind: params.kind } } },
    params.kind === PartnerKind.PARTICIPANT ? { participantProfile: { isNot: null } } : { sponsorProfile: { isNot: null } },
  ];

  if (q) {
    filters.push({
      OR: [
        { displayName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { slug: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { contactName: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { contactPhone: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { summary: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { user: { is: { email: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
      ],
    });
  }

  const rows = await prisma.partnerProfile.findMany({
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
      user: {
        select: {
          id: true,
          email: true,
          kind: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      },
      participantProfile: true,
      sponsorProfile: {
        include: {
          eventAssignments: {
            include: {
              eventSeries: {
                select: {
                  id: true,
                  name: true,
                },
              },
              tier: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: [
              {
                eventSeries: {
                  name: "asc",
                },
              },
            ],
          },
        },
      },
      scheduleParticipant: {
        select: {
          id: true,
          status: true,
          source: true,
        },
      },
      applications: {
        include: {
          eventSeries: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [{ displayName: "asc" }],
  });

  return rows.map((row) => toPartnerAccountRecord(row as PartnerProfileWithRelations));
}

export async function updatePartnerAccountStatus(params: {
  scope: PartnerAdminScope;
  partnerProfileId: string;
  status: PartnerUserStatus;
}) {
  const existing = await prisma.partnerProfile.findUnique({
    where: { id: params.partnerProfileId },
    include: {
      user: {
        select: {
          id: true,
          status: true,
        },
      },
      participantProfile: true,
      applications: {
        where: {
          status: "APPROVED",
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!existing) throw new Error("Partner account not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Partner account is not available for this backoffice user");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.partnerUser.update({
      where: { id: existing.partnerUserId },
      data: {
        status: params.status,
      },
    });

    if (existing.participantProfile && existing.applications.length > 0) {
      await upsertPartnerScheduleParticipantProjection({
        db: tx,
        brandId: existing.brandId,
        partnerProfileId: existing.id,
        displayName: existing.displayName,
        slug: existing.slug,
        type: existing.participantProfile.participantType,
        status: params.status === PartnerUserStatus.ACTIVE ? ScheduleParticipantStatus.ACTIVE : ScheduleParticipantStatus.INACTIVE,
        summary: existing.summary,
      });
    }

    return tx.partnerProfile.findUnique({
      where: { id: existing.id },
      include: {
        brand: {
          select: {
            id: true,
            brandKey: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            kind: true,
            status: true,
            emailVerified: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
          },
        },
        participantProfile: true,
        sponsorProfile: {
          include: {
            eventAssignments: {
              include: {
                eventSeries: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                tier: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        scheduleParticipant: {
          select: {
            id: true,
            status: true,
            source: true,
          },
        },
        applications: {
          include: {
            eventSeries: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  });

  if (!updated) throw new Error("Partner account not found after update");
  return toPartnerAccountRecord(updated as PartnerProfileWithRelations);
}
