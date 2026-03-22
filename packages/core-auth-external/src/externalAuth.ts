import crypto from "crypto";
import bcrypt from "bcryptjs";
import { BrandStatus, ExternalUserStatus, type Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  resolveBrandEmailConfig,
  sendBrandEmail,
  type BrandEmailRuntimeConfig,
} from "@command/core-email";

const DEFAULT_EXTERNAL_SESSION_TTL_HOURS = 24 * 30;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export const MIN_EXTERNAL_PASSWORD_LENGTH = 8;

type ExternalUserWithBrand = Prisma.ExternalUserGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
        status: true;
      };
    };
  };
}>;

type ExternalSessionWithUser = Prisma.ExternalSessionGetPayload<{
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
      };
    };
  };
}>;

export type ExternalBrandContext = {
  brandId: string;
  brandKey: string;
  brandName: string;
  publicOrigin: string;
};

export type ExternalRequestIdentity = {
  ip: string;
  userAgent?: string | null;
  countryIso2?: string | null;
  countryName?: string | null;
};

export type ExternalPublicAccount = {
  id: string;
  brandKey: string;
  email: string;
  name: string | null;
  status: ExternalUserStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type ExternalPublicSession = {
  token: string;
  expiresAt: string;
};

export type ExternalSessionState = {
  session: ExternalPublicSession;
  account: ExternalPublicAccount;
};

export class ExternalAuthServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ExternalAuthServiceError";
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

function normalizeName(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "string") {
    throw new ExternalAuthServiceError(422, "Name must be a string");
  }

  const normalized = value.trim();
  return normalized || null;
}

function requireEmail(email: unknown): string {
  if (typeof email !== "string") {
    throw new ExternalAuthServiceError(422, "Email is required");
  }

  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ExternalAuthServiceError(422, "A valid email address is required");
  }

  return normalized;
}

function requirePassword(password: unknown): string {
  if (typeof password !== "string") {
    throw new ExternalAuthServiceError(422, "Password is required");
  }

  if (password.length < MIN_EXTERNAL_PASSWORD_LENGTH) {
    throw new ExternalAuthServiceError(
      422,
      `Password must be at least ${MIN_EXTERNAL_PASSWORD_LENGTH} characters`
    );
  }

  return password;
}

function requireToken(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new ExternalAuthServiceError(400, `${label} is required`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ExternalAuthServiceError(400, `${label} is required`);
  }

  return normalized;
}

function normalizePublicOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    throw new ExternalAuthServiceError(500, "Integration public origin is invalid");
  }
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

function getExternalSessionTtlMs() {
  const raw = Number.parseInt(String(process.env.COMMAND_EXTERNAL_SESSION_TTL_HOURS || ""), 10);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EXTERNAL_SESSION_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function toExternalPublicAccount(user: ExternalUserWithBrand): ExternalPublicAccount {
  const email = user.email ? normalizeEmail(user.email) : "";
  if (!email) {
    throw new ExternalAuthServiceError(500, "External account is missing an email address");
  }

  return {
    id: user.id,
    brandKey: user.brand.brandKey,
    email,
    name: user.name || null,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

function isAccessibleExternalUser(user: ExternalUserWithBrand | null | undefined): user is ExternalUserWithBrand {
  return Boolean(
    user &&
      user.brand.status === BrandStatus.ACTIVE &&
      user.status === ExternalUserStatus.ACTIVE &&
      user.emailVerified &&
      user.email
  );
}

async function requireBrandContext(brandKey: string, publicOrigin: string): Promise<ExternalBrandContext> {
  const normalizedBrandKey = String(brandKey || "")
    .trim()
    .toLowerCase();
  if (!normalizedBrandKey) {
    throw new ExternalAuthServiceError(500, "Integration brand key is missing");
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
    throw new ExternalAuthServiceError(503, "Configured integration brand does not exist");
  }

  if (brand.status !== BrandStatus.ACTIVE) {
    throw new ExternalAuthServiceError(503, "This integration brand is not active");
  }

  return {
    brandId: brand.id,
    brandKey: brand.brandKey,
    brandName: brand.name,
    publicOrigin: normalizePublicOrigin(publicOrigin),
  };
}

async function findExternalUserByBrandAndEmail(brandId: string, email: string) {
  return prisma.externalUser.findFirst({
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
    },
  });
}

async function getExternalSessionRecord(sessionToken: string): Promise<ExternalSessionWithUser | null> {
  if (!sessionToken) return null;

  return prisma.externalSession.findUnique({
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
        },
      },
    },
  });
}

async function deleteExternalSession(sessionToken: string) {
  if (!sessionToken) return;
  await prisma.externalSession.deleteMany({ where: { sessionToken } });
}

async function resolveBrandEmailRuntimeConfig(brand: ExternalBrandContext, purpose: "auth" | "notification") {
  const config = await resolveBrandEmailConfig(brand, purpose);
  if (!config.ok) {
    throw new ExternalAuthServiceError(config.status, config.error);
  }
  return config.config;
}

async function sendVerificationEmail(params: {
  config: BrandEmailRuntimeConfig;
  brand: ExternalBrandContext;
  email: string;
  token: string;
}) {
  const url = buildPublicOriginUrl(params.brand.publicOrigin, "/auth/verify", {
    token: params.token,
  });

  const subject = `Verify your email to access ${params.brand.brandName}`;
  const text = [
    `Thanks for signing up for ${params.brand.brandName}.`,
    "",
    "Verify your email to activate your account:",
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

async function sendPasswordResetEmail(params: {
  config: BrandEmailRuntimeConfig;
  brand: ExternalBrandContext;
  email: string;
  token: string;
  expires: Date;
}) {
  const url = buildPublicOriginUrl(params.brand.publicOrigin, "/auth/reset-password", {
    token: params.token,
  });

  const subject = `Reset your ${params.brand.brandName} password`;
  const text = [
    `We received a request to reset your password for ${params.brand.brandName}.`,
    "",
    "Use the link below to set a new password:",
    url,
    "",
    "If you didn’t request this, you can ignore this email.",
    "",
    `This link expires at: ${params.expires.toISOString()}`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>We received a request to reset your password for <strong>${params.brand.brandName}</strong>.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;border-radius:12px;text-decoration:none">Reset Password</a></p>
      <p style="color:#444">If the button doesn’t work, copy and paste this URL into your browser:</p>
      <p><a href="${url}">${url}</a></p>
      <p style="color:#666;font-size:12px">This link expires at ${params.expires.toISOString()}</p>
    </div>
  `;

  await sendBrandEmail({
    config: params.config,
    to: params.email,
    subject,
    text,
    html,
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

async function createExternalSessionState(params: {
  user: ExternalUserWithBrand;
  identity: ExternalRequestIdentity;
}) {
  const token = createSessionToken();
  const expires = new Date(Date.now() + getExternalSessionTtlMs());

  await prisma.$transaction([
    prisma.externalUser.update({
      where: { id: params.user.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.externalSession.create({
      data: {
        sessionToken: token,
        externalUserId: params.user.id,
        expires,
      },
    }),
    prisma.externalLoginEvent.create({
      data: {
        externalUserId: params.user.id,
        brandId: params.user.brandId,
        ip: params.identity.ip || "unknown",
        userAgent: params.identity.userAgent || null,
        countryIso2: params.identity.countryIso2 || null,
        countryName: params.identity.countryName || toCountryName(params.identity.countryIso2) || null,
      },
    }),
  ]);

  return {
    session: {
      token,
      expiresAt: expires.toISOString(),
    },
    account: toExternalPublicAccount({
      ...params.user,
      lastLoginAt: new Date(),
    }),
  } satisfies ExternalSessionState;
}

async function requireAccessibleSession(
  brand: ExternalBrandContext,
  sessionToken: string
): Promise<ExternalSessionWithUser> {
  const session = await getExternalSessionRecord(sessionToken);
  if (!session) {
    throw new ExternalAuthServiceError(401, "Unauthorized");
  }

  if (session.expires.getTime() <= Date.now()) {
    await deleteExternalSession(sessionToken);
    throw new ExternalAuthServiceError(401, "Unauthorized");
  }

  if (session.user.brandId !== brand.brandId) {
    throw new ExternalAuthServiceError(401, "Unauthorized");
  }

  if (!isAccessibleExternalUser(session.user)) {
    await deleteExternalSession(sessionToken);
    throw new ExternalAuthServiceError(401, "Unauthorized");
  }

  return session;
}

export async function resolveExternalBrandContext(params: {
  brandKey: string;
  publicOrigin: string;
}) {
  return requireBrandContext(params.brandKey, params.publicOrigin);
}

export async function registerExternalUser(params: {
  brandKey: string;
  publicOrigin: string;
  email: unknown;
  password: unknown;
  name?: unknown;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const email = requireEmail(params.email);
  const password = requirePassword(params.password);
  const name = normalizeName(params.name);
  const emailConfig = await resolveBrandEmailRuntimeConfig(brand, "auth");
  const existing = await findExternalUserByBrandAndEmail(brand.brandId, email);

  if (existing && (existing.emailVerified || existing.status === ExternalUserStatus.BLOCKED)) {
    throw new ExternalAuthServiceError(409, "An account with that email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHash = sha256(verificationToken);
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.externalUser.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          status: ExternalUserStatus.ACTIVE,
          emailVerified: null,
        },
      });
    } else {
      await tx.externalUser.create({
        data: {
          brandId: brand.brandId,
          email,
          name,
          passwordHash,
          status: ExternalUserStatus.ACTIVE,
          emailVerified: null,
        },
      });
    }

    await tx.externalEmailVerificationToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: email,
      },
    });

    await tx.externalEmailVerificationToken.create({
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
  });

  return {
    ok: true as const,
    verificationRequired: true as const,
  };
}

export async function loginExternalUser(params: {
  brandKey: string;
  publicOrigin: string;
  email: unknown;
  password: unknown;
  identity: ExternalRequestIdentity;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const email = requireEmail(params.email);

  if (typeof params.password !== "string" || !params.password) {
    throw new ExternalAuthServiceError(422, "Password is required");
  }

  const user = await findExternalUserByBrandAndEmail(brand.brandId, email);
  if (!user || user.status === ExternalUserStatus.BLOCKED || !user.emailVerified || !user.passwordHash) {
    throw new ExternalAuthServiceError(401, "Invalid email or password");
  }

  if (!(await bcrypt.compare(params.password, user.passwordHash))) {
    throw new ExternalAuthServiceError(401, "Invalid email or password");
  }

  return createExternalSessionState({
    user,
    identity: params.identity,
  });
}

export async function getExternalSessionState(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
}): Promise<ExternalSessionState> {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const token = requireToken(params.sessionToken, "Session token");
  const session = await requireAccessibleSession(brand, token);

  return {
    session: {
      token: session.sessionToken,
      expiresAt: session.expires.toISOString(),
    },
    account: toExternalPublicAccount(session.user),
  };
}

export async function logoutExternalSession(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const token = requireToken(params.sessionToken, "Session token");
  const session = await getExternalSessionRecord(token);
  if (!session) return;
  if (session.user.brandId !== brand.brandId) {
    throw new ExternalAuthServiceError(401, "Unauthorized");
  }
  await deleteExternalSession(token);
}

export async function verifyExternalEmail(params: {
  brandKey: string;
  publicOrigin: string;
  token: unknown;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const rawToken = requireToken(params.token, "Token");
  const tokenHash = sha256(rawToken);

  const record = await prisma.externalEmailVerificationToken.findFirst({
    where: {
      brandId: brand.brandId,
      token: { in: [rawToken, tokenHash] },
    },
  });

  if (!record) {
    throw new ExternalAuthServiceError(404, "Verification token not found");
  }

  if (record.expires.getTime() <= Date.now()) {
    await prisma.externalEmailVerificationToken.deleteMany({
      where: { brandId: brand.brandId, identifier: record.identifier },
    });
    throw new ExternalAuthServiceError(404, "Verification token not found");
  }

  const email = normalizeEmail(record.identifier);
  if (!email) {
    throw new ExternalAuthServiceError(400, "Verification token is invalid");
  }

  await prisma.$transaction([
    prisma.externalUser.updateMany({
      where: {
        brandId: brand.brandId,
        email,
      },
      data: {
        emailVerified: new Date(),
        status: ExternalUserStatus.ACTIVE,
      },
    }),
    prisma.externalEmailVerificationToken.delete({
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

export async function requestExternalPasswordReset(params: {
  brandKey: string;
  publicOrigin: string;
  email: unknown;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const emailConfig = await resolveBrandEmailRuntimeConfig(brand, "auth");

  if (typeof params.email !== "string") {
    return { ok: true as const };
  }

  const email = normalizeEmail(params.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: true as const };
  }

  const user = await findExternalUserByBrandAndEmail(brand.brandId, email);
  if (!user || user.status === ExternalUserStatus.BLOCKED) {
    return { ok: true as const };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.$transaction([
    prisma.externalPasswordResetToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: email,
      },
    }),
    prisma.externalPasswordResetToken.create({
      data: {
        brandId: brand.brandId,
        identifier: email,
        token: tokenHash,
        expires,
      },
    }),
  ]);

  await sendPasswordResetEmail({
    config: emailConfig,
    brand,
    email,
    token: rawToken,
    expires,
  });

  return { ok: true as const };
}

export async function resetExternalPassword(params: {
  brandKey: string;
  publicOrigin: string;
  token: unknown;
  password: unknown;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const rawToken = requireToken(params.token, "Token");
  const password = requirePassword(params.password);
  const tokenHash = sha256(rawToken);

  const record = await prisma.externalPasswordResetToken.findFirst({
    where: {
      brandId: brand.brandId,
      token: { in: [rawToken, tokenHash] },
    },
  });

  if (!record) {
    throw new ExternalAuthServiceError(404, "Password reset token not found");
  }

  if (record.expires.getTime() <= Date.now()) {
    await prisma.externalPasswordResetToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: record.identifier,
      },
    });
    throw new ExternalAuthServiceError(404, "Password reset token not found");
  }

  const email = normalizeEmail(record.identifier);
  const user = email ? await findExternalUserByBrandAndEmail(brand.brandId, email) : null;
  if (!user) {
    throw new ExternalAuthServiceError(404, "Password reset token not found");
  }

  if (user.status === ExternalUserStatus.BLOCKED) {
    throw new ExternalAuthServiceError(422, "Blocked accounts cannot reset their password");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.externalUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
      },
    }),
    prisma.externalPasswordResetToken.deleteMany({
      where: {
        brandId: brand.brandId,
        identifier: email,
      },
    }),
    prisma.externalSession.deleteMany({
      where: {
        externalUserId: user.id,
      },
    }),
  ]);

  return { ok: true as const };
}

export async function getCurrentExternalAccount(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
}) {
  const state = await getExternalSessionState(params);
  return state.account;
}

export async function updateCurrentExternalAccount(params: {
  brandKey: string;
  publicOrigin: string;
  sessionToken: string;
  name?: unknown;
}) {
  const brand = await requireBrandContext(params.brandKey, params.publicOrigin);
  const token = requireToken(params.sessionToken, "Session token");
  const session = await requireAccessibleSession(brand, token);
  const name = normalizeName(params.name);

  const updated = await prisma.externalUser.update({
    where: { id: session.user.id },
    data: { name },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return toExternalPublicAccount(updated);
}
