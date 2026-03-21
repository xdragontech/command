#!/usr/bin/env node

const bcrypt = require("bcryptjs");
const {
  PrismaClient,
  BackofficeRole,
  BackofficeUserStatus,
} = require("@prisma/client");
const bootstrapConfig = require("../config/backoffice-bootstrap.json");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const RECOVER = process.argv.includes("--recover");
const CLEAR_MFA = process.argv.includes("--clear-mfa");
const MIN_PASSWORD_LENGTH = 10;

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeUsernameSeed(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

const PROTECTED_EMAIL = normalizeEmail(bootstrapConfig.protectedEmail || "grant@xdragon.tech");
const PASSWORD_ENV_KEY = String(bootstrapConfig.passwordEnvKey || "BACKOFFICE_BOOTSTRAP_PASSWORD")
  .trim()
  .toUpperCase();
const DEFAULT_USERNAME = normalizeUsernameSeed(String(PROTECTED_EMAIL || "").split("@")[0] || "") || "grant";

function getBootstrapPassword() {
  return String(process.env[PASSWORD_ENV_KEY] || "").trim();
}

function ensurePasswordIsUsable(password) {
  if (!password) {
    throw new Error(`${PASSWORD_ENV_KEY} is required for this operation.`);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`${PASSWORD_ENV_KEY} must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  return password;
}

async function loadConfiguredBrands(client) {
  return client.brand.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      brandKey: true,
      name: true,
      status: true,
    },
  });
}

async function loadBootstrapUser(client) {
  return client.backofficeUser.findUnique({
    where: { email: PROTECTED_EMAIL },
    include: {
      brandAccesses: {
        select: {
          brandId: true,
        },
      },
    },
  });
}

async function ensureUsernameAvailable(tx) {
  const existing = await tx.backofficeUser.findUnique({
    where: { username: DEFAULT_USERNAME },
    select: {
      id: true,
      email: true,
    },
  });

  if (existing && normalizeEmail(existing.email) !== PROTECTED_EMAIL) {
    throw new Error(
      `Cannot create bootstrap superadmin because username '${DEFAULT_USERNAME}' is already used by ${existing.email || existing.id}.`
    );
  }
}

function selectUserSnapshot(user, allBrands) {
  if (!user) return null;

  const assignedBrandIds = new Set(user.brandAccesses.map((access) => access.brandId));
  const missingBrandKeys = allBrands
    .filter((brand) => !assignedBrandIds.has(brand.id))
    .map((brand) => brand.brandKey);
  const mfaState = user.mfaMethod ? (user.mfaEnabledAt ? "ENABLED" : "PENDING") : "DISABLED";

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    lastSelectedBrandKey: user.lastSelectedBrandKey,
    mfaEnabled: Boolean(user.mfaEnabledAt),
    mfaState,
    mfaMethod: user.mfaMethod || null,
    brandAccessCount: user.brandAccesses.length,
    missingBrandAccessKeys: missingBrandKeys,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function buildSummary(user, allBrands) {
  const allBrandKeys = allBrands.map((brand) => brand.brandKey);
  const activeBrandKeys = allBrands.filter((brand) => brand.status === "ACTIVE").map((brand) => brand.brandKey);
  const snapshot = selectUserSnapshot(user, allBrands);

  return {
    mode: APPLY ? (RECOVER ? "recover" : "ensure") : "status",
    protectedEmail: PROTECTED_EMAIL,
    defaultUsername: DEFAULT_USERNAME,
    passwordEnvKey: PASSWORD_ENV_KEY,
    passwordPresent: Boolean(getBootstrapPassword()),
    configuredBrandCount: allBrands.length,
    activeBrandCount: activeBrandKeys.length,
    configuredBrandKeys: allBrandKeys,
    activeBrandKeys,
    bootstrapUserExists: Boolean(user),
    bootstrapUser: snapshot,
    drift: {
      missingUser: !user,
      roleMismatch: Boolean(user && user.role !== BackofficeRole.SUPERADMIN),
      statusMismatch: Boolean(user && user.status !== BackofficeUserStatus.ACTIVE),
      missingBrandAccessKeys: snapshot?.missingBrandAccessKeys || allBrandKeys,
      mfaEnabled: Boolean(user?.mfaEnabledAt),
      mfaPending: Boolean(user?.mfaMethod && !user?.mfaEnabledAt),
    },
  };
}

async function main() {
  if (CLEAR_MFA && !RECOVER) {
    throw new Error("--clear-mfa may only be used together with --recover");
  }

  const allBrands = await loadConfiguredBrands(prisma);
  const existingUser = await loadBootstrapUser(prisma);
  const summary = buildSummary(existingUser, allBrands);

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (allBrands.length === 0) {
    throw new Error("No brands are configured. Run the brand bootstrap before ensuring the bootstrap superadmin.");
  }

  const password = RECOVER || !existingUser ? ensurePasswordIsUsable(getBootstrapPassword()) : null;
  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  const applied = await prisma.$transaction(async (tx) => {
    let user = await loadBootstrapUser(tx);

    if (!user) {
      await ensureUsernameAvailable(tx);

      user = await tx.backofficeUser.create({
        data: {
          username: DEFAULT_USERNAME,
          email: PROTECTED_EMAIL,
          passwordHash: passwordHash,
          role: BackofficeRole.SUPERADMIN,
          status: BackofficeUserStatus.ACTIVE,
          lastSelectedBrandKey: null,
        },
        include: {
          brandAccesses: {
            select: {
              brandId: true,
            },
          },
        },
      });
    } else {
      const update = {};

      if (user.role !== BackofficeRole.SUPERADMIN) {
        update.role = BackofficeRole.SUPERADMIN;
      }

      if (user.status !== BackofficeUserStatus.ACTIVE) {
        update.status = BackofficeUserStatus.ACTIVE;
      }

      if (passwordHash) {
        update.passwordHash = passwordHash;
      }

      if (CLEAR_MFA) {
        update.mfaMethod = null;
        update.mfaEnabledAt = null;
        update.mfaSecretEncrypted = null;
        update.mfaRecoveryCodesEncrypted = null;
        update.mfaRecoveryCodesGeneratedAt = null;
      }

      if (Object.keys(update).length > 0) {
        user = await tx.backofficeUser.update({
          where: { id: user.id },
          data: update,
          include: {
            brandAccesses: {
              select: {
                brandId: true,
              },
            },
          },
        });
      }
    }

    await tx.backofficeUserBrandAccess.createMany({
      data: unique(allBrands.map((brand) => brand.id)).map((brandId) => ({
        userId: user.id,
        brandId,
      })),
      skipDuplicates: true,
    });

    if (RECOVER) {
      await tx.backofficePasswordResetToken.deleteMany({
        where: {
          identifier: PROTECTED_EMAIL,
        },
      });
    }

    const reloaded = await loadBootstrapUser(tx);
    if (!reloaded) {
      throw new Error("Failed to reload the bootstrap superadmin after apply.");
    }

    return reloaded;
  });

  console.log(
    JSON.stringify(
      {
        ...summary,
        applied: selectUserSnapshot(applied, allBrands),
        recovered: RECOVER,
        clearedMfa: CLEAR_MFA,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
