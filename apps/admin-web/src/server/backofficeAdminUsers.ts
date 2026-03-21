import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  BackofficeRole,
  BackofficeUserStatus,
  BrandStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  MIN_BACKOFFICE_PASSWORD_LENGTH,
  deriveBackofficeMfaState,
  isProtectedBackofficeIdentity,
  type BackofficeMfaState,
} from "@command/core-auth-backoffice";

const BACKOFFICE_RESET_TOKEN_BYTES = 32;
const BACKOFFICE_INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const BACKOFFICE_RESET_TTL_MS = 30 * 60 * 1000;

type ManagedBackofficeUserPayload = Prisma.BackofficeUserGetPayload<{
  include: {
    brandAccesses: {
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

type BrandAccessRecord = {
  id: string;
  brandKey: string;
  name: string;
  status: BrandStatus;
};

export type ManagedBackofficeUserRecord = {
  id: string;
  username: string;
  email: string | null;
  role: BackofficeRole;
  status: BackofficeUserStatus;
  mfaMethod: "AUTHENTICATOR_APP" | null;
  mfaState: BackofficeMfaState;
  mfaEnabledAt: string | null;
  mfaRecoveryCodesGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  brandAccessCount: number;
  brandAccesses: BrandAccessRecord[];
  brandIds: string[];
  brandKeys: string[];
  brandNames: string[];
  protected: boolean;
};

export type ManagedBackofficePasswordLink = {
  kind: "invite" | "reset";
  url: string;
  expiresAt: string;
  userId: string;
  username: string;
  email: string | null;
};

type StaffUserInput = {
  username?: unknown;
  email?: unknown;
  role?: unknown;
  password?: unknown;
  brandIds?: unknown;
};

function normalizeUsername(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOptionalEmail(value: unknown): string | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized || null;
}

function normalizeBrandIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

function parseRole(value: unknown): BackofficeRole {
  if (value === BackofficeRole.SUPERADMIN || value === "SUPERADMIN") return BackofficeRole.SUPERADMIN;
  if (value === BackofficeRole.STAFF || value === "STAFF") return BackofficeRole.STAFF;
  throw new Error("Role must be SUPERADMIN or STAFF");
}

function isValidPassword(password: string) {
  return password.length >= MIN_BACKOFFICE_PASSWORD_LENGTH;
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomPassword(length = 32) {
  return crypto.randomBytes(length).toString("base64url");
}

function toManagedBackofficeUserRecord(user: ManagedBackofficeUserPayload): ManagedBackofficeUserRecord {
  const brandAccesses = user.brandAccesses
    .map((access) => access.brand)
    .filter((brand): brand is BrandAccessRecord => Boolean(brand));

  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    role: user.role,
    status: user.status,
    mfaMethod: user.mfaMethod || null,
    mfaState: deriveBackofficeMfaState({
      mfaMethod: user.mfaMethod,
      mfaEnabledAt: user.mfaEnabledAt,
      mfaSecretEncrypted: user.mfaSecretEncrypted,
      mfaRecoveryCodesEncrypted: user.mfaRecoveryCodesEncrypted,
    }),
    mfaEnabledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
    mfaRecoveryCodesGeneratedAt: user.mfaRecoveryCodesGeneratedAt ? user.mfaRecoveryCodesGeneratedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    brandAccessCount: brandAccesses.length,
    brandAccesses,
    brandIds: brandAccesses.map((brand) => brand.id),
    brandKeys: brandAccesses.map((brand) => brand.brandKey),
    brandNames: brandAccesses.map((brand) => brand.name),
    protected: isProtectedBackofficeIdentity(user.email, user.username),
  };
}

async function findManagedBackofficeUserById(id: string): Promise<ManagedBackofficeUserPayload | null> {
  return prisma.backofficeUser.findUnique({
    where: { id },
    include: {
      brandAccesses: {
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

async function ensureUniqueUsername(username: string, excludeId?: string) {
  const existing = await prisma.backofficeUser.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existing && existing.id !== excludeId) {
    throw new Error("That username is already in use");
  }
}

async function ensureUniqueEmail(email: string | null, excludeId?: string) {
  if (!email) return;

  const existing = await prisma.backofficeUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing && existing.id !== excludeId) {
    throw new Error("That email is already in use");
  }
}

async function resolveAllowedBrandRecords(brandIds: string[]) {
  if (brandIds.length === 0) return [];

  const brands = await prisma.brand.findMany({
    where: {
      id: { in: brandIds },
      status: { not: BrandStatus.DISABLED },
    },
    select: {
      id: true,
      brandKey: true,
    },
  });

  if (brands.length !== brandIds.length) {
    throw new Error("One or more brand assignments are invalid or disabled");
  }

  return brandIds
    .map((id) => brands.find((brand) => brand.id === id))
    .filter((brand): brand is { id: string; brandKey: string } => Boolean(brand));
}

async function ensureNotLastActiveSuperadmin(
  user: ManagedBackofficeUserPayload,
  nextRole?: BackofficeRole,
  nextStatus?: BackofficeUserStatus
) {
  const resultingRole = nextRole || user.role;
  const resultingStatus = nextStatus || user.status;
  const removesSuperadminAccess =
    user.role === BackofficeRole.SUPERADMIN &&
    (resultingRole !== BackofficeRole.SUPERADMIN || resultingStatus !== BackofficeUserStatus.ACTIVE);

  if (!removesSuperadminAccess) return;

  const otherActiveSuperadminCount = await prisma.backofficeUser.count({
    where: {
      id: { not: user.id },
      role: BackofficeRole.SUPERADMIN,
      status: BackofficeUserStatus.ACTIVE,
    },
  });

  if (otherActiveSuperadminCount === 0) {
    throw new Error("You must keep at least one active superadmin account");
  }
}

async function persistBrandAssignments(
  tx: Prisma.TransactionClient,
  userId: string,
  role: BackofficeRole,
  brandIds: string[],
  fallbackBrandKey: string | null
) {
  await tx.backofficeUserBrandAccess.deleteMany({
    where: { userId },
  });

  if (role === BackofficeRole.STAFF && brandIds.length > 0) {
    await tx.backofficeUserBrandAccess.createMany({
      data: brandIds.map((brandId) => ({
        userId,
        brandId,
      })),
      skipDuplicates: true,
    });
  }

  await tx.backofficeUser.update({
    where: { id: userId },
    data: {
      lastSelectedBrandKey: role === BackofficeRole.STAFF ? fallbackBrandKey : null,
    },
  });
}

export async function listManagedBackofficeUsers(allowedBrandIds?: string[]): Promise<ManagedBackofficeUserRecord[]> {
  const scopedBrandIds = Array.isArray(allowedBrandIds)
    ? Array.from(new Set(allowedBrandIds.filter(Boolean)))
    : null;

  if (scopedBrandIds && scopedBrandIds.length === 0) {
    return [];
  }

  const users = await prisma.backofficeUser.findMany({
    where:
      scopedBrandIds && scopedBrandIds.length > 0
        ? {
            brandAccesses: {
              some: {
                brandId: {
                  in: scopedBrandIds,
                },
              },
            },
          }
        : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      brandAccesses: {
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

  return users.map(toManagedBackofficeUserRecord);
}

export async function getManagedBackofficeUser(id: string): Promise<ManagedBackofficeUserRecord | null> {
  const user = await findManagedBackofficeUserById(id);
  return user ? toManagedBackofficeUserRecord(user) : null;
}

export async function createManagedBackofficeUser(input: StaffUserInput): Promise<ManagedBackofficeUserRecord> {
  const username = normalizeUsername(input.username);
  const email = normalizeOptionalEmail(input.email);
  const requestedRole = parseRole(input.role || BackofficeRole.STAFF);
  const role = isProtectedBackofficeIdentity(email, username) ? BackofficeRole.SUPERADMIN : requestedRole;
  const password = String(input.password || "");
  const requestedBrandIds = normalizeBrandIds(input.brandIds);

  if (!username) throw new Error("Username is required");
  if (!isValidPassword(password)) {
    throw new Error(`Password must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters`);
  }

  await ensureUniqueUsername(username);
  await ensureUniqueEmail(email);

  const brands = role === BackofficeRole.STAFF ? await resolveAllowedBrandRecords(requestedBrandIds) : [];
  if (role === BackofficeRole.STAFF && brands.length === 0) {
    throw new Error("Staff accounts must be assigned to at least one brand");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.backofficeUser.create({
      data: {
        username,
        email,
        passwordHash,
        role,
        status: BackofficeUserStatus.ACTIVE,
        lastSelectedBrandKey: role === BackofficeRole.STAFF ? brands[0]?.brandKey || null : null,
      },
      include: {
        brandAccesses: {
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

    if (role === BackofficeRole.STAFF && brands.length > 0) {
      await tx.backofficeUserBrandAccess.createMany({
        data: brands.map((brand) => ({
          userId: user.id,
          brandId: brand.id,
        })),
        skipDuplicates: true,
      });
    }

    const reloaded = await tx.backofficeUser.findUnique({
      where: { id: user.id },
      include: {
        brandAccesses: {
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

    if (!reloaded) throw new Error("Failed to load created staff account");
    return reloaded;
  });

  return toManagedBackofficeUserRecord(created);
}

export async function createManagedBackofficeInvite(input: StaffUserInput): Promise<ManagedBackofficeUserRecord> {
  const username = normalizeUsername(input.username);
  const email = normalizeOptionalEmail(input.email);
  const requestedRole = parseRole(input.role || BackofficeRole.STAFF);
  const role = isProtectedBackofficeIdentity(email, username) ? BackofficeRole.SUPERADMIN : requestedRole;
  const requestedBrandIds = normalizeBrandIds(input.brandIds);

  if (!username) throw new Error("Username is required");

  await ensureUniqueUsername(username);
  await ensureUniqueEmail(email);

  const brands = role === BackofficeRole.STAFF ? await resolveAllowedBrandRecords(requestedBrandIds) : [];
  if (role === BackofficeRole.STAFF && brands.length === 0) {
    throw new Error("Staff accounts must be assigned to at least one brand");
  }

  const passwordHash = await bcrypt.hash(randomPassword(), 12);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.backofficeUser.create({
      data: {
        username,
        email,
        passwordHash,
        role,
        status: BackofficeUserStatus.ACTIVE,
        lastSelectedBrandKey: role === BackofficeRole.STAFF ? brands[0]?.brandKey || null : null,
      },
      include: {
        brandAccesses: {
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

    if (role === BackofficeRole.STAFF && brands.length > 0) {
      await tx.backofficeUserBrandAccess.createMany({
        data: brands.map((brand) => ({
          userId: user.id,
          brandId: brand.id,
        })),
        skipDuplicates: true,
      });
    }

    const reloaded = await tx.backofficeUser.findUnique({
      where: { id: user.id },
      include: {
        brandAccesses: {
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

    if (!reloaded) throw new Error("Failed to load created staff account");
    return reloaded;
  });

  return toManagedBackofficeUserRecord(created);
}

export async function updateManagedBackofficeUser(
  actorId: string,
  userId: string,
  input: StaffUserInput
): Promise<ManagedBackofficeUserRecord> {
  const existing = await findManagedBackofficeUserById(userId);
  if (!existing) throw new Error("Staff account not found");

  const username = normalizeUsername(input.username ?? existing.username);
  const email = normalizeOptionalEmail(input.email ?? existing.email);
  const requestedRole = parseRole(input.role || existing.role);
  const password = String(input.password || "");
  const requestedBrandIds =
    input.brandIds === undefined ? existing.brandAccesses.map((access) => access.brand.id) : normalizeBrandIds(input.brandIds);

  if (!username) throw new Error("Username is required");
  await ensureUniqueUsername(username, existing.id);
  await ensureUniqueEmail(email, existing.id);

  const isSelf = actorId === existing.id;
  const isProtected = isProtectedBackofficeIdentity(existing.email, existing.username);
  const role = isProtected ? BackofficeRole.SUPERADMIN : requestedRole;

  if (isSelf && role !== existing.role) {
    throw new Error("You cannot change your own role");
  }

  if (isProtected && requestedRole !== BackofficeRole.SUPERADMIN) {
    throw new Error("Protected bootstrap account must remain SUPERADMIN");
  }

  if (isProtected && email !== (existing.email || null)) {
    throw new Error("Protected admin email addresses cannot be changed");
  }

  await ensureNotLastActiveSuperadmin(existing, role, existing.status);

  const brands = role === BackofficeRole.STAFF ? await resolveAllowedBrandRecords(requestedBrandIds) : [];
  if (role === BackofficeRole.STAFF && brands.length === 0) {
    throw new Error("Staff accounts must be assigned to at least one brand");
  }

  const passwordHash = password
    ? isValidPassword(password)
      ? await bcrypt.hash(password, 12)
      : (() => {
          throw new Error(`Password must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters`);
        })()
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.backofficeUser.update({
      where: { id: existing.id },
      data: {
        username,
        email,
        role,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    await persistBrandAssignments(
      tx,
      existing.id,
      role,
      brands.map((brand) => brand.id),
      role === BackofficeRole.STAFF ? brands[0]?.brandKey || null : null
    );

    const reloaded = await tx.backofficeUser.findUnique({
      where: { id: existing.id },
      include: {
        brandAccesses: {
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

    if (!reloaded) throw new Error("Failed to load updated staff account");
    return reloaded;
  });

  return toManagedBackofficeUserRecord(updated);
}

export async function setManagedBackofficeUserStatus(
  actorId: string,
  userId: string,
  nextStatus: BackofficeUserStatus
): Promise<ManagedBackofficeUserRecord> {
  const existing = await findManagedBackofficeUserById(userId);
  if (!existing) throw new Error("Staff account not found");

  if (actorId === existing.id) {
    throw new Error("You cannot change your own status");
  }

  if (isProtectedBackofficeIdentity(existing.email, existing.username) && nextStatus === BackofficeUserStatus.BLOCKED) {
    throw new Error("Protected admin accounts cannot be blocked");
  }

  await ensureNotLastActiveSuperadmin(existing, existing.role, nextStatus);

  const updated = await prisma.backofficeUser.update({
    where: { id: existing.id },
    data: { status: nextStatus },
    include: {
      brandAccesses: {
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

  return toManagedBackofficeUserRecord(updated);
}

export async function deleteManagedBackofficeUser(actorId: string, userId: string) {
  const existing = await findManagedBackofficeUserById(userId);
  if (!existing) throw new Error("Staff account not found");

  if (actorId === existing.id) {
    throw new Error("You cannot delete your own account");
  }

  if (isProtectedBackofficeIdentity(existing.email, existing.username)) {
    throw new Error("Protected admin accounts cannot be deleted");
  }

  await ensureNotLastActiveSuperadmin(existing, BackofficeRole.STAFF, BackofficeUserStatus.BLOCKED);

  await prisma.backofficeUser.delete({
    where: { id: existing.id },
  });
}

export async function createManagedBackofficePasswordLink(
  userId: string,
  kind: "invite" | "reset",
  baseUrl: string
): Promise<ManagedBackofficePasswordLink> {
  const user = await prisma.backofficeUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      status: true,
    },
  });

  if (!user) throw new Error("Staff account not found");
  if (user.status === BackofficeUserStatus.BLOCKED) {
    throw new Error("Blocked staff accounts cannot receive password links");
  }

  const rawToken = crypto.randomBytes(BACKOFFICE_RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + (kind === "invite" ? BACKOFFICE_INVITE_TTL_MS : BACKOFFICE_RESET_TTL_MS));

  await prisma.backofficePasswordResetToken.deleteMany({
    where: { identifier: user.id },
  });

  await prisma.backofficePasswordResetToken.create({
    data: {
      identifier: user.id,
      token: tokenHash,
      expires: expiresAt,
    },
  });

  const url = `${baseUrl}/admin/reset-password?id=${encodeURIComponent(user.id)}&token=${rawToken}`;

  return {
    kind,
    url,
    expiresAt: expiresAt.toISOString(),
    userId: user.id,
    username: user.username,
    email: user.email || null,
  };
}

export async function resetManagedBackofficeUserMfa(userId: string): Promise<ManagedBackofficeUserRecord> {
  const existing = await findManagedBackofficeUserById(userId);
  if (!existing) throw new Error("Staff account not found");

  const updated = await prisma.backofficeUser.update({
    where: { id: existing.id },
    data: {
      mfaMethod: null,
      mfaEnabledAt: null,
      mfaSecretEncrypted: null,
      mfaRecoveryCodesEncrypted: null,
      mfaRecoveryCodesGeneratedAt: null,
    },
    include: {
      brandAccesses: {
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

  return toManagedBackofficeUserRecord(updated);
}

export async function consumeManagedBackofficePasswordReset(input: {
  userId?: unknown;
  token?: unknown;
  password?: unknown;
}) {
  const userId = String(input.userId || "").trim();
  const rawToken = String(input.token || "").trim();
  const password = String(input.password || "");

  if (!userId || !rawToken) {
    throw new Error("Missing user id or token");
  }

  if (!isValidPassword(password)) {
    throw new Error(`Password must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters`);
  }

  const tokenHash = sha256(rawToken);

  const record = await prisma.backofficePasswordResetToken.findFirst({
    where: {
      identifier: userId,
      token: tokenHash,
    },
  });

  if (!record) throw new Error("Invalid or expired token");

  if (record.expires.getTime() < Date.now()) {
    await prisma.backofficePasswordResetToken.deleteMany({
      where: { identifier: userId },
    });
    throw new Error("Invalid or expired token");
  }

  const user = await prisma.backofficeUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!user) throw new Error("Invalid or expired token");
  if (user.status === BackofficeUserStatus.BLOCKED) throw new Error("Account blocked");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.backofficeUser.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.backofficePasswordResetToken.deleteMany({
      where: { identifier: userId },
    }),
  ]);
}
