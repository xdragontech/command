import { createHash } from "crypto";
import { BackofficeRole, BackofficeUserStatus } from "@prisma/client";
import { prisma } from "@command/core-db";
import {
  getConfiguredProtectedBackofficeEmail,
  getBackofficeBootstrapPasswordEnvKey,
  getProtectedBackofficeEmailEnvKey,
} from "@command/core-config";
import {
  getBackofficeMfaIssuer,
  isBackofficeMfaEncryptionReady,
} from "@command/core-auth-backoffice";
import { getRuntimeHostConfig } from "@command/core-brand-runtime";

type EnvValueKind = "plain" | "secret" | "databaseUrl";

type EnvItemDescriptor = {
  key: string;
  label: string;
  description: string;
  kind: EnvValueKind;
};

export type SystemEnvItem = {
  key: string;
  label: string;
  description: string;
  kind: EnvValueKind;
  status: "present" | "missing";
  value: string;
  fingerprint?: string | null;
  meta?: Array<{ label: string; value: string }>;
};

export type SystemEnvGroup = {
  key: string;
  title: string;
  description: string;
  items: SystemEnvItem[];
};

export type RuntimeStatusItem = {
  label: string;
  value: string;
  note?: string;
};

export type DatabaseStatus = {
  status: "ok" | "error" | "unconfigured";
  currentDatabase: string | null;
  currentSchema: string | null;
  expectedDatabase: string | null;
  expectedHost: string | null;
  fingerprint: string | null;
  error: string | null;
};

type BootstrapDiagnostics = {
  user: null | {
    username: string;
    role: BackofficeRole;
    status: BackofficeUserStatus;
    mfaMethod: string | null;
    mfaEnabledAt: Date | null;
    lastLoginAt: Date | null;
    brandAccesses: Array<{ brandId: string }>;
  };
  configuredBrandCount: number;
  error: string | null;
};

const ENV_GROUPS: Array<{
  key: string;
  title: string;
  description: string;
  items: EnvItemDescriptor[];
}> = [
  {
    key: "runtime",
    title: "Runtime & Deployment",
    description: "Server-side runtime values for the current command installation.",
    items: [
      { key: "NODE_ENV", label: "Node Environment", description: "Server runtime mode.", kind: "plain" },
      { key: "VERCEL_ENV", label: "Vercel Environment", description: "Deployment scope for this runtime.", kind: "plain" },
      { key: "VERCEL_URL", label: "Vercel URL", description: "Runtime deployment hostname when set by Vercel.", kind: "plain" },
      { key: "VERCEL_REGION", label: "Vercel Region", description: "Serverless function region for this runtime.", kind: "plain" },
      {
        key: "VERCEL_GIT_COMMIT_REF",
        label: "Git Branch",
        description: "Git ref attached to this deployment when available.",
        kind: "plain",
      },
      {
        key: "VERCEL_GIT_COMMIT_SHA",
        label: "Git Commit SHA",
        description: "Git commit attached to this deployment when available.",
        kind: "plain",
      },
    ],
  },
  {
    key: "auth",
    title: "Backoffice Auth & MFA",
    description: "Installation-level auth configuration used by command admin-web.",
    items: [
      {
        key: "NEXTAUTH_URL",
        label: "NextAuth URL",
        description: "Absolute auth base URL for admin-web sign-in and callback flows.",
        kind: "plain",
      },
      {
        key: "NEXTAUTH_SECRET",
        label: "NextAuth Secret",
        description: "Secret used to sign backoffice session cookies and tokens.",
        kind: "secret",
      },
      {
        key: "BACKOFFICE_MFA_ISSUER",
        label: "Backoffice MFA Issuer",
        description: "Authenticator-app issuer label for staff MFA enrollment.",
        kind: "plain",
      },
      {
        key: "BACKOFFICE_MFA_ENCRYPTION_KEY",
        label: "Backoffice MFA Encryption Key",
        description: "Required before authenticator secrets and recovery codes can be stored safely.",
        kind: "secret",
      },
      {
        key: getProtectedBackofficeEmailEnvKey(),
        label: "Bootstrap Superadmin Email",
        description: "Preferred install-time override for the protected bootstrap superadmin email.",
        kind: "plain",
      },
      {
        key: getBackofficeBootstrapPasswordEnvKey(),
        label: "Bootstrap Superadmin Password",
        description: "Used only by explicit bootstrap ensure/recovery tooling for the protected bootstrap account.",
        kind: "secret",
      },
    ],
  },
  {
    key: "services",
    title: "Install Services",
    description: "Primary installation-level integrations used by command runtime and the future public API surface.",
    items: [
      {
        key: "XD_POSTGRES",
        label: "Database URL (Primary)",
        description: "Primary Postgres connection string used by Prisma and runtime database checks.",
        kind: "databaseUrl",
      },
      {
        key: "DATABASE_URL",
        label: "Database URL (Legacy / Drift Check)",
        description: "Observed for drift detection only. Command does not treat this as source of truth.",
        kind: "databaseUrl",
      },
      {
        key: "RESEND_API_KEY",
        label: "Resend API Key",
        description: "Default email provider secret env referenced by brand email configs unless overridden per brand.",
        kind: "secret",
      },
    ],
  },
];

function getEnvValue(key: string): string | null {
  const raw = process.env[key];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value : null;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function summarizeSecret(value: string): Pick<SystemEnvItem, "value" | "fingerprint" | "meta"> {
  return {
    value: `Configured (${value.length} chars)`,
    fingerprint: fingerprint(value),
    meta: [{ label: "Fingerprint", value: fingerprint(value) }],
  };
}

export type DatabaseUrlSummary = {
  maskedValue: string;
  fingerprint: string;
  host?: string | null;
  database?: string | null;
  port?: string | null;
  protocol?: string | null;
  parseError?: string | null;
};

export function summarizeDatabaseUrl(value: string | null): DatabaseUrlSummary | null {
  if (!value) return null;

  const urlFingerprint = fingerprint(value);

  try {
    const parsed = new URL(value);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || null;
    const port = parsed.port || null;

    return {
      maskedValue: `${parsed.protocol}//***@${parsed.hostname}${port ? `:${port}` : ""}${database ? `/${database}` : ""}`,
      fingerprint: urlFingerprint,
      host: parsed.hostname || null,
      database,
      port,
      protocol: parsed.protocol.replace(/:$/, "") || null,
      parseError: null,
    };
  } catch (error) {
    return {
      maskedValue: "Configured (unparseable URL)",
      fingerprint: urlFingerprint,
      parseError: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}

function summarizeDatabaseEnv(value: string): Pick<SystemEnvItem, "value" | "fingerprint" | "meta"> {
  const summary = summarizeDatabaseUrl(value);
  if (!summary) return { value: "Not set" };

  const meta: Array<{ label: string; value: string }> = [{ label: "Fingerprint", value: summary.fingerprint }];
  if (summary.protocol) meta.push({ label: "Protocol", value: summary.protocol });
  if (summary.host) meta.push({ label: "Host", value: summary.host });
  if (summary.port) meta.push({ label: "Port", value: summary.port });
  if (summary.database) meta.push({ label: "Database", value: summary.database });
  if (summary.parseError) meta.push({ label: "Parse Error", value: summary.parseError });

  return {
    value: summary.maskedValue,
    fingerprint: summary.fingerprint,
    meta,
  };
}

function summarizeEnvItem(descriptor: EnvItemDescriptor): SystemEnvItem {
  const value = getEnvValue(descriptor.key);
  if (!value) {
    return {
      key: descriptor.key,
      label: descriptor.label,
      description: descriptor.description,
      kind: descriptor.kind,
      status: "missing",
      value: "Not set",
    };
  }

  if (descriptor.kind === "secret") {
    const secretSummary = summarizeSecret(value);
    return {
      key: descriptor.key,
      label: descriptor.label,
      description: descriptor.description,
      kind: descriptor.kind,
      status: "present",
      value: secretSummary.value,
      fingerprint: secretSummary.fingerprint,
      meta: secretSummary.meta,
    };
  }

  if (descriptor.kind === "databaseUrl") {
    const dbSummary = summarizeDatabaseEnv(value);
    return {
      key: descriptor.key,
      label: descriptor.label,
      description: descriptor.description,
      kind: descriptor.kind,
      status: "present",
      value: dbSummary.value,
      fingerprint: dbSummary.fingerprint,
      meta: dbSummary.meta,
    };
  }

  return {
    key: descriptor.key,
    label: descriptor.label,
    description: descriptor.description,
    kind: descriptor.kind,
    status: "present",
    value,
  };
}

export function collectSystemEnvGroups(): SystemEnvGroup[] {
  return ENV_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    description: group.description,
    items: group.items.map(summarizeEnvItem),
  }));
}

export async function collectRuntimeStatus(requestHost?: string | null): Promise<RuntimeStatusItem[]> {
  const runtimeHost = await getRuntimeHostConfig(requestHost);
  const host = runtimeHost.requestHost || "unknown";
  const bootstrapPasswordKey = getBackofficeBootstrapPasswordEnvKey();
  const bootstrapPasswordPresent = Boolean(getEnvValue(bootstrapPasswordKey));
  const protectedBootstrapEmail = getConfiguredProtectedBackofficeEmail();
  let bootstrapDiagnostics: BootstrapDiagnostics = {
    user: null,
    configuredBrandCount: 0,
    error: null,
  };

  try {
    if (!protectedBootstrapEmail) {
      throw new Error(`${getProtectedBackofficeEmailEnvKey()} is missing`);
    }

    const [bootstrapUser, configuredBrandCount] = await Promise.all([
      prisma.backofficeUser.findFirst({
        where: { email: protectedBootstrapEmail },
        select: {
          username: true,
          role: true,
          status: true,
          mfaMethod: true,
          mfaEnabledAt: true,
          lastLoginAt: true,
          brandAccesses: {
            select: {
              brandId: true,
            },
          },
        },
      }),
      prisma.brand.count(),
    ]);

    bootstrapDiagnostics = {
      user: bootstrapUser,
      configuredBrandCount,
      error: null,
    };
  } catch (error) {
    bootstrapDiagnostics = {
      user: null,
      configuredBrandCount: 0,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }

  const bootstrapStatusValue = (() => {
    if (bootstrapDiagnostics.error) return "Unavailable";
    if (!bootstrapDiagnostics.user) return "Missing";
    if (bootstrapDiagnostics.user.role !== BackofficeRole.SUPERADMIN) return "Misconfigured role";
    if (bootstrapDiagnostics.user.status !== BackofficeUserStatus.ACTIVE) return "Inactive";
    return "Present";
  })();

  const bootstrapStatusNote = (() => {
    if (bootstrapDiagnostics.error) {
      return `Bootstrap account lookup failed: ${bootstrapDiagnostics.error}`;
    }

    if (!bootstrapDiagnostics.user) {
      return "Run the explicit bootstrap superadmin ensure command if this account is missing.";
    }

    const details = [
      `Username ${bootstrapDiagnostics.user.username}`,
      `Role ${bootstrapDiagnostics.user.role}`,
      `Status ${bootstrapDiagnostics.user.status}`,
      `MFA ${
        bootstrapDiagnostics.user.mfaEnabledAt
          ? "enabled"
          : bootstrapDiagnostics.user.mfaMethod
            ? "pending"
            : "not enabled"
      }`,
      `Explicit brand access ${bootstrapDiagnostics.user.brandAccesses.length}/${bootstrapDiagnostics.configuredBrandCount}`,
    ];

    if (bootstrapDiagnostics.user.lastLoginAt) {
      details.push(`Last login ${bootstrapDiagnostics.user.lastLoginAt.toISOString()}`);
    }

    return details.join(". ");
  })();

  return [
    {
      label: "Request Host",
      value: host,
      note: "Host observed for this page request.",
    },
    {
      label: "Request Timestamp",
      value: new Date().toISOString(),
      note: "Generated on the server during this request.",
    },
    {
      label: "Brand Registry Resolution",
      value: runtimeHost.brandKey ? `Matched ${runtimeHost.brandKey}` : "No matching BrandHost",
      note: runtimeHost.brandKey
        ? "The current request host resolved through the database brand registry."
        : "The current request host is not mapped in BrandHost. Runtime host routing will not normalize it.",
    },
    {
      label: "Canonical Admin Host",
      value: runtimeHost.canonicalAdminHost || "Unresolved",
      note: runtimeHost.brandKey
        ? "Resolved from BrandHost rows for the current environment."
        : "Unresolved because there is no matching BrandHost row for this request host.",
    },
    {
      label: "Canonical Public Host",
      value: runtimeHost.canonicalPublicHost || "Unresolved",
      note: runtimeHost.brandKey
        ? "Resolved from BrandHost rows for the current environment."
        : "Unresolved because there is no matching BrandHost row for this request host.",
    },
    {
      label: "Allowed Hosts",
      value: runtimeHost.allowedHosts.length ? runtimeHost.allowedHosts.join(", ") : "None configured",
      note: "Loaded from BrandHost rows. The current request host is included so this diagnostics page can still reason about unmapped hosts.",
    },
    {
      label: "Backoffice Session Cookie Model",
      value: "Host-only",
      note: "Admin cookies are intentionally host-only so backoffice and public-site sessions do not depend on shared subdomain cookies.",
    },
    {
      label: "Backoffice MFA Issuer",
      value: getBackofficeMfaIssuer(),
      note: "Authenticator-app issuer label used for staff MFA enrollment.",
    },
    {
      label: "Backoffice MFA Encryption",
      value: isBackofficeMfaEncryptionReady() ? "Ready" : "Missing key",
      note: "A dedicated encryption key is required before authenticator secrets and recovery codes can be activated.",
    },
    {
      label: "Bootstrap Superadmin Identity",
      value: protectedBootstrapEmail || "Unconfigured",
      note: protectedBootstrapEmail
        ? "Protected bootstrap backoffice identity for this installation."
        : `Missing install-time bootstrap identity configuration. Set ${getProtectedBackofficeEmailEnvKey()}.`,
    },
    {
      label: "Bootstrap Password Source",
      value: bootstrapPasswordPresent ? `${bootstrapPasswordKey} present` : `${bootstrapPasswordKey} missing`,
      note: "Used only by explicit bootstrap ensure/recovery tooling. Deploy startup does not consume it.",
    },
    {
      label: "Bootstrap Superadmin Status",
      value: bootstrapStatusValue,
      note: bootstrapStatusNote,
    },
  ];
}

export async function loadDatabaseStatus(): Promise<DatabaseStatus> {
  const databaseUrl = process.env.XD_POSTGRES?.trim() || null;
  const parsedUrl = summarizeDatabaseUrl(databaseUrl);

  if (!databaseUrl) {
    return {
      status: "unconfigured",
      currentDatabase: null,
      currentSchema: null,
      expectedDatabase: null,
      expectedHost: null,
      fingerprint: null,
      error: null,
    };
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ current_database: string; current_schema: string }>>`
      SELECT current_database() AS current_database, current_schema() AS current_schema
    `;
    const current = rows[0] || null;

    return {
      status: "ok",
      currentDatabase: current?.current_database || null,
      currentSchema: current?.current_schema || null,
      expectedDatabase: parsedUrl?.database || null,
      expectedHost: parsedUrl?.host || null,
      fingerprint: parsedUrl?.fingerprint || null,
      error: null,
    };
  } catch (error) {
    return {
      status: "error",
      currentDatabase: null,
      currentSchema: null,
      expectedDatabase: parsedUrl?.database || null,
      expectedHost: parsedUrl?.host || null,
      fingerprint: parsedUrl?.fingerprint || null,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
