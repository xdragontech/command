import type { GetServerSidePropsResult } from "next";
import { prisma } from "@command/core-db";
import {
  getConfiguredProtectedBackofficeEmail,
  getProtectedBackofficeEmailEnvKey,
} from "@command/core-config";
import { getApiRequestHost } from "./requestHost";

export const INSTALL_PROFILE_ID = "install";
export const SETUP_ROUTE = "/setup";

type SetupPrerequisiteItem = {
  key: string;
  label: string;
  status: "present" | "missing";
  detail: string;
  required: boolean;
};

type InstallProfileRecord = {
  id: string;
  displayName: string | null;
  setupCompletedAt: string | null;
  primaryBrandId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InstallSetupState = {
  initialized: boolean;
  profile: InstallProfileRecord | null;
  brandCount: number;
  backofficeUserCount: number;
};

export type SetupPageData = InstallSetupState & {
  prerequisites: SetupPrerequisiteItem[];
  requestHost: string;
};

function normalizeEnvValue(value: unknown) {
  return String(value || "").trim();
}

function mapProfile(profile: {
  id: string;
  displayName: string | null;
  setupCompletedAt: Date | null;
  primaryBrandId: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null): InstallProfileRecord | null {
  if (!profile) return null;

  return {
    id: profile.id,
    displayName: profile.displayName,
    setupCompletedAt: profile.setupCompletedAt ? profile.setupCompletedAt.toISOString() : null,
    primaryBrandId: profile.primaryBrandId,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function summarizeEnvPresence(key: string, label: string, required: boolean): SetupPrerequisiteItem {
  const value = normalizeEnvValue(process.env[key]);
  const safeValue =
    key === "NEXTAUTH_URL" || key === getProtectedBackofficeEmailEnvKey()
      ? value || "Not set"
      : value
        ? "Configured"
        : "Not set";

  return {
    key,
    label,
    status: value ? "present" : "missing",
    detail: safeValue,
    required,
  };
}

export function collectSetupPrerequisites(): SetupPrerequisiteItem[] {
  return [
    summarizeEnvPresence("XD_POSTGRES", "Database URL", true),
    summarizeEnvPresence("NEXTAUTH_URL", "NextAuth URL", true),
    summarizeEnvPresence("NEXTAUTH_SECRET", "NextAuth Secret", true),
    summarizeEnvPresence("BACKOFFICE_MFA_ENCRYPTION_KEY", "Backoffice MFA Encryption Key", true),
    summarizeEnvPresence(getProtectedBackofficeEmailEnvKey(), "Bootstrap Superadmin Email", true),
    summarizeEnvPresence("BACKOFFICE_MFA_ISSUER", "Backoffice MFA Issuer", false),
    summarizeEnvPresence("BACKOFFICE_BOOTSTRAP_PASSWORD", "Bootstrap Recovery Password", false),
  ];
}

export async function loadInstallSetupState(): Promise<InstallSetupState> {
  const [profile, brandCount, backofficeUserCount] = await Promise.all([
    prisma.installProfile.findUnique({
      where: { id: INSTALL_PROFILE_ID },
      select: {
        id: true,
        displayName: true,
        setupCompletedAt: true,
        primaryBrandId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.brand.count(),
    prisma.backofficeUser.count(),
  ]);

  return {
    initialized: Boolean(profile?.setupCompletedAt),
    profile: mapProfile(profile),
    brandCount,
    backofficeUserCount,
  };
}

export async function isInstallInitialized(): Promise<boolean> {
  const profile = await prisma.installProfile.findUnique({
    where: { id: INSTALL_PROFILE_ID },
    select: { setupCompletedAt: true },
  });

  return Boolean(profile?.setupCompletedAt);
}

export async function loadSetupPageData(req: { headers: Record<string, string | string[] | undefined> }): Promise<SetupPageData> {
  const state = await loadInstallSetupState();

  return {
    ...state,
    prerequisites: collectSetupPrerequisites(),
    requestHost: getApiRequestHost(req),
  };
}

export function buildSetupRedirect(): GetServerSidePropsResult<any> {
  return {
    redirect: {
      destination: SETUP_ROUTE,
      permanent: false,
    },
  };
}

export function buildPostSetupRedirect(): GetServerSidePropsResult<any> {
  return {
    redirect: {
      destination: "/admin/signin",
      permanent: false,
    },
  };
}

export function getConfiguredBootstrapEmailForSetup() {
  return getConfiguredProtectedBackofficeEmail();
}
