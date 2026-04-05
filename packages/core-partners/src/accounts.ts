import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  PartnerKind,
  PartnerSponsorType,
  PartnerUserStatus,
  Prisma,
  ScheduleParticipantStatus,
  ScheduleParticipantType,
} from "@prisma/client";
import { resolveBrandEmailConfig, sendBrandEmail } from "@command/core-email";
import { prisma } from "@command/core-db";
import {
  emptyApplicationCounts,
  ensureBrand,
  normalizeNullableId,
  normalizeNullableText,
  normalizeText,
  resolveReadableBrandIds,
  resolveWriteBrandId,
  toIsoString,
} from "./common";
import { upsertPartnerScheduleParticipantProjection } from "./projection";
import type { PartnerAccountRecord, PartnerAdminScope } from "./types";

// Keep this aligned with core-auth-partner until auth constants are moved to a shared package.
const MIN_PARTNER_PASSWORD_LENGTH = 8;

type PartnerProfileWithRelations = Prisma.PartnerProfileGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    user: true;
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

type ParticipantAccountInput = {
  scope: PartnerAdminScope;
  partnerProfileId?: string;
  brandId?: unknown;
  email: unknown;
  displayName: unknown;
  contactName: unknown;
  contactPhone: unknown;
  mainWebsiteUrl?: unknown;
  summary?: unknown;
  description?: unknown;
  participantType: unknown;
  status?: unknown;
  password?: unknown;
};

type SponsorAccountInput = {
  scope: PartnerAdminScope;
  partnerProfileId?: string;
  brandId?: unknown;
  email: unknown;
  displayName: unknown;
  contactName: unknown;
  contactPhone: unknown;
  mainWebsiteUrl?: unknown;
  summary?: unknown;
  description?: unknown;
  productServiceType: unknown;
  sponsorType?: unknown;
  status?: unknown;
  password?: unknown;
};

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
    passwordChangeRequired: Boolean(profile.user.passwordChangeRequiredAt),
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

function normalizeEmail(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function requireEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required");
  }
  return email;
}

function requireText(value: unknown, label: string) {
  const text = normalizeText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requirePassword(value: unknown, options?: { required?: boolean }) {
  const password = String(value || "");
  if (!password) {
    if (options?.required) {
      throw new Error("Password is required");
    }
    return null;
  }
  if (password.length < MIN_PARTNER_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PARTNER_PASSWORD_LENGTH} characters`);
  }
  return password;
}

function parseStatus(value: unknown) {
  return value === PartnerUserStatus.BLOCKED ? PartnerUserStatus.BLOCKED : PartnerUserStatus.ACTIVE;
}

function parseParticipantType(value: unknown) {
  const participantType = requireText(value, "Participant type");
  if (
    participantType !== ScheduleParticipantType.ENTERTAINMENT &&
    participantType !== ScheduleParticipantType.FOOD_VENDOR &&
    participantType !== ScheduleParticipantType.MARKET_VENDOR
  ) {
    throw new Error("Participant type is invalid");
  }
  return participantType;
}

function parseSponsorType(value: unknown) {
  const sponsorType = normalizeNullableText(value);
  if (!sponsorType) return null;
  if (
    sponsorType !== PartnerSponsorType.DIRECT &&
    sponsorType !== PartnerSponsorType.IN_KIND &&
    sponsorType !== PartnerSponsorType.MEDIA
  ) {
    throw new Error("Sponsor type is invalid");
  }
  return sponsorType;
}

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
    throw new Error(`${label} must be a valid URL`);
  }
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buildUniqueProfileSlug(
  db: Prisma.TransactionClient | typeof prisma,
  brandId: string,
  preferred: string,
  excludeProfileId?: string
) {
  const base = slugify(preferred) || "partner";
  let slug = base;

  for (let index = 2; index < 100; index += 1) {
    const existing = await db.partnerProfile.findFirst({
      where: {
        brandId,
        slug,
        ...(excludeProfileId ? { NOT: { id: excludeProfileId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${index}`;
  }

  throw new Error("Unable to allocate a unique partner slug");
}

function randomPassword(length = 18) {
  return crypto.randomBytes(length).toString("base64url");
}

async function findManagedPartnerProfile(
  scope: PartnerAdminScope,
  partnerProfileId: string,
  expectedKind: PartnerKind
) {
  const existing = await prisma.partnerProfile.findUnique({
    where: { id: partnerProfileId },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      user: true,
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
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      },
    },
  });

  if (!existing) throw new Error("Partner account not found");
  if (existing.user.kind !== expectedKind) throw new Error("Partner account is not the expected kind");

  const readableBrandIds = resolveReadableBrandIds(scope, existing.brandId);
  if (Array.isArray(readableBrandIds) && readableBrandIds.length === 0) {
    throw new Error("Partner account is not available for this backoffice user");
  }

  return existing as PartnerProfileWithRelations;
}

async function ensureUniquePartnerEmail(
  db: Prisma.TransactionClient,
  brandId: string,
  email: string,
  expectedKind: PartnerKind,
  excludePartnerUserId?: string
) {
  const existing = await db.partnerUser.findFirst({
    where: {
      brandId,
      email,
      ...(excludePartnerUserId ? { NOT: { id: excludePartnerUserId } } : {}),
    },
    select: {
      id: true,
      kind: true,
    },
  });

  if (!existing) return;
  if (existing.kind !== expectedKind) {
    throw new Error("An account with that email already exists under a different partner kind");
  }
  throw new Error("An account with that email already exists");
}

function hasSchedulableProjection(profile: PartnerProfileWithRelations) {
  return Boolean(
    profile.scheduleParticipant ||
      (profile.participantProfile &&
        profile.applications.some((application) => application.status === "APPROVED"))
  );
}

async function syncParticipantProjection(
  db: Prisma.TransactionClient,
  profile: PartnerProfileWithRelations
) {
  if (!profile.participantProfile || !hasSchedulableProjection(profile)) return;

  await upsertPartnerScheduleParticipantProjection({
    db,
    brandId: profile.brandId,
    partnerProfileId: profile.id,
    displayName: profile.displayName,
    slug: profile.slug,
    type: profile.participantProfile.participantType,
    status:
      profile.user.status === PartnerUserStatus.ACTIVE
        ? ScheduleParticipantStatus.ACTIVE
        : ScheduleParticipantStatus.INACTIVE,
    summary: profile.summary,
  });
}

async function loadPartnerAccountRecord(db: Prisma.TransactionClient | typeof prisma, partnerProfileId: string) {
  const refreshed = await db.partnerProfile.findUnique({
    where: { id: partnerProfileId },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      user: true,
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
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      },
    },
  });

  if (!refreshed) throw new Error("Partner account not found after update");
  return toPartnerAccountRecord(refreshed as PartnerProfileWithRelations);
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
      user: true,
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

export async function createParticipantPartnerAccount(params: ParticipantAccountInput) {
  const brandId = resolveWriteBrandId(params.scope, params.brandId, {
    allowSingleBrandFallback: true,
  });
  const brand = await ensureBrand(brandId);
  const email = requireEmail(params.email);
  const displayName = requireText(params.displayName, "Name");
  const contactName = requireText(params.contactName, "Contact");
  const contactPhone = requireText(params.contactPhone, "Phone");
  const participantType = parseParticipantType(params.participantType);
  const status = parseStatus(params.status);
  const password = requirePassword(params.password, { required: true });
  const mainWebsiteUrl = normalizeNullableUrl(params.mainWebsiteUrl, "Website");
  const summary = normalizeNullableText(params.summary);
  const description = normalizeNullableText(params.description);
  const passwordHash = await bcrypt.hash(password!, 12);
  const passwordChangeRequiredAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await ensureUniquePartnerEmail(tx, brandId, email, PartnerKind.PARTICIPANT);
    const slug = await buildUniqueProfileSlug(tx, brandId, displayName);
    const user = await tx.partnerUser.create({
      data: {
        brandId,
        email,
        passwordHash,
        kind: PartnerKind.PARTICIPANT,
        status,
        emailVerified: new Date(),
        passwordChangeRequiredAt,
      },
    });

    const profile = await tx.partnerProfile.create({
      data: {
        brandId,
        partnerUserId: user.id,
        slug,
        displayName,
        contactName,
        contactPhone,
        summary,
        description,
        mainWebsiteUrl,
      },
    });

    await tx.participantPartnerProfile.create({
      data: {
        partnerProfileId: profile.id,
        participantType,
      },
    });

    return loadPartnerAccountRecord(tx, profile.id);
  });

  if (created.brandId !== brand.id) {
    throw new Error("Partner account brand mismatch");
  }

  return created;
}

export async function createSponsorPartnerAccount(params: SponsorAccountInput) {
  const brandId = resolveWriteBrandId(params.scope, params.brandId, {
    allowSingleBrandFallback: true,
  });
  const brand = await ensureBrand(brandId);
  const email = requireEmail(params.email);
  const displayName = requireText(params.displayName, "Name");
  const contactName = requireText(params.contactName, "Contact");
  const contactPhone = requireText(params.contactPhone, "Phone");
  const productServiceType = requireText(params.productServiceType, "Product / service type");
  const sponsorType = parseSponsorType(params.sponsorType);
  const status = parseStatus(params.status);
  const password = requirePassword(params.password, { required: true });
  const mainWebsiteUrl = normalizeNullableUrl(params.mainWebsiteUrl, "Website");
  const summary = normalizeNullableText(params.summary);
  const description = normalizeNullableText(params.description);
  const passwordHash = await bcrypt.hash(password!, 12);
  const passwordChangeRequiredAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await ensureUniquePartnerEmail(tx, brandId, email, PartnerKind.SPONSOR);
    const slug = await buildUniqueProfileSlug(tx, brandId, displayName);
    const user = await tx.partnerUser.create({
      data: {
        brandId,
        email,
        passwordHash,
        kind: PartnerKind.SPONSOR,
        status,
        emailVerified: new Date(),
        passwordChangeRequiredAt,
      },
    });

    const profile = await tx.partnerProfile.create({
      data: {
        brandId,
        partnerUserId: user.id,
        slug,
        displayName,
        contactName,
        contactPhone,
        summary,
        description,
        mainWebsiteUrl,
      },
    });

    await tx.sponsorPartnerProfile.create({
      data: {
        partnerProfileId: profile.id,
        productServiceType,
        sponsorType,
      },
    });

    return loadPartnerAccountRecord(tx, profile.id);
  });

  if (created.brandId !== brand.id) {
    throw new Error("Sponsor account brand mismatch");
  }

  return created;
}

export async function updateParticipantPartnerAccount(params: ParticipantAccountInput & { partnerProfileId: string }) {
  const existing = await findManagedPartnerProfile(params.scope, params.partnerProfileId, PartnerKind.PARTICIPANT);
  if (!existing.participantProfile) throw new Error("Participant profile details are missing");

  const email = requireEmail(params.email);
  const displayName = requireText(params.displayName, "Name");
  const contactName = requireText(params.contactName, "Contact");
  const contactPhone = requireText(params.contactPhone, "Phone");
  const participantType = parseParticipantType(params.participantType);
  const status = parseStatus(params.status);
  const password = requirePassword(params.password);
  const mainWebsiteUrl = normalizeNullableUrl(params.mainWebsiteUrl, "Website");
  const summary = normalizeNullableText(params.summary);
  const description = normalizeNullableText(params.description);
  const emailChanged = email !== existing.user.email;

  return prisma.$transaction(async (tx) => {
    await ensureUniquePartnerEmail(tx, existing.brandId, email, PartnerKind.PARTICIPANT, existing.partnerUserId);

    await tx.partnerUser.update({
      where: { id: existing.partnerUserId },
      data: {
        email,
        status,
        ...(emailChanged ? { emailVerified: new Date() } : null),
        ...(password
          ? {
              passwordHash: await bcrypt.hash(password, 12),
              passwordChangeRequiredAt: new Date(),
            }
          : null),
      },
    });

    await tx.partnerProfile.update({
      where: { id: existing.id },
      data: {
        displayName,
        contactName,
        contactPhone,
        summary,
        description,
        mainWebsiteUrl,
      },
    });

    await tx.participantPartnerProfile.update({
      where: { partnerProfileId: existing.id },
      data: {
        participantType,
      },
    });

    if (emailChanged || password) {
      await tx.partnerEmailVerificationToken.deleteMany({
        where: {
          brandId: existing.brandId,
          identifier: {
            in: Array.from(new Set([existing.user.email, email])),
          },
        },
      });
      await tx.partnerPasswordResetToken.deleteMany({
        where: {
          brandId: existing.brandId,
          identifier: {
            in: Array.from(new Set([existing.user.email, email])),
          },
        },
      });
    }

    if (password) {
      await tx.partnerSession.deleteMany({
        where: {
          partnerUserId: existing.partnerUserId,
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
        user: true,
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
          orderBy: [
            {
              createdAt: "desc",
            },
          ],
        },
      },
    });

    if (!refreshed) throw new Error("Partner account not found after update");
    await syncParticipantProjection(tx, refreshed as PartnerProfileWithRelations);
    return toPartnerAccountRecord(refreshed as PartnerProfileWithRelations);
  });
}

export async function updateSponsorPartnerAccount(params: SponsorAccountInput & { partnerProfileId: string }) {
  const existing = await findManagedPartnerProfile(params.scope, params.partnerProfileId, PartnerKind.SPONSOR);
  if (!existing.sponsorProfile) throw new Error("Sponsor profile details are missing");

  const email = requireEmail(params.email);
  const displayName = requireText(params.displayName, "Name");
  const contactName = requireText(params.contactName, "Contact");
  const contactPhone = requireText(params.contactPhone, "Phone");
  const productServiceType = requireText(params.productServiceType, "Product / service type");
  const sponsorType = parseSponsorType(params.sponsorType);
  const status = parseStatus(params.status);
  const password = requirePassword(params.password);
  const mainWebsiteUrl = normalizeNullableUrl(params.mainWebsiteUrl, "Website");
  const summary = normalizeNullableText(params.summary);
  const description = normalizeNullableText(params.description);
  const emailChanged = email !== existing.user.email;

  return prisma.$transaction(async (tx) => {
    await ensureUniquePartnerEmail(tx, existing.brandId, email, PartnerKind.SPONSOR, existing.partnerUserId);

    await tx.partnerUser.update({
      where: { id: existing.partnerUserId },
      data: {
        email,
        status,
        ...(emailChanged ? { emailVerified: new Date() } : null),
        ...(password
          ? {
              passwordHash: await bcrypt.hash(password, 12),
              passwordChangeRequiredAt: new Date(),
            }
          : null),
      },
    });

    await tx.partnerProfile.update({
      where: { id: existing.id },
      data: {
        displayName,
        contactName,
        contactPhone,
        summary,
        description,
        mainWebsiteUrl,
      },
    });

    await tx.sponsorPartnerProfile.update({
      where: { partnerProfileId: existing.id },
      data: {
        productServiceType,
        sponsorType,
      },
    });

    if (emailChanged || password) {
      await tx.partnerEmailVerificationToken.deleteMany({
        where: {
          brandId: existing.brandId,
          identifier: {
            in: Array.from(new Set([existing.user.email, email])),
          },
        },
      });
      await tx.partnerPasswordResetToken.deleteMany({
        where: {
          brandId: existing.brandId,
          identifier: {
            in: Array.from(new Set([existing.user.email, email])),
          },
        },
      });
    }

    if (password) {
      await tx.partnerSession.deleteMany({
        where: {
          partnerUserId: existing.partnerUserId,
        },
      });
    }

    return loadPartnerAccountRecord(tx, existing.id);
  });
}

export async function emailPartnerTemporaryPassword(params: {
  scope: PartnerAdminScope;
  partnerProfileId: string;
  expectedKind: PartnerKind;
}) {
  const existing = await findManagedPartnerProfile(params.scope, params.partnerProfileId, params.expectedKind);
  if (existing.user.status === PartnerUserStatus.BLOCKED) {
    throw new Error("Blocked partner accounts cannot receive temporary passwords");
  }

  const emailConfig = await resolveBrandEmailConfig(
    {
      brandId: existing.brand.id,
      brandKey: existing.brand.brandKey,
      brandName: existing.brand.name,
    },
    "auth"
  );

  if (!emailConfig.ok) {
    throw new Error(emailConfig.error);
  }

  const temporaryPassword = randomPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  await prisma.$transaction([
    prisma.partnerUser.update({
      where: { id: existing.partnerUserId },
      data: {
        passwordHash,
        passwordChangeRequiredAt: new Date(),
      },
    }),
    prisma.partnerSession.deleteMany({
      where: {
        partnerUserId: existing.partnerUserId,
      },
    }),
    prisma.partnerPasswordResetToken.deleteMany({
      where: {
        brandId: existing.brandId,
        identifier: existing.user.email,
      },
    }),
  ]);

  const subject = `Temporary password for ${existing.brand.name}`;
  const text = [
    `A temporary password was issued for your ${existing.brand.name} ${params.expectedKind === PartnerKind.SPONSOR ? "sponsor" : "partner"} account.`,
    "",
    `Email: ${existing.user.email}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "Sign in with this password, then set a new password immediately when prompted.",
  ].join("\n");

  await sendBrandEmail({
    config: emailConfig.config,
    to: existing.user.email,
    subject,
    text,
  });

  return {
    ok: true as const,
  };
}
