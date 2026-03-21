import { BrandEmailConfigStatus, BrandEmailProvider } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@command/core-db";
import type { PublicBrandContext } from "@command/core-brand-runtime";

const DEFAULT_RESEND_SECRET_REF = "RESEND_API_KEY";
const ENV_KEY_PATTERN = /^[A-Z0-9_]+$/;

export type BrandEmailPurpose = "auth" | "notification";

export type BrandEmailConfigFailureCode =
  | "MISSING_BRAND_RECORD"
  | "MISSING_EMAIL_CONFIG"
  | "INACTIVE_EMAIL_CONFIG"
  | "UNSUPPORTED_PROVIDER"
  | "MISSING_PROVIDER_SECRET"
  | "MISSING_FROM_EMAIL"
  | "MISSING_SUPPORT_EMAIL";

export type BrandEmailConfigFailure = {
  ok: false;
  code: BrandEmailConfigFailureCode;
  error: string;
  status: 503;
};

export type BrandEmailRuntimeConfig = {
  brandId: string;
  brandKey: string;
  brandName: string;
  configId: string;
  provider: BrandEmailProvider;
  providerSecretRef: string;
  apiKey: string;
  fromEmail: string;
  fromName: string | null;
  fromAddress: string;
  replyToEmail: string | null;
  supportEmails: string[];
};

type BrandEmailConfigSuccess = {
  ok: true;
  config: BrandEmailRuntimeConfig;
};

export type BrandEmailConfigResult = BrandEmailConfigFailure | BrandEmailConfigSuccess;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function parseEmailList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(/[;,]/g)
        .map((entry) => normalizeEmail(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
}

function normalizeSecretRef(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return DEFAULT_RESEND_SECRET_REF;
  if (!ENV_KEY_PATTERN.test(normalized)) {
    throw new Error("Brand email provider secret ref must be an env-style key");
  }
  return normalized;
}

function buildFromAddress(fromEmail: string, fromName: string | null): string {
  const cleanName = typeof fromName === "string" ? fromName.trim() : "";
  return cleanName ? `${cleanName} <${fromEmail}>` : fromEmail;
}

export async function resolveBrandEmailConfig(
  brand: Pick<PublicBrandContext, "brandId" | "brandKey" | "brandName">,
  purpose: BrandEmailPurpose
): Promise<BrandEmailConfigResult> {
  if (!brand.brandId) {
    return {
      ok: false,
      code: "MISSING_BRAND_RECORD",
      error: "Brand is missing a persisted brand record.",
      status: 503,
    };
  }

  const config = await prisma.brandEmailConfig.findUnique({
    where: { brandId: brand.brandId },
  });

  if (!config) {
    return {
      ok: false,
      code: "MISSING_EMAIL_CONFIG",
      error: "Email is not configured for this brand yet.",
      status: 503,
    };
  }

  if (config.status !== BrandEmailConfigStatus.ACTIVE) {
    return {
      ok: false,
      code: "INACTIVE_EMAIL_CONFIG",
      error: "Email is not active for this brand yet.",
      status: 503,
    };
  }

  if (config.provider !== BrandEmailProvider.RESEND) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROVIDER",
      error: "This brand uses an unsupported email provider configuration.",
      status: 503,
    };
  }

  let providerSecretRef = DEFAULT_RESEND_SECRET_REF;
  try {
    providerSecretRef = normalizeSecretRef(config.providerSecretRef);
  } catch {
    return {
      ok: false,
      code: "MISSING_PROVIDER_SECRET",
      error: "Email provider credentials are not configured for this brand.",
      status: 503,
    };
  }

  const apiKey = String(process.env[providerSecretRef] || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "MISSING_PROVIDER_SECRET",
      error: "Email provider credentials are not configured for this brand.",
      status: 503,
    };
  }

  const fromEmail = normalizeEmail(config.fromEmail);
  if (!fromEmail) {
    return {
      ok: false,
      code: "MISSING_FROM_EMAIL",
      error: "Email sender is not configured for this brand.",
      status: 503,
    };
  }

  const supportEmails = parseEmailList(config.supportEmail);
  if (purpose === "notification" && supportEmails.length === 0) {
    return {
      ok: false,
      code: "MISSING_SUPPORT_EMAIL",
      error: "Notification recipient is not configured for this brand.",
      status: 503,
    };
  }

  return {
    ok: true,
    config: {
      brandId: brand.brandId,
      brandKey: brand.brandKey,
      brandName: brand.brandName,
      configId: config.id,
      provider: config.provider,
      providerSecretRef,
      apiKey,
      fromEmail,
      fromName: config.fromName?.trim() || null,
      fromAddress: buildFromAddress(fromEmail, config.fromName?.trim() || null),
      replyToEmail: normalizeEmail(config.replyToEmail),
      supportEmails,
    },
  };
}

export async function sendBrandEmail(params: {
  config: BrandEmailRuntimeConfig;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
}) {
  const resend = new Resend(params.config.apiKey);
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
  } = {
    from: params.config.fromAddress,
    to,
    subject: params.subject,
    text: params.text,
  };

  if (params.html) payload.html = params.html;
  const replyTo = normalizeEmail(params.replyTo) || params.config.replyToEmail;
  if (replyTo) payload.replyTo = replyTo;

  return resend.emails.send(payload);
}
