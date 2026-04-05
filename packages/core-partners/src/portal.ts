import {
  PartnerApplicationStatus,
  PartnerKind,
  PartnerSponsorType,
  PartnerUserStatus,
  Prisma,
  ScheduleEventSeriesStatus,
  ScheduleParticipantStatus,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import { normalizeNullableText, normalizeText, toIsoString } from "./common";
import { upsertPartnerScheduleParticipantProjection } from "./projection";
import type {
  PartnerPortalAccountRecord,
  PartnerPortalApplicationRecord,
  PartnerPortalApplicationsPayload,
  PartnerPortalEventOption,
  PartnerPortalProfileRecord,
} from "./types";

export class PartnerPortalServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PartnerPortalServiceError";
    this.status = status;
  }
}

type PortalProfileRecord = Prisma.PartnerProfileGetPayload<{
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
          passwordChangeRequiredAt: true;
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
                slug: true;
                name: true;
                seasonStartsOn: true;
                seasonEndsOn: true;
              };
            };
          };
        };
      };
    };
    applications: {
      include: {
        eventSeries: {
          select: {
            id: true;
            slug: true;
            name: true;
            seasonStartsOn: true;
            seasonEndsOn: true;
          };
        };
      };
    };
  };
}>;

function normalizeNullableUrl(value: unknown, label: string) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
    return parsed.toString();
  } catch {
    throw new PartnerPortalServiceError(422, `${label} must be a valid URL`);
  }
}

function normalizeSocialLinks(value: unknown) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new PartnerPortalServiceError(422, "Social links must be an object");
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, rawValue]) => [normalizeText(key), normalizeNullableUrl(rawValue, `${key || "Social"} URL`)] as const)
    .filter(([key, url]) => key && url);

  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

function toPortalAccountRecord(profile: PortalProfileRecord): PartnerPortalAccountRecord {
  return {
    id: profile.user.id,
    partnerProfileId: profile.id,
    brandId: profile.brandId,
    brandKey: profile.brand.brandKey,
    brandName: profile.brand.name,
    email: profile.user.email,
    kind: profile.user.kind,
    status: profile.user.status,
    emailVerifiedAt: toIsoString(profile.user.emailVerified),
    createdAt: profile.user.createdAt.toISOString(),
    updatedAt: profile.user.updatedAt.toISOString(),
    lastLoginAt: toIsoString(profile.user.lastLoginAt),
    passwordChangeRequired: Boolean(profile.user.passwordChangeRequiredAt),
    displayName: profile.displayName,
    slug: profile.slug,
  };
}

function toPortalEventOption(event: {
  id: string;
  slug: string;
  name: string;
  seasonStartsOn: Date;
  seasonEndsOn: Date;
}): PartnerPortalEventOption {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    seasonStartsOn: event.seasonStartsOn.toISOString(),
    seasonEndsOn: event.seasonEndsOn.toISOString(),
  };
}

function toPortalApplicationRecord(application: PortalProfileRecord["applications"][number]): PartnerPortalApplicationRecord {
  return {
    id: application.id,
    status: application.status,
    submittedAt: toIsoString(application.submittedAt),
    approvedAt: toIsoString(application.approvedAt),
    rejectedAt: toIsoString(application.rejectedAt),
    withdrawnAt: toIsoString(application.withdrawnAt),
    event: toPortalEventOption(application.eventSeries),
  };
}

function toPortalProfileRecord(profile: PortalProfileRecord): PartnerPortalProfileRecord {
  const account = toPortalAccountRecord(profile);
  if (profile.user.kind === PartnerKind.SPONSOR) {
    if (!profile.sponsorProfile) {
      throw new PartnerPortalServiceError(500, "Sponsor profile details are missing");
    }

    return {
      kind: PartnerKind.SPONSOR,
      account,
      contactName: profile.contactName,
      contactPhone: profile.contactPhone,
      displayName: profile.displayName,
      slug: profile.slug,
      description: profile.description,
      mainWebsiteUrl: profile.mainWebsiteUrl,
      socialLinks: (profile.socialLinks as Record<string, string> | null) || null,
      profileCompletedAt: toIsoString(profile.profileCompletedAt),
      productServiceType: profile.sponsorProfile.productServiceType,
      audienceProfile: profile.sponsorProfile.audienceProfile,
      marketingGoals: profile.sponsorProfile.marketingGoals,
      onsitePlacement: profile.sponsorProfile.onsitePlacement,
      signageInformation: profile.sponsorProfile.signageInformation,
      staffed: profile.sponsorProfile.staffed,
      sponsorType: profile.sponsorProfile.sponsorType as PartnerSponsorType | null,
      requests: profile.sponsorProfile.requests,
    };
  }

  if (!profile.participantProfile) {
    throw new PartnerPortalServiceError(500, "Participant profile details are missing");
  }

  return {
    kind: PartnerKind.PARTICIPANT,
    account,
    contactName: profile.contactName,
    contactPhone: profile.contactPhone,
    displayName: profile.displayName,
    slug: profile.slug,
    summary: profile.summary,
    description: profile.description,
    mainWebsiteUrl: profile.mainWebsiteUrl,
    socialLinks: (profile.socialLinks as Record<string, string> | null) || null,
    profileCompletedAt: toIsoString(profile.profileCompletedAt),
    participantType: profile.participantProfile.participantType,
    entertainmentType: profile.participantProfile.entertainmentType,
    entertainmentStyle: profile.participantProfile.entertainmentStyle,
    foodStyle: profile.participantProfile.foodStyle,
    foodSetupType: profile.participantProfile.foodSetupType,
    marketType: profile.participantProfile.marketType,
    specialRequirements: profile.participantProfile.specialRequirements,
  };
}

async function requirePortalProfile(params: {
  partnerUserId: string;
  expectedKind: PartnerKind;
}) {
  const profile = await prisma.partnerProfile.findFirst({
    where: {
      partnerUserId: params.partnerUserId,
      user: {
        kind: params.expectedKind,
      },
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
          passwordChangeRequiredAt: true,
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
                  slug: true,
                  name: true,
                  seasonStartsOn: true,
                  seasonEndsOn: true,
                },
              },
            },
            orderBy: [
              {
                eventSeries: {
                  seasonStartsOn: "asc",
                },
              },
              {
                eventSeries: {
                  name: "asc",
                },
              },
            ],
          },
        },
      },
      applications: {
        include: {
          eventSeries: {
            select: {
              id: true,
              slug: true,
              name: true,
              seasonStartsOn: true,
              seasonEndsOn: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      },
    },
  });

  if (!profile) {
    throw new PartnerPortalServiceError(404, "Partner profile not found");
  }

  return profile as PortalProfileRecord;
}

async function listActiveBrandEvents(brandId: string) {
  const rows = await prisma.scheduleEventSeries.findMany({
    where: {
      brandId,
      status: ScheduleEventSeriesStatus.ACTIVE,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      seasonStartsOn: true,
      seasonEndsOn: true,
    },
    orderBy: [
      { seasonStartsOn: "asc" },
      { name: "asc" },
    ],
  });

  return rows.map((row) => toPortalEventOption(row));
}

function buildSubmittedProfileSnapshot(profile: PortalProfileRecord) {
  const base = {
    partnerProfileId: profile.id,
    partnerUserId: profile.partnerUserId,
    kind: profile.user.kind,
    displayName: profile.displayName,
    slug: profile.slug,
    contactName: profile.contactName,
    contactPhone: profile.contactPhone,
    summary: profile.summary,
    description: profile.description,
    mainWebsiteUrl: profile.mainWebsiteUrl,
    socialLinks: profile.socialLinks,
  };

  if (profile.user.kind === PartnerKind.SPONSOR) {
    return {
      ...base,
      sponsor: {
        productServiceType: profile.sponsorProfile?.productServiceType || null,
        audienceProfile: profile.sponsorProfile?.audienceProfile || null,
        marketingGoals: profile.sponsorProfile?.marketingGoals || null,
        onsitePlacement: profile.sponsorProfile?.onsitePlacement || null,
        signageInformation: profile.sponsorProfile?.signageInformation || null,
        staffed: profile.sponsorProfile?.staffed ?? null,
        sponsorType: profile.sponsorProfile?.sponsorType || null,
        requests: profile.sponsorProfile?.requests || null,
      },
    };
  }

  return {
    ...base,
    participant: {
      participantType: profile.participantProfile?.participantType || null,
      entertainmentType: profile.participantProfile?.entertainmentType || null,
      entertainmentStyle: profile.participantProfile?.entertainmentStyle || null,
      foodStyle: profile.participantProfile?.foodStyle || null,
      foodSetupType: profile.participantProfile?.foodSetupType || null,
      marketType: profile.participantProfile?.marketType || null,
      specialRequirements: profile.participantProfile?.specialRequirements || null,
    },
  };
}

export async function getPartnerPortalProfile(params: {
  partnerUserId: string;
  expectedKind: PartnerKind;
}) {
  const profile = await requirePortalProfile(params);
  return toPortalProfileRecord(profile);
}

export async function updatePartnerPortalProfile(params: {
  partnerUserId: string;
  expectedKind: PartnerKind;
  input: Record<string, unknown>;
}) {
  const existing = await requirePortalProfile(params);
  const displayName = normalizeText(params.input.displayName) || existing.displayName;
  const contactName = normalizeText(params.input.contactName) || existing.contactName;
  const contactPhone = normalizeText(params.input.contactPhone) || existing.contactPhone;

  if (!displayName) throw new PartnerPortalServiceError(422, "Display name is required");
  if (!contactName) throw new PartnerPortalServiceError(422, "Contact name is required");
  if (!contactPhone) throw new PartnerPortalServiceError(422, "Contact phone is required");

  const mainWebsiteUrl =
    params.input.mainWebsiteUrl !== undefined
      ? normalizeNullableUrl(params.input.mainWebsiteUrl, "Main website URL")
      : existing.mainWebsiteUrl;
  const socialLinks =
    params.input.socialLinks !== undefined
      ? normalizeSocialLinks(params.input.socialLinks)
      : ((existing.socialLinks as Record<string, string> | null) || null);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.partnerProfile.update({
      where: { id: existing.id },
      data: {
        displayName,
        contactName,
        contactPhone,
        summary:
          params.expectedKind === PartnerKind.PARTICIPANT && params.input.summary !== undefined
            ? normalizeNullableText(params.input.summary)
            : existing.summary,
        description:
          params.input.description !== undefined
            ? normalizeNullableText(params.input.description)
            : existing.description,
        mainWebsiteUrl,
        socialLinks: socialLinks ?? Prisma.DbNull,
        profileCompletedAt: new Date(),
      },
    });

    if (params.expectedKind === PartnerKind.SPONSOR) {
      await tx.sponsorPartnerProfile.update({
        where: { partnerProfileId: existing.id },
        data: {
          productServiceType:
            params.input.productServiceType !== undefined
              ? normalizeText(params.input.productServiceType) || existing.sponsorProfile?.productServiceType || ""
              : existing.sponsorProfile?.productServiceType || "",
          audienceProfile:
            params.input.audienceProfile !== undefined
              ? normalizeNullableText(params.input.audienceProfile)
              : existing.sponsorProfile?.audienceProfile || null,
          marketingGoals:
            params.input.marketingGoals !== undefined
              ? normalizeNullableText(params.input.marketingGoals)
              : existing.sponsorProfile?.marketingGoals || null,
          onsitePlacement:
            params.input.onsitePlacement !== undefined
              ? normalizeNullableText(params.input.onsitePlacement)
              : existing.sponsorProfile?.onsitePlacement || null,
          signageInformation:
            params.input.signageInformation !== undefined
              ? normalizeNullableText(params.input.signageInformation)
              : existing.sponsorProfile?.signageInformation || null,
          staffed:
            params.input.staffed !== undefined
              ? typeof params.input.staffed === "boolean"
                ? params.input.staffed
                : null
              : existing.sponsorProfile?.staffed ?? null,
          requests:
            params.input.requests !== undefined
              ? normalizeNullableText(params.input.requests)
              : existing.sponsorProfile?.requests || null,
        },
      });
    } else {
      await tx.participantPartnerProfile.update({
        where: { partnerProfileId: existing.id },
        data: {
          entertainmentType:
            params.input.entertainmentType !== undefined
              ? (normalizeNullableText(params.input.entertainmentType) as any)
              : existing.participantProfile?.entertainmentType || null,
          entertainmentStyle:
            params.input.entertainmentStyle !== undefined
              ? normalizeNullableText(params.input.entertainmentStyle)
              : existing.participantProfile?.entertainmentStyle || null,
          foodStyle:
            params.input.foodStyle !== undefined
              ? normalizeNullableText(params.input.foodStyle)
              : existing.participantProfile?.foodStyle || null,
          foodSetupType:
            params.input.foodSetupType !== undefined
              ? (normalizeNullableText(params.input.foodSetupType) as any)
              : existing.participantProfile?.foodSetupType || null,
          marketType:
            params.input.marketType !== undefined
              ? (normalizeNullableText(params.input.marketType) as any)
              : existing.participantProfile?.marketType || null,
          specialRequirements:
            params.input.specialRequirements !== undefined
              ? normalizeNullableText(params.input.specialRequirements)
              : existing.participantProfile?.specialRequirements || null,
        },
      });
    }

    const refreshed = await tx.partnerProfile.findUnique({
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
            passwordChangeRequiredAt: true,
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
                    slug: true,
                    name: true,
                    seasonStartsOn: true,
                    seasonEndsOn: true,
                  },
                },
              },
            },
          },
        },
        applications: {
          include: {
            eventSeries: {
              select: {
                id: true,
                slug: true,
                name: true,
                seasonStartsOn: true,
                seasonEndsOn: true,
              },
            },
          },
        },
      },
    });

    if (!refreshed) {
      throw new PartnerPortalServiceError(404, "Partner profile not found");
    }

    if (params.expectedKind === PartnerKind.PARTICIPANT) {
      const approvedApplications = refreshed.applications.filter(
        (application) => application.status === PartnerApplicationStatus.APPROVED
      );
      if (approvedApplications.length > 0 && refreshed.participantProfile) {
        await upsertPartnerScheduleParticipantProjection({
          db: tx,
          brandId: refreshed.brandId,
          partnerProfileId: refreshed.id,
          displayName: refreshed.displayName,
          slug: refreshed.slug,
          type: refreshed.participantProfile.participantType,
          status:
            refreshed.user.status === PartnerUserStatus.ACTIVE
              ? ScheduleParticipantStatus.ACTIVE
              : ScheduleParticipantStatus.INACTIVE,
          summary: refreshed.summary,
        });
      }
    }

    return refreshed as PortalProfileRecord;
  });

  return toPortalProfileRecord(updated);
}

export async function listPartnerPortalApplications(params: {
  partnerUserId: string;
  expectedKind: PartnerKind;
}): Promise<PartnerPortalApplicationsPayload> {
  const profile = await requirePortalProfile(params);
  const availableEvents = await listActiveBrandEvents(profile.brandId);

  return {
    account: toPortalAccountRecord(profile),
    applications: profile.applications.map((application) => toPortalApplicationRecord(application)),
    availableEvents,
  };
}

export async function submitPartnerPortalApplication(params: {
  partnerUserId: string;
  expectedKind: PartnerKind;
  scheduleEventSeriesId: unknown;
}) {
  const profile = await requirePortalProfile(params);
  const scheduleEventSeriesId = normalizeText(params.scheduleEventSeriesId);
  if (!scheduleEventSeriesId) {
    throw new PartnerPortalServiceError(422, "Event selection is required");
  }

  const eventSeries = await prisma.scheduleEventSeries.findUnique({
    where: { id: scheduleEventSeriesId },
    select: {
      id: true,
      brandId: true,
      status: true,
    },
  });

  if (!eventSeries || eventSeries.brandId !== profile.brandId || eventSeries.status !== ScheduleEventSeriesStatus.ACTIVE) {
    throw new PartnerPortalServiceError(404, "Selected event is not available for applications");
  }

  const existing = profile.applications.find((application) => application.scheduleEventSeriesId === scheduleEventSeriesId);
  if (
    existing &&
    (existing.status === PartnerApplicationStatus.SUBMITTED ||
      existing.status === PartnerApplicationStatus.IN_REVIEW ||
      existing.status === PartnerApplicationStatus.APPROVED)
  ) {
    throw new PartnerPortalServiceError(409, "An application for this event already exists");
  }

  const now = new Date();
  const application = existing
    ? await prisma.partnerApplication.update({
        where: { id: existing.id },
        data: {
          applicationKind: params.expectedKind,
          submittedProfileSnapshot: buildSubmittedProfileSnapshot(profile),
          status: PartnerApplicationStatus.SUBMITTED,
          submittedAt: now,
          approvedAt: null,
          rejectedAt: null,
          withdrawnAt: null,
        },
        include: {
          eventSeries: {
            select: {
              id: true,
              slug: true,
              name: true,
              seasonStartsOn: true,
              seasonEndsOn: true,
            },
          },
        },
      })
    : await prisma.partnerApplication.create({
        data: {
          brandId: profile.brandId,
          partnerProfileId: profile.id,
          scheduleEventSeriesId,
          applicationKind: params.expectedKind,
          submittedProfileSnapshot: buildSubmittedProfileSnapshot(profile),
          status: PartnerApplicationStatus.SUBMITTED,
          submittedAt: now,
        },
        include: {
          eventSeries: {
            select: {
              id: true,
              slug: true,
              name: true,
              seasonStartsOn: true,
              seasonEndsOn: true,
            },
          },
        },
      });

  return toPortalApplicationRecord(application);
}
