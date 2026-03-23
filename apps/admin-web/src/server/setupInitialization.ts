import bcrypt from "bcryptjs";
import {
  BackofficeRole,
  BackofficeUserStatus,
  BrandEmailConfigStatus,
  BrandStatus,
  type Prisma,
} from "@prisma/client";
import { MIN_BACKOFFICE_PASSWORD_LENGTH } from "@command/core-auth-backoffice";
import { prisma } from "@command/core-db";
import { saveEditableBrandWithClient } from "@command/core-brand-runtime";
import { getProtectedBackofficeEmail } from "@command/core-config";
import { INSTALL_PROFILE_ID, collectSetupPrerequisites } from "./installState";
import { getConfiguredSetupAccessPassword } from "./setupAccess";

type SetupInitializationInput = {
  displayName: string;
  brandKey: string;
  brandName: string;
  apexHost: string;
  productionPublicHost: string;
  productionAdminHost: string;
  previewPublicHost: string;
  previewAdminHost: string;
  emailStatus: BrandEmailConfigStatus;
  providerSecretRef: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  supportEmail: string;
};

export type SetupInitializationResult = {
  installDisplayName: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  bootstrapEmail: string;
  redirectTo: string;
};

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeEmailStatus(value: unknown): BrandEmailConfigStatus {
  const normalized = String(value || BrandEmailConfigStatus.INACTIVE)
    .trim()
    .toUpperCase() as BrandEmailConfigStatus;

  if (!Object.values(BrandEmailConfigStatus).includes(normalized)) {
    throw new Error("Email status must be ACTIVE or INACTIVE");
  }

  return normalized;
}

function ensureRequired(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} is required`);
  }
}

function deriveBootstrapUsername(email: string): string {
  const seed = String(email.split("@")[0] || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);

  return seed || "bootstrap-admin";
}

function buildSetupInput(raw: any): SetupInitializationInput {
  const displayName = normalizeString(raw?.displayName);
  ensureRequired(displayName, "Install display name");

  return {
    displayName,
    brandKey: normalizeString(raw?.brandKey),
    brandName: normalizeString(raw?.brandName),
    apexHost: normalizeString(raw?.apexHost),
    productionPublicHost: normalizeString(raw?.productionPublicHost),
    productionAdminHost: normalizeString(raw?.productionAdminHost),
    previewPublicHost: normalizeString(raw?.previewPublicHost),
    previewAdminHost: normalizeString(raw?.previewAdminHost),
    emailStatus: normalizeEmailStatus(raw?.emailStatus),
    providerSecretRef: normalizeString(raw?.providerSecretRef || "RESEND_API_KEY"),
    fromName: normalizeString(raw?.fromName),
    fromEmail: normalizeString(raw?.fromEmail),
    replyToEmail: normalizeString(raw?.replyToEmail),
    supportEmail: normalizeString(raw?.supportEmail),
  };
}

function ensureSetupPrerequisites() {
  const missing = collectSetupPrerequisites().filter((item) => item.required && item.status !== "present");
  if (!missing.length) return;

  throw new Error(`Setup prerequisites are missing: ${missing.map((item) => item.label).join(", ")}`);
}

async function loadExistingSetupState(tx: Prisma.TransactionClient, protectedEmail: string) {
  const [profile, brands, users] = await Promise.all([
    tx.installProfile.findUnique({
      where: { id: INSTALL_PROFILE_ID },
      select: {
        id: true,
        setupCompletedAt: true,
      },
    }),
    tx.brand.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        brandKey: true,
      },
    }),
    tx.backofficeUser.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        username: true,
      },
    }),
  ]);

  if (profile?.setupCompletedAt) {
    throw new Error("Setup is already complete");
  }

  if (brands.length > 1) {
    throw new Error("Setup cannot continue because more than one brand already exists. Resolve the partial install state first.");
  }

  const protectedUsers = users.filter(
    (user) => String(user.email || "").trim().toLowerCase() === protectedEmail
  );
  const nonProtectedUsers = users.filter(
    (user) => String(user.email || "").trim().toLowerCase() !== protectedEmail
  );

  if (protectedUsers.length > 1) {
    throw new Error("Setup cannot continue because multiple protected bootstrap users already exist.");
  }

  if (nonProtectedUsers.length > 0) {
    throw new Error("Setup cannot continue because non-bootstrap backoffice users already exist.");
  }

  return {
    existingBrandId: brands[0]?.id || null,
    existingBootstrapUser: protectedUsers[0] || null,
  };
}

async function ensureBootstrapUsernameAvailable(
  tx: Prisma.TransactionClient,
  username: string,
  protectedEmail: string,
  existingUserId?: string | null
) {
  const existing = await tx.backofficeUser.findUnique({
    where: { username },
    select: {
      id: true,
      email: true,
    },
  });

  if (!existing) return;
  if (existing.id === existingUserId) return;
  if (String(existing.email || "").trim().toLowerCase() === protectedEmail) return;

  throw new Error(`Cannot create bootstrap superadmin because username '${username}' is already in use.`);
}

async function syncBootstrapUser(
  tx: Prisma.TransactionClient,
  params: {
    protectedEmail: string;
    passwordHash: string;
    brandId: string;
    existingUser: { id: string; username: string; email: string | null } | null;
  }
) {
  const desiredUsername = deriveBootstrapUsername(params.protectedEmail);
  await ensureBootstrapUsernameAvailable(tx, desiredUsername, params.protectedEmail, params.existingUser?.id || null);

  const user =
    params.existingUser
      ? await tx.backofficeUser.update({
          where: { id: params.existingUser.id },
          data: {
            email: params.protectedEmail,
            passwordHash: params.passwordHash,
            role: BackofficeRole.SUPERADMIN,
            status: BackofficeUserStatus.ACTIVE,
            lastSelectedBrandKey: null,
            mfaMethod: null,
            mfaEnabledAt: null,
            mfaSecretEncrypted: null,
            mfaRecoveryCodesEncrypted: null,
            mfaRecoveryCodesGeneratedAt: null,
          },
          select: { id: true },
        })
      : await tx.backofficeUser.create({
          data: {
            username: desiredUsername,
            email: params.protectedEmail,
            passwordHash: params.passwordHash,
            role: BackofficeRole.SUPERADMIN,
            status: BackofficeUserStatus.ACTIVE,
            lastSelectedBrandKey: null,
          },
          select: { id: true },
        });

  await tx.backofficeUserBrandAccess.deleteMany({
    where: { userId: user.id },
  });

  await tx.backofficeUserBrandAccess.create({
    data: {
      userId: user.id,
      brandId: params.brandId,
    },
  });

  return user;
}

export async function initializeInstall(raw: any): Promise<SetupInitializationResult> {
  ensureSetupPrerequisites();

  const input = buildSetupInput(raw);
  const protectedEmail = getProtectedBackofficeEmail();
  const bootstrapPassword = getConfiguredSetupAccessPassword();

  if (bootstrapPassword.length < MIN_BACKOFFICE_PASSWORD_LENGTH) {
    throw new Error(
      `Bootstrap password must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters before setup can continue`
    );
  }

  const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

  return prisma.$transaction(async (tx) => {
    const existing = await loadExistingSetupState(tx, protectedEmail);

    const brand = await saveEditableBrandWithClient(
      tx,
      {
        brandKey: input.brandKey,
        name: input.brandName,
        status: BrandStatus.ACTIVE,
        apexHost: input.apexHost,
        productionPublicHost: input.productionPublicHost,
        productionAdminHost: input.productionAdminHost,
        previewPublicHost: input.previewPublicHost,
        previewAdminHost: input.previewAdminHost,
        emailConfig: {
          status: input.emailStatus,
          providerSecretRef: input.providerSecretRef,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
          replyToEmail: input.replyToEmail,
          supportEmail: input.supportEmail,
        },
      },
      existing.existingBrandId || undefined
    );

    await syncBootstrapUser(tx, {
      protectedEmail,
      passwordHash,
      brandId: brand.id,
      existingUser: existing.existingBootstrapUser,
    });

    await tx.installProfile.upsert({
      where: { id: INSTALL_PROFILE_ID },
      create: {
        id: INSTALL_PROFILE_ID,
        displayName: input.displayName,
        primaryBrandId: brand.id,
        setupCompletedAt: new Date(),
      },
      update: {
        displayName: input.displayName,
        primaryBrandId: brand.id,
        setupCompletedAt: new Date(),
      },
    });

    return {
      installDisplayName: input.displayName,
      brandId: brand.id,
      brandKey: brand.brandKey,
      brandName: brand.name,
      bootstrapEmail: protectedEmail,
      redirectTo: "/admin/signin",
    };
  });
}
