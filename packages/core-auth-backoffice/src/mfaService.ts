import { BackofficeMfaMethod, BackofficeUserStatus } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  buildAuthenticatorOtpAuthUrl,
  decryptBackofficeMfaValue,
  deriveBackofficeMfaState,
  encryptBackofficeMfaValue,
  generateAuthenticatorSecret,
  generateRecoveryCodes,
  getBackofficeMfaIssuer,
  isBackofficeMfaEncryptionReady,
  type BackofficeMfaState,
  verifyAuthenticatorCode,
} from "./mfa";

export type BackofficeMfaStatus = {
  state: BackofficeMfaState;
  method: BackofficeMfaMethod | null;
  enabledAt: string | null;
  recoveryCodesGeneratedAt: string | null;
  issuer: string;
  encryptionReady: boolean;
  setupSecret: string | null;
  otpAuthUrl: string | null;
  recoveryCodes: string[] | null;
};

export type BackofficeMfaChallengeResult = {
  usedRecoveryCode: boolean;
  recoveryCodesRemaining: number;
};

function normalizeRecoveryCode(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function mapMfaStatus(params: {
  user: {
    username: string;
    email: string | null;
    status: BackofficeUserStatus;
    mfaMethod: BackofficeMfaMethod | null;
    mfaEnabledAt: Date | null;
    mfaSecretEncrypted: string | null;
    mfaRecoveryCodesEncrypted: string | null;
    mfaRecoveryCodesGeneratedAt: Date | null;
  };
  includePendingSecrets?: boolean;
}): BackofficeMfaStatus {
  const { user, includePendingSecrets = false } = params;
  const state = deriveBackofficeMfaState({
    mfaMethod: user.mfaMethod,
    mfaEnabledAt: user.mfaEnabledAt,
    mfaSecretEncrypted: user.mfaSecretEncrypted,
    mfaRecoveryCodesEncrypted: user.mfaRecoveryCodesEncrypted,
  });
  const issuer = getBackofficeMfaIssuer();
  const encryptionReady = isBackofficeMfaEncryptionReady();

  let setupSecret: string | null = null;
  let recoveryCodes: string[] | null = null;

  if (includePendingSecrets && encryptionReady && state === "PENDING" && user.mfaSecretEncrypted) {
    setupSecret = decryptBackofficeMfaValue(user.mfaSecretEncrypted);
    if (user.mfaRecoveryCodesEncrypted) {
      recoveryCodes = JSON.parse(decryptBackofficeMfaValue(user.mfaRecoveryCodesEncrypted));
    }
  }

  return {
    state,
    method: user.mfaMethod,
    enabledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
    recoveryCodesGeneratedAt: user.mfaRecoveryCodesGeneratedAt ? user.mfaRecoveryCodesGeneratedAt.toISOString() : null,
    issuer,
    encryptionReady,
    setupSecret,
    otpAuthUrl: setupSecret ? buildAuthenticatorOtpAuthUrl({ accountName: user.email || user.username, secret: setupSecret, issuer }) : null,
    recoveryCodes,
  };
}

async function getBackofficeMfaUser(userId: string) {
  return prisma.backofficeUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      status: true,
      mfaMethod: true,
      mfaEnabledAt: true,
      mfaSecretEncrypted: true,
      mfaRecoveryCodesEncrypted: true,
      mfaRecoveryCodesGeneratedAt: true,
    },
  });
}

export async function getCurrentBackofficeMfaStatus(userId: string): Promise<BackofficeMfaStatus> {
  const user = await getBackofficeMfaUser(userId);
  if (!user) throw new Error("Backoffice user not found");
  return mapMfaStatus({ user, includePendingSecrets: true });
}

export async function startBackofficeMfaEnrollment(userId: string): Promise<BackofficeMfaStatus> {
  if (!isBackofficeMfaEncryptionReady()) {
    throw new Error("Backoffice MFA encryption is not configured");
  }

  const user = await getBackofficeMfaUser(userId);
  if (!user) throw new Error("Backoffice user not found");
  if (user.status === BackofficeUserStatus.BLOCKED) throw new Error("Blocked staff accounts cannot enroll MFA");

  const secret = generateAuthenticatorSecret();
  const recoveryCodes = generateRecoveryCodes();
  const now = new Date();

  await prisma.backofficeUser.update({
    where: { id: userId },
    data: {
      mfaMethod: BackofficeMfaMethod.AUTHENTICATOR_APP,
      mfaEnabledAt: null,
      mfaSecretEncrypted: encryptBackofficeMfaValue(secret),
      mfaRecoveryCodesEncrypted: encryptBackofficeMfaValue(JSON.stringify(recoveryCodes)),
      mfaRecoveryCodesGeneratedAt: now,
    },
  });

  const updated = await getBackofficeMfaUser(userId);
  if (!updated) throw new Error("Backoffice user not found");
  return mapMfaStatus({ user: updated, includePendingSecrets: true });
}

export async function verifyBackofficeMfaEnrollment(userId: string, code: string): Promise<BackofficeMfaStatus> {
  const user = await getBackofficeMfaUser(userId);
  if (!user) throw new Error("Backoffice user not found");
  if (user.status === BackofficeUserStatus.BLOCKED) throw new Error("Blocked staff accounts cannot enroll MFA");
  if (!user.mfaSecretEncrypted || user.mfaMethod !== BackofficeMfaMethod.AUTHENTICATOR_APP) {
    throw new Error("MFA setup has not been started");
  }

  const secret = decryptBackofficeMfaValue(user.mfaSecretEncrypted);
  if (!verifyAuthenticatorCode({ secret, code })) {
    throw new Error("Invalid authenticator code");
  }

  await prisma.backofficeUser.update({
    where: { id: userId },
    data: {
      mfaMethod: BackofficeMfaMethod.AUTHENTICATOR_APP,
      mfaEnabledAt: new Date(),
    },
  });

  const updated = await getBackofficeMfaUser(userId);
  if (!updated) throw new Error("Backoffice user not found");
  return mapMfaStatus({ user: updated, includePendingSecrets: false });
}

export async function cancelBackofficeMfaEnrollment(userId: string): Promise<BackofficeMfaStatus> {
  const user = await getBackofficeMfaUser(userId);
  if (!user) throw new Error("Backoffice user not found");
  if (deriveBackofficeMfaState(user) !== "PENDING") {
    throw new Error("Only pending MFA setup can be cancelled");
  }

  await prisma.backofficeUser.update({
    where: { id: userId },
    data: {
      mfaMethod: null,
      mfaEnabledAt: null,
      mfaSecretEncrypted: null,
      mfaRecoveryCodesEncrypted: null,
      mfaRecoveryCodesGeneratedAt: null,
    },
  });

  const updated = await getBackofficeMfaUser(userId);
  if (!updated) throw new Error("Backoffice user not found");
  return mapMfaStatus({ user: updated, includePendingSecrets: false });
}

export async function verifyBackofficeMfaChallenge(userId: string, code: string): Promise<BackofficeMfaChallengeResult> {
  const normalizedInput = String(code || "").trim();
  if (!normalizedInput) {
    throw new Error("Enter your authenticator or recovery code");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.backofficeUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        mfaMethod: true,
        mfaEnabledAt: true,
        mfaSecretEncrypted: true,
        mfaRecoveryCodesEncrypted: true,
      },
    });

    if (!user) throw new Error("Backoffice user not found");
    if (user.status === BackofficeUserStatus.BLOCKED) {
      throw new Error("Blocked staff accounts cannot complete MFA");
    }
    if (
      deriveBackofficeMfaState(user) !== "ENABLED" ||
      user.mfaMethod !== BackofficeMfaMethod.AUTHENTICATOR_APP ||
      !user.mfaSecretEncrypted
    ) {
      throw new Error("Authenticator MFA is not enabled on this account");
    }

    const secret = decryptBackofficeMfaValue(user.mfaSecretEncrypted);
    if (verifyAuthenticatorCode({ secret, code: normalizedInput })) {
      const remainingCodes = user.mfaRecoveryCodesEncrypted
        ? JSON.parse(decryptBackofficeMfaValue(user.mfaRecoveryCodesEncrypted)).length
        : 0;
      return {
        usedRecoveryCode: false,
        recoveryCodesRemaining: remainingCodes,
      };
    }

    if (!user.mfaRecoveryCodesEncrypted) {
      throw new Error("Invalid authenticator or recovery code");
    }

    const recoveryCodes: string[] = JSON.parse(decryptBackofficeMfaValue(user.mfaRecoveryCodesEncrypted));
    const target = normalizeRecoveryCode(normalizedInput);
    const matchedIndex = recoveryCodes.findIndex((entry) => normalizeRecoveryCode(entry) === target);
    if (matchedIndex < 0) {
      throw new Error("Invalid authenticator or recovery code");
    }

    const nextRecoveryCodes = recoveryCodes.filter((_, index) => index !== matchedIndex);
    await tx.backofficeUser.update({
      where: { id: user.id },
      data: {
        mfaRecoveryCodesEncrypted: encryptBackofficeMfaValue(JSON.stringify(nextRecoveryCodes)),
      },
    });

    return {
      usedRecoveryCode: true,
      recoveryCodesRemaining: nextRecoveryCodes.length,
    };
  });
}
