import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  BrandStatus,
  PartnerKind,
  PartnerUserStatus,
  ScheduleParticipantType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  resolveBrandEmailConfig,
  sendBrandEmail,
  type BrandEmailRuntimeConfig,
} from "@command/core-email";

const DEFAULT_PARTNER_SESSION_TTL_HOURS = 24 * 30;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export const MIN_PARTNER_PASSWORD_LENGTH = 8;

type PartnerUserWithRelations = Prisma.PartnerUserGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
        status: true;
      };
    };
    profile: {
      select: {
        id: true;
        displayName: true;
        slug: true;
      };
    };
  };
}>;

type PartnerSessionWithUser = Prisma.PartnerSessionGetPayload<{
  include: {
    user: {
      include: {
        brand: {
          select: {
            id: true;
            brandKey: true;
            name: true;
            status: true;
          };
        };
        profile: {
          select: {
            id: true;
            displayName: true;
            slug: true;
          };
        };
      };
    };
  };
}>;

export type PartnerBrandContext = {
  brandId: string;
  brandKey: string;
  brandName: string;
  publicOrigin: string;
};

export type PartnerRequestIdentity = {
  ip: string;
  userAgent?: string | null;
  countryIso2?: string | null;
  countryName?: string | null;
};

export type PartnerPublicAccount = {
  id: string;
  partnerProfileId: string;
  brandKey: string;
  email: string;
  kind: PartnerKind;
  status: PartnerUserStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  displayName: string;
  slug: string;
};

export type PartnerPublicSession = {
  token: string;
  expiresAt: string;
};

export type PartnerSessionState = {
  session: PartnerPublicSession;
  account: PartnerPublicAccount;
};

export type PartnerLoginResult = PartnerSessionState & {
  analytics: {
    loginEventId: string;
  };
};

export type PartnerRegisterResult = {
  ok: true;
  verificationRequired: true;
};

export type PartnerVerifyEmailResult = {
  ok: true;
  verified: true;
};

type PartnerRegistrationParams =
  | {
      brandKey: string;
      publicOrigin: string;
      kind: "PARTICIPANT";
      email: unknown;
      password: unknown;
      displayName: unknown;
      contactName: unknown;
      contactPhone: unknown;
      summary?: unknown;
      participantType: unknown;
    }
  | {
      brandKey: string;
      publicOrigin: string;
      kind: "SPONSOR";
      email: unknown;
      password: unknown;
      displayName: unknown;
      contactName: unknown;
      contactPhone: unknown;
      productServiceType: unknown;
    };

export class PartnerAuthServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PartnerAuthServiceError";
    this.status = status;
  }
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeEmail(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeNullableText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePublicOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    throw new PartnerAuthServiceError(500, "Integration public origin is invalid");
  }
}

function requireEmail(email: unknown): string {
  if (typeof email !== "string") {
    throw new PartnerAuthServiceError(422, "Email is required");
  }

  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new PartnerAuthServiceError(422, "A valid email address is required");
  }

  return normalized;
}

function requirePassword(password: unknown): string {
  if (typeof password !== "string") {
    throw new PartnerAuthServiceError(422, "Password is required");
  }

  if (password.length < MIN_PARTNER_PASSWORD_LENGTH) {
    throw new PartnerAuthServiceError(
      422,
      `Password must be at least ${MIN_PARTNER_PASSWORD_LENGTH} characters`
    );
  }

  return password;
}

function requireToken(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new PartnerAuthServiceError(400, `${label} is required`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new PartnerAuthServiceError(400, `${label} is required`);
  }

  return normalized;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new PartnerAuthServiceError(422, `${label} is required`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new PartnerAuthServiceError(422, `${label} is required`);
  }

  return normalized;
}

function requireParticipantType(value: unknown) {
  const normalized = requireText(value, "Participant type");
  if (
    normalized !== ScheduleParticipantType.ENTERTAINMENT &&
    normalized !== ScheduleParticipantType.FOOD_VENDOR &&
    normalized !== ScheduleParticipantType.MARKET_VENDOR
  ) {
    throw new PartnerAuthServiceError(422, "Participant type is invalid");
  }
  return normalized;
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPartnerSessionTtlMs() {
  const raw = Number.parseInt(String(process.env.COMMAND_PARTNER_SESSION_TTL_HOURS || ""), 10);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PARTNER_SESSION_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function requireBrandContext(brandKey: string, publicOrigin: string): Promise<PartnerBrandContext> {
  const normalizedBrandKey = String(brandKey || "")
    .trim()
    .toLowerCase();
  if (!normalizedBrandKey) {
    throw new PartnerAuthServiceError(500, "Integration brand key is missing");
  }

  const brand = await prisma.brand.findUnique({
    where: { brandKey: normalizedBrandKey },
    select: {
      id: true,
      brandKey: true,
      name: true,
      status: true,
    },
  });

  if (!brand) {
    throw new PartnerAuthServiceError(503, "Configured integration brand does not exist");
  }

  if (brand.status !== BrandStatus.ACTIVE) {
    throw new PartnerAuthServiceError(503, "This integration brand is not active");
  }

  return {
    brandId: brand.id,
    brandKey: brand.brandKey,
    brandName: brand.name,
    publicOrigin: normalizePublicOrigin(publicOrigin),
  };
}

function buildPublicOriginUrl(
  publicOrigin: string,
  pathname: string,
  query?: Record<string, string | null | undefined>
) {
  const url = new URL(pathname, normalizePublicOrigin(publicOrigin));
  for (const [key, value] of Object.entries(query || {})) {
    if (!value) continue;
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function resolveBrandEmailRuntimeConfig(brand: PartnerBrandContext, purpose: "auth" | "notification") {
  const config = await resolveBrandEmailConfig(brand, purpose);
  if (!config.ok) {
    throw new PartnerAuthServiceError(config.status, config.error);
  }
  return config.config;
}

async function findPartnerUserByBrandAndEmail(brandId: string, email: string) {
  return prisma.partnerUser.findFirst({
    where: {
      brandId,
      email,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
          status: true,
        },
      },
      profile: {
        select: {
          id: true,
          displayName: true,
          slug: true,
        },
      },
    },
  });
}

async function getPartnerSessionRecord(sessionToken: string): Promise<PartnerSessionWithUser | null> {
  if (!sessionToken) return null;

  return prisma.partnerSession.findUnique({
    where: { sessionToken },
    include: {
      user: {
        include: {
          brand: {
            select: {
              id: true,
              brandKey: true,
              name: true,
              status: true,
            },
          },
          profile: {
            select: {
              id: true,
              displayName: true,
              slug: true,
            },
          },
        },
      },
    },
  });
}

async function deletePartnerSession(sessionToken: string) {
  if (!sessionToken) return;
  await prisma.partnerSession.deleteMany({ where: { sessionToken } });
}

function toPartnerPublicAccount(user: PartnerUserWithRelations): PartnerPublicAccount {
  if (!user.profile) {
    throw new PartnerAuthServiceError(500, "Partner account is missing a profile");
  }

  return {
    id: user.id,
    partnerProfileId: user.profile.id,
    brandKey: user.brand.brandKey,
    email: normalizeEmail(user.email),
    kind: user.kind,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    displayName: user.profile.displayName,
    slug: user.profile.slug,
  };
}

function isAccessiblePartnerUser(
  user: PartnerUserWithRelations | null | undefined,
  expectedKind?: PartnerKind
): user is PartnerUserWithRelations {
  return Boolean(
    user &&
      user.brand.status === BrandStatus.ACTIVE &&
      user.status === PartnerUserStatus.ACTIVE &&
      user.emailVerified &&
      user.email &&
      user.profile &&
      (!expectedKind || user.kind === expectedKind)
  );
}

function verificationPathForKind(kind: PartnerKind) {
  return kind === PartnerKind.SPONSOR ? "/sponsors/verify" : "/partners/verify";
}

async function sendVerificationEmail(params: {
  config: BrandEmailRuntimeConfig;
  brand: PartnerBrandContext;
  email: string;
  token: string;
  kind: PartnerKind;
}) {
  const url = buildPublicOriginUrl(params.brand.publicOrigin, verificationPathForKind(params.kind), {
    token: params.token,
  });

  const subject = `Verify your email to access ${params.brand.brandName}`;
  const text = [
    `Thanks for signing up for ${params.brand.brandName}.`,
    "",
    "Verify your email to activate your partner account:",
    url,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  await sendBrandEmail({
    config: params.config,
    to: params.email,
    subject,
    text,
  });
}

function toCountryName(countryIso2: string | null | undefined) {
  if (!countryIso2) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return (display.of(countryIso2) as string) || null;
  } catch {
    return null;
  }
}

async function createPartnerSessionState(params: {
  user: PartnerUserWithRelations;
  identity: PartnerRequestIdentity;
}): Promise<PartnerLoginResult> {
  const token = createSessionToken();
  const expires = new Date(Date.now() + getPartnerSessionTtlMs());
  const lastLoginAt = new Date();

  const [, , loginEvent] = await prisma.$transaction([
    prisma.partnerUser.update({
      where: { id: params.user.id },
      data: { lastLoginAt },
    }),
    prisma.partnerSession.create({
      data: {
        sessionToken: token,
        partnerUserId: params.user.id,
        expires,
      },
    }),
    prisma.partnerLoginEvent.create({
      data: {
        partnerUserId: params.user.id,
        brandId: params.user.brandId,
        ip: params.identity.ip || "unknown",
        userAgent: params.identity.userAgent || null,
        countryIso2: params.identity.countryIso2 || null,
        countryName: params.identity.countryName || toCountryName(params.identity.countryIso2) || null,
      },
      select: {
        id: true,
      },
    }),
  ]);

  return {
    session: {
      token,
      expiresAt: expires.toISOString(),
    },
    account: toPartnerPublicAccount({
      ...params.user,
      lastLoginAt,
    }),
    analytics: {
      loginEventId: loginEvent.id,
    },
  };
}

async function requireAccessibleSession(
  brand: PartnerBrandContext,
  sessionToken: string,
  expectedKind?: PartnerKind
): Promise<PartnerSessionWithUser> {
  const session = await getPartnerSessionRecord(sessionToken);
  if (!session) {
    throw new PartnerAuthServiceError(401, "Unauthorized");
  }

  if (session.expires.getTime() <= Date.now()) {
    await deletePartnerSession(sessionToken);
    throw new PartnerAuthServiceError(401, "Unauthorized");
  }

  if (session.user.brandId !== brand.brandId) {
    throw new PartnerAuthServiceError(401, "Unauthorized");
  }

  if (!isAccessiblePartnerUser(session.user, expectedKind)) {
    await deletePartnerSession(sessionToken);
    throw new PartnerAuthServiceError(401, "Unauthorized");
  }

  return session;
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

  throw new PartnerAuthServiceError(500, "Unable to allocate a unique partner slug");
}

export async function resolvePartnerBrandContext(params: {
  brandKey: string;
  publicOrigin: string;
}) {
  return requireBrandContext(params.brandKey, params.publicOrigin);
}

export async function registerPartnerUser(
  params: PartnerRegistrationParams
): Promise<PartnerRegisterResult> {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const email = requireEmail(params.email);
  const password = requirePassword(params.password);
  const displayName = requireText(params.displayName, "Display name");
  const contactName = requireText(params.contactName, "Contact name");
  const contactPhone = requireText(params.contactPhone, "Contact phone");
  const emailConfig = await resolveBrandEmailRuntimeConfig(brand, "auth");
  const existing = await findPartnerUserByBrandAndEmail(brand.brandId, email);

  if (existing && (existing.emailVerified || existing.status === PartnerUserStatus.BLOCKED || existing.kind !== params.kind)) {
    throw new PartnerAuthServiceError(409, "An account with that email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHash = sha256(verificationToken);
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    const slug = existing?.profile?.slug || (await buildUniqueProfileSlug(tx, brand.brandId, displayName, existing?.profile?.id));
    const participantSummary =
      params.kind === "PARTICIPANT" ? normalizeNullableText(params.summary) : null;
    const participantType =
      params.kind === "PARTICIPANT" ? requireParticipantType(params.participantType) : null;
    const sponsorProductServiceType =
      params.kind === "SPONSOR"
        ? requireText(params.productServiceType, "Product or service type")
        : null;

    const user = existing
      ? await tx.partnerUser.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            status: PartnerUserStatus.ACTIVE,
            emailVerified: null,
            kind: existing.kind,
          },
        })
      : await tx.partnerUser.create({
          data: {
            brandId: brand.brandId,
            email,
            passwordHash,
            kind: params.kind,
            status: PartnerUserStatus.ACTIVE,
            emailVerified: null,
          },
        });

    const profile = existing?.profile
      ? await tx.partnerProfile.update({
          where: { id: existing.profile.id },
          data: {
            displayName,
            contactName,
            contactPhone,
            slug,
            summary: participantSummary,
          },
        })
      : await tx.partnerProfile.create({
          data: {
            brandId: brand.brandId,
            partnerUserId: user.id,
            slug,
            displayName,
            contactName,
            contactPhone,
            summary: participantSummary,
          },
        });

    if (params.kind === "PARTICIPANT") {
      await tx.participantPartnerProfile.upsert({
        where: { partnerProfileId: profile.id },
        update: {
          participantType: participantType!,
        },
        create: {
          partnerProfileId: profile.id,
          participantType: participantType!,
        },
      });
    } else {
      await tx.sponsorPartnerProfile.upsert({
        where: { partnerProfileId: profile.id },
        update: {
          productServiceType: sponsorProductServiceType!,
        },
        create: {
          partnerProfileId: profile.id,
          productServiceType: sponsorProductServiceType!,
        },
      });
    }

    await tx.partnerEmailVerificationToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: email,
      },
    });

    await tx.partnerEmailVerificationToken.create({
      data: {
        brandId: brand.brandId,
        identifier: email,
        token: verificationTokenHash,
        expires,
      },
    });
  });

  await sendVerificationEmail({
    config: emailConfig,
    brand,
    email,
    token: verificationToken,
    kind: params.kind,
  });

  return {
    ok: true as const,
    verificationRequired: true as const,
  };
}

export async function loginPartnerUser(params: {
  brandKey: string;
  publicOrigin: string;
  kind: PartnerKind;
  email: unknown;
  password: unknown;
  identity: PartnerRequestIdentity;
}): Promise<PartnerLoginResult> {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const email = requireEmail(params.email);

  if (typeof params.password !== "string" || !params.password) {
    throw new PartnerAuthServiceError(422, "Password is required");
  }

  const user = await findPartnerUserByBrandAndEmail(brand.brandId, email);
  if (!user || user.kind !== params.kind || user.status === PartnerUserStatus.BLOCKED || !user.emailVerified || !user.passwordHash) {
    throw new PartnerAuthServiceError(401, "Invalid email or password");
  }

  if (!(await bcrypt.compare(params.password, user.passwordHash))) {
    throw new PartnerAuthServiceError(401, "Invalid email or password");
  }

  return createPartnerSessionState({
    user,
    identity: params.identity,
  });
}

export async function getPartnerSessionState(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
  kind: PartnerKind;
}): Promise<PartnerSessionState> {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const token = requireToken(params.sessionToken, "Session token");
  const session = await requireAccessibleSession(brand, token, params.kind);

  return {
    session: {
      token: session.sessionToken,
      expiresAt: session.expires.toISOString(),
    },
    account: toPartnerPublicAccount(session.user),
  };
}

export async function logoutPartnerSession(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
  kind: PartnerKind;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const token = requireToken(params.sessionToken, "Session token");
  const session = await getPartnerSessionRecord(token);
  if (!session) return;
  if (session.user.brandId !== brand.brandId || session.user.kind !== params.kind) {
    throw new PartnerAuthServiceError(401, "Unauthorized");
  }
  await deletePartnerSession(token);
}

export async function verifyPartnerEmail(params: {
  brandKey: string;
  publicOrigin: string;
  token: unknown;
  kind: PartnerKind;
}): Promise<PartnerVerifyEmailResult> {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const rawToken = requireToken(params.token, "Token");
  const tokenHash = sha256(rawToken);

  const record = await prisma.partnerEmailVerificationToken.findFirst({
    where: {
      brandId: brand.brandId,
      token: { in: [rawToken, tokenHash] },
    },
  });

  if (!record) {
    throw new PartnerAuthServiceError(404, "Verification token not found");
  }

  if (record.expires.getTime() <= Date.now()) {
    await prisma.partnerEmailVerificationToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: record.identifier,
      },
    });
    throw new PartnerAuthServiceError(404, "Verification token not found");
  }

  const email = normalizeEmail(record.identifier);
  if (!email) {
    throw new PartnerAuthServiceError(400, "Verification token is invalid");
  }

  const user = await findPartnerUserByBrandAndEmail(brand.brandId, email);
  if (!user || user.kind !== params.kind) {
    throw new PartnerAuthServiceError(404, "Verification token not found");
  }

  await prisma.$transaction([
    prisma.partnerUser.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        status: PartnerUserStatus.ACTIVE,
      },
    }),
    prisma.partnerEmailVerificationToken.delete({
      where: {
        token: record.token,
      },
    }),
  ]);

  return {
    ok: true as const,
    verified: true as const,
  };
}
