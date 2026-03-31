import bcrypt from "bcryptjs";
import {
  BrandStatus,
  ExternalUserStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@command/core-db";

const MIN_EXTERNAL_PASSWORD_LENGTH = 8;

type ManagedExternalUserPayload = Prisma.ExternalUserGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
        status: true;
      };
    };
    accounts: {
      select: {
        provider: true;
      };
    };
    _count: {
      select: {
        loginEvents: true;
      };
    };
  };
}>;

export type ManagedExternalUserRecord = {
  id: string;
  name: string | null;
  email: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  brandStatus: BrandStatus;
  status: ExternalUserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  providerCount: number;
  providerLabels: string[];
  loginEventCount: number;
  canReassignBrand: boolean;
  brandLockReason: string | null;
};

type ExternalUserInput = {
  name?: unknown;
  email?: unknown;
  brandId?: unknown;
  password?: unknown;
  markEmailVerified?: unknown;
};

function normalizeName(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeBrandId(value: unknown): string {
  return String(value || "").trim();
}

function parseMarkEmailVerified(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function summarizeBrandLock(user: ManagedExternalUserPayload): string | null {
  if (user.accounts.length > 0) return "Provider-linked client accounts cannot be moved between brands.";
  if (user._count.loginEvents > 0 || user.lastLoginAt) {
    return "Client accounts with login history should stay on their current brand.";
  }
  return null;
}

function toManagedExternalUserRecord(user: ManagedExternalUserPayload): ManagedExternalUserRecord {
  const providerLabels = Array.from(
    new Set(
      user.accounts
        .map((account) => String(account.provider || "").trim())
        .filter(Boolean)
    )
  ).sort();
  const brandLockReason = summarizeBrandLock(user);

  return {
    id: user.id,
    name: user.name || null,
    email: user.email || "",
    brandId: user.brandId,
    brandKey: user.brand.brandKey,
    brandName: user.brand.name,
    brandStatus: user.brand.status,
    status: user.status,
    emailVerifiedAt: user.emailVerified ? user.emailVerified.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    providerCount: providerLabels.length,
    providerLabels,
    loginEventCount: user._count.loginEvents,
    canReassignBrand: !brandLockReason,
    brandLockReason,
  };
}

async function findManagedExternalUserById(id: string): Promise<ManagedExternalUserPayload | null> {
  return prisma.externalUser.findUnique({
    where: { id },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
          status: true,
        },
      },
      accounts: {
        select: {
          provider: true,
        },
      },
      _count: {
        select: {
          loginEvents: true,
        },
      },
    },
  });
}

async function resolveBrand(brandId: string) {
  if (!brandId) throw new Error("Brand is required");

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      brandKey: true,
      name: true,
      status: true,
    },
  });

  if (!brand || brand.status === BrandStatus.DISABLED) {
    throw new Error("Selected brand is invalid or disabled");
  }

  return brand;
}

async function ensureUniqueExternalEmail(brandId: string, email: string, excludeId?: string) {
  const existing = await prisma.externalUser.findFirst({
    where: {
      brandId,
      email,
    },
    select: {
      id: true,
    },
  });

  if (existing && existing.id !== excludeId) {
    throw new Error("That email already exists for the selected brand");
  }
}

async function clearBrandScopedTokens(
  tx: Prisma.TransactionClient,
  targets: Array<{ brandId: string; email: string }>
) {
  const deduped = Array.from(
    new Map(
      targets
        .filter((target) => target.brandId && target.email)
        .map((target) => [
          `${target.brandId}::${target.email.toLowerCase()}`,
          {
            brandId: target.brandId,
            email: target.email.toLowerCase(),
          },
        ])
    ).values()
  );

  for (const target of deduped) {
    await tx.externalEmailVerificationToken.deleteMany({
      where: {
        brandId: target.brandId,
        identifier: target.email,
      },
    });

    await tx.externalPasswordResetToken.deleteMany({
      where: {
        brandId: target.brandId,
        identifier: target.email,
      },
    });
  }
}

export async function listManagedExternalUsers(allowedBrandIds?: string[]): Promise<ManagedExternalUserRecord[]> {
  const scopedBrandIds = Array.isArray(allowedBrandIds)
    ? Array.from(new Set(allowedBrandIds.filter(Boolean)))
    : null;

  if (scopedBrandIds && scopedBrandIds.length === 0) {
    return [];
  }

  const users = await prisma.externalUser.findMany({
    where:
      scopedBrandIds && scopedBrandIds.length > 0
        ? {
            brandId: {
              in: scopedBrandIds,
            },
          }
        : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
          status: true,
        },
      },
      accounts: {
        select: {
          provider: true,
        },
      },
      _count: {
        select: {
          loginEvents: true,
        },
      },
    },
  });

  return users.map(toManagedExternalUserRecord);
}

export async function getManagedExternalUser(id: string): Promise<ManagedExternalUserRecord | null> {
  const user = await findManagedExternalUserById(id);
  return user ? toManagedExternalUserRecord(user) : null;
}

export async function createManagedExternalUser(input: ExternalUserInput): Promise<ManagedExternalUserRecord> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const brandId = normalizeBrandId(input.brandId);
  const password = String(input.password || "");
  const markEmailVerified = parseMarkEmailVerified(input.markEmailVerified, true);

  if (!email || !isValidEmail(email)) {
    throw new Error("Valid email is required");
  }

  if (!password || password.length < MIN_EXTERNAL_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_EXTERNAL_PASSWORD_LENGTH} characters`);
  }

  const brand = await resolveBrand(brandId);
  await ensureUniqueExternalEmail(brand.id, email);

  const passwordHash = await bcrypt.hash(password, 12);

  const created = await prisma.externalUser.create({
    data: {
      brandId: brand.id,
      name,
      email,
      passwordHash,
      emailVerified: markEmailVerified ? new Date() : null,
      status: ExternalUserStatus.ACTIVE,
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
      accounts: {
        select: {
          provider: true,
        },
      },
      _count: {
        select: {
          loginEvents: true,
        },
      },
    },
  });

  return toManagedExternalUserRecord(created);
}

export async function updateManagedExternalUser(id: string, input: ExternalUserInput): Promise<ManagedExternalUserRecord> {
  const existing = await findManagedExternalUserById(id);
  if (!existing) throw new Error("Client account not found");

  const nextName = normalizeName(input.name ?? existing.name);
  const nextEmail = normalizeEmail(input.email ?? existing.email);
  const nextBrandId = normalizeBrandId(input.brandId || existing.brandId);
  const password = String(input.password || "");

  if (!nextEmail || !isValidEmail(nextEmail)) {
    throw new Error("Valid email is required");
  }

  const nextBrand = await resolveBrand(nextBrandId);

  if (existing.brandId !== nextBrand.id && summarizeBrandLock(existing)) {
    throw new Error(summarizeBrandLock(existing) || "This client account cannot be moved to another brand");
  }

  await ensureUniqueExternalEmail(nextBrand.id, nextEmail, existing.id);

  const emailChanged = nextEmail !== (existing.email || "").toLowerCase();
  const brandChanged = nextBrand.id !== existing.brandId;

  const passwordHash = password
    ? password.length >= MIN_EXTERNAL_PASSWORD_LENGTH
      ? await bcrypt.hash(password, 12)
      : (() => {
          throw new Error(`Password must be at least ${MIN_EXTERNAL_PASSWORD_LENGTH} characters`);
        })()
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.externalUser.update({
      where: { id: existing.id },
      data: {
        name: nextName,
        email: nextEmail,
        brandId: nextBrand.id,
        ...(passwordHash ? { passwordHash } : {}),
        ...(emailChanged ? { emailVerified: null } : {}),
      },
    });

    if (brandChanged && existing.accounts.length > 0) {
      await tx.externalAccount.updateMany({
        where: {
          externalUserId: existing.id,
        },
        data: {
          brandId: nextBrand.id,
        },
      });
    }

    if (emailChanged || brandChanged) {
      await clearBrandScopedTokens(tx, [
        { brandId: existing.brandId, email: existing.email || "" },
        { brandId: existing.brandId, email: nextEmail },
        { brandId: nextBrand.id, email: existing.email || "" },
        { brandId: nextBrand.id, email: nextEmail },
      ]);
    }

    const reloaded = await tx.externalUser.findUnique({
      where: { id: existing.id },
      include: {
        brand: {
          select: {
            id: true,
            brandKey: true,
            name: true,
            status: true,
          },
        },
        accounts: {
          select: {
            provider: true,
          },
        },
        _count: {
          select: {
            loginEvents: true,
          },
        },
      },
    });

    if (!reloaded) throw new Error("Failed to load updated client account");
    return reloaded;
  });

  return toManagedExternalUserRecord(updated);
}

export async function markManagedExternalUserVerified(id: string): Promise<ManagedExternalUserRecord> {
  const existing = await findManagedExternalUserById(id);
  if (!existing) throw new Error("Client account not found");

  const updated = await prisma.$transaction(async (tx) => {
    await tx.externalUser.update({
      where: { id: existing.id },
      data: {
        emailVerified: new Date(),
        status: ExternalUserStatus.ACTIVE,
      },
    });

    if (existing.email) {
      await tx.externalEmailVerificationToken.deleteMany({
        where: {
          brandId: existing.brandId,
          identifier: existing.email.toLowerCase(),
        },
      });
    }

    const reloaded = await tx.externalUser.findUnique({
      where: { id: existing.id },
      include: {
        brand: {
          select: {
            id: true,
            brandKey: true,
            name: true,
            status: true,
          },
        },
        accounts: {
          select: {
            provider: true,
          },
        },
        _count: {
          select: {
            loginEvents: true,
          },
        },
      },
    });

    if (!reloaded) throw new Error("Failed to load updated client account");
    return reloaded;
  });

  return toManagedExternalUserRecord(updated);
}

export async function setManagedExternalUserStatus(
  id: string,
  nextStatus: ExternalUserStatus
): Promise<ManagedExternalUserRecord> {
  const existing = await findManagedExternalUserById(id);
  if (!existing) throw new Error("Client account not found");

  const updated = await prisma.externalUser.update({
    where: { id: existing.id },
    data: { status: nextStatus },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
          status: true,
        },
      },
      accounts: {
        select: {
          provider: true,
        },
      },
      _count: {
        select: {
          loginEvents: true,
        },
      },
    },
  });

  return toManagedExternalUserRecord(updated);
}

export async function deleteManagedExternalUser(id: string) {
  const existing = await findManagedExternalUserById(id);
  if (!existing) throw new Error("Client account not found");

  await prisma.externalUser.delete({
    where: { id: existing.id },
  });
}
