#!/usr/bin/env node

const {
  PrismaClient,
  BackofficeRole,
  BackofficeUserStatus,
  BrandStatus,
  ExternalUserStatus,
  UserRole,
  UserStatus,
} = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

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

function usernameSeedFromEmail(email) {
  return normalizeUsernameSeed(String(email || "").split("@")[0] || "");
}

function getBridgeBrandKey() {
  return normalizeEmail(process.env.BRAND_KEY || "xdragon");
}

async function buildUniqueBackofficeUsername(tx, preferred) {
  const base = normalizeUsernameSeed(preferred) || "staff";
  let candidate = base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const existing = await tx.backofficeUser.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
  }

  throw new Error("Unable to allocate a unique backoffice username");
}

async function listActiveBrands(tx) {
  return tx.brand.findMany({
    where: { status: { not: BrandStatus.DISABLED } },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, brandKey: true, name: true, status: true },
  });
}

async function loadLegacyUsers() {
  return prisma.user.findMany({
    where: {
      email: { not: null },
      passwordHash: { not: null },
      emailVerified: { not: null },
    },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      status: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      externalUsers: {
        select: {
          id: true,
          brandId: true,
          email: true,
          legacyUserId: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

function mapStatus(value) {
  return value === UserStatus.BLOCKED ? "BLOCKED" : "ACTIVE";
}

function selectAuditRow(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    legacyExternalCount: user.externalUsers.length,
    createdAt: user.createdAt,
  };
}

async function main() {
  const bridgeBrandKey = getBridgeBrandKey();
  const [bridgeBrand, activeBrands, legacyUsers] = await Promise.all([
    prisma.brand.findUnique({
      where: { brandKey: bridgeBrandKey },
      select: { id: true, brandKey: true, name: true, status: true },
    }),
    listActiveBrands(prisma),
    loadLegacyUsers(),
  ]);

  const eligibleLegacyAdmins = legacyUsers.filter((user) => user.role === UserRole.ADMIN);

  const existingBackofficeEmails = new Set(
    (
      await prisma.backofficeUser.findMany({
        where: { email: { not: null } },
        select: { email: true },
      })
    )
      .map((row) => normalizeEmail(row.email))
      .filter(Boolean)
  );

  const orphanLegacyAdmins = eligibleLegacyAdmins.filter(
    (user) => !existingBackofficeEmails.has(normalizeEmail(user.email))
  );

  const eligibleLegacyExternals = legacyUsers.filter((user) => user.status !== UserStatus.BLOCKED || user.emailVerified);
  const orphanLegacyExternals = eligibleLegacyExternals.filter((user) => user.externalUsers.length === 0);
  const relinkableLegacyExternals = eligibleLegacyExternals.filter((user) =>
    user.externalUsers.some((externalUser) => !externalUser.legacyUserId)
  );

  const summary = {
    mode: APPLY ? "apply" : "status",
    bridgeBrand: bridgeBrand
      ? {
          id: bridgeBrand.id,
          brandKey: bridgeBrand.brandKey,
          name: bridgeBrand.name,
          status: bridgeBrand.status,
        }
      : null,
    activeBrandCount: activeBrands.length,
    legacyUserCount: legacyUsers.length,
    eligibleLegacyAdminCount: eligibleLegacyAdmins.length,
    orphanLegacyAdminCount: orphanLegacyAdmins.length,
    eligibleLegacyExternalCount: eligibleLegacyExternals.length,
    orphanLegacyExternalCount: orphanLegacyExternals.length,
    relinkableLegacyExternalCount: relinkableLegacyExternals.length,
    orphanLegacyAdmins: orphanLegacyAdmins.map(selectAuditRow),
    orphanLegacyExternals: orphanLegacyExternals.map(selectAuditRow),
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!bridgeBrand) {
    throw new Error(`No brand exists for BRAND_KEY=${bridgeBrandKey}; run the brand sync first.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    let createdBackofficeUsers = 0;
    let createdExternalUsers = 0;
    let linkedExternalUsers = 0;

    for (const legacy of orphanLegacyAdmins) {
      const email = normalizeEmail(legacy.email);
      const username = await buildUniqueBackofficeUsername(
        tx,
        usernameSeedFromEmail(email) || normalizeUsernameSeed(legacy.name || "") || "staff"
      );

      const role = BackofficeRole.SUPERADMIN;
      const created = await tx.backofficeUser.create({
        data: {
          username,
          email,
          passwordHash: legacy.passwordHash,
          role,
          status: mapStatus(legacy.status) === "BLOCKED" ? BackofficeUserStatus.BLOCKED : BackofficeUserStatus.ACTIVE,
          createdAt: legacy.createdAt,
          lastLoginAt: legacy.lastLoginAt,
          lastSelectedBrandKey: role === BackofficeRole.STAFF ? activeBrands[0]?.brandKey || null : null,
        },
      });

      if (role === BackofficeRole.STAFF && activeBrands.length > 0) {
        await tx.backofficeUserBrandAccess.createMany({
          data: activeBrands.map((brand) => ({
            userId: created.id,
            brandId: brand.id,
          })),
          skipDuplicates: true,
        });
      }

      createdBackofficeUsers += 1;
    }

    for (const legacy of eligibleLegacyExternals) {
      const email = normalizeEmail(legacy.email);
      if (!email) continue;

      const existing = await tx.externalUser.findFirst({
        where: {
          brandId: bridgeBrand.id,
          email,
        },
        select: {
          id: true,
          legacyUserId: true,
        },
      });

      if (existing) {
        if (!existing.legacyUserId) {
          await tx.externalUser.update({
            where: { id: existing.id },
            data: { legacyUserId: legacy.id },
          });
          linkedExternalUsers += 1;
        }
        continue;
      }

      await tx.externalUser.create({
        data: {
          brandId: bridgeBrand.id,
          legacyUserId: legacy.id,
          email,
          name: legacy.name || null,
          passwordHash: legacy.passwordHash,
          emailVerified: legacy.emailVerified,
          status: mapStatus(legacy.status) === "BLOCKED" ? ExternalUserStatus.BLOCKED : ExternalUserStatus.ACTIVE,
          createdAt: legacy.createdAt,
          lastLoginAt: legacy.lastLoginAt,
        },
      });

      createdExternalUsers += 1;
    }

    return {
      createdBackofficeUsers,
      createdExternalUsers,
      linkedExternalUsers,
    };
  });

  console.log(
    JSON.stringify(
      {
        ...summary,
        result,
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
