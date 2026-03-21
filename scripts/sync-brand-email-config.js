#!/usr/bin/env node

const { PrismaClient, BrandEmailConfigStatus, BrandEmailProvider } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const DEFAULT_SECRET_REF = "RESEND_API_KEY";

function normalizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function parseFromIdentity(value) {
  const raw = String(value || "").trim();
  if (!raw) return { fromName: null, fromEmail: null };

  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      fromName: match[1].trim() || null,
      fromEmail: normalizeEmail(match[2]),
    };
  }

  return {
    fromName: null,
    fromEmail: normalizeEmail(raw),
  };
}

function parseEmailList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[;,]/g)
        .map((entry) => normalizeEmail(entry))
        .filter(Boolean)
    )
  );
}

function buildSeedConfig() {
  const brandKey = normalizeBrandKey(process.env.BRAND_KEY || "xdragon");
  const brandName = String(process.env.NEXT_PUBLIC_BRAND_NAME || "X Dragon").trim() || "X Dragon";
  const fromRaw =
    process.env.RESEND_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.CONTACT_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    "";
  const { fromName, fromEmail } = parseFromIdentity(fromRaw);
  const supportEmails = parseEmailList(
    process.env.RESEND_TO_EMAIL || process.env.CONTACT_TO_EMAIL || process.env.CONTACT_TO || ""
  );
  const providerSecretRef = String(process.env.BRAND_EMAIL_PROVIDER_SECRET_REF || DEFAULT_SECRET_REF)
    .trim()
    .toUpperCase();
  const providerSecretPresent = Boolean(String(process.env[providerSecretRef] || "").trim());

  return {
    brandKey,
    brandName,
    provider: BrandEmailProvider.RESEND,
    providerSecretRef,
    providerSecretPresent,
    fromName,
    fromEmail,
    replyToEmail: fromEmail,
    supportEmails,
    supportEmail: supportEmails.join(", "),
  };
}

async function main() {
  const seed = buildSeedConfig();
  const brand = await prisma.brand.findUnique({
    where: { brandKey: seed.brandKey },
    include: { emailConfig: true },
  });

  const summary = {
    mode: APPLY ? "apply" : "status",
    brandKey: seed.brandKey,
    brandExists: Boolean(brand),
    brandEmailConfigExists: Boolean(brand?.emailConfig),
    currentConfig: brand?.emailConfig
      ? {
          id: brand.emailConfig.id,
          status: brand.emailConfig.status,
          provider: brand.emailConfig.provider,
          fromName: brand.emailConfig.fromName,
          fromEmail: brand.emailConfig.fromEmail,
          replyToEmail: brand.emailConfig.replyToEmail,
          supportEmail: brand.emailConfig.supportEmail,
          providerSecretRef: brand.emailConfig.providerSecretRef,
        }
      : null,
    seedConfig: {
      provider: seed.provider,
      providerSecretRef: seed.providerSecretRef,
      providerSecretPresent: seed.providerSecretPresent,
      fromName: seed.fromName,
      fromEmail: seed.fromEmail,
      replyToEmail: seed.replyToEmail,
      supportEmail: seed.supportEmail,
    },
    missing: {
      brand: !brand,
      fromEmail: !seed.fromEmail,
      supportEmail: seed.supportEmails.length === 0,
      providerSecret: !seed.providerSecretPresent,
    },
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!brand) throw new Error(`Brand ${seed.brandKey} was not found. Run the brand sync first.`);
  if (!seed.fromEmail) throw new Error("Cannot sync brand email config without a valid sender email.");
  if (seed.supportEmails.length === 0) throw new Error("Cannot sync brand email config without a valid support/notification email.");
  if (!seed.providerSecretPresent) {
    throw new Error(`Cannot sync brand email config because ${seed.providerSecretRef} is not set in the current environment.`);
  }

  const config = await prisma.brandEmailConfig.upsert({
    where: { brandId: brand.id },
    create: {
      brandId: brand.id,
      status: BrandEmailConfigStatus.ACTIVE,
      provider: seed.provider,
      fromName: seed.fromName,
      fromEmail: seed.fromEmail,
      replyToEmail: seed.replyToEmail,
      supportEmail: seed.supportEmail,
      providerSecretRef: seed.providerSecretRef,
    },
    update: {
      status: BrandEmailConfigStatus.ACTIVE,
      provider: seed.provider,
      fromName: seed.fromName,
      fromEmail: seed.fromEmail,
      replyToEmail: seed.replyToEmail,
      supportEmail: seed.supportEmail,
      providerSecretRef: seed.providerSecretRef,
    },
  });

  console.log(
    JSON.stringify(
      {
        ...summary,
        applied: {
          id: config.id,
          status: config.status,
          provider: config.provider,
          fromName: config.fromName,
          fromEmail: config.fromEmail,
          replyToEmail: config.replyToEmail,
          supportEmail: config.supportEmail,
          providerSecretRef: config.providerSecretRef,
        },
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
