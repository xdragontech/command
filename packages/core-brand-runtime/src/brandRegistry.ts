import {
  BrandEnvironment,
  BrandEmailConfigStatus,
  BrandEmailProvider,
  BrandHostKind,
  BrandStatus,
  type Brand,
  type BrandHost,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import { normalizeHost } from "./requestHost";

type BrandWithHosts = Prisma.BrandGetPayload<{
  include: {
    hosts: true;
    emailConfig: true;
  };
}>;

type EditableBrandPersistenceClient = Pick<Prisma.TransactionClient, "brand" | "brandHost"> | Pick<typeof prisma, "brand" | "brandHost">;

export type EditableBrandEmailConfig = {
  status: BrandEmailConfigStatus;
  provider: BrandEmailProvider;
  providerSecretRef: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  supportEmail: string;
};

export type EditableBrandRecord = {
  id: string;
  brandKey: string;
  name: string;
  status: BrandStatus;
  apexHost: string;
  productionPublicHost: string;
  productionAdminHost: string;
  previewPublicHost: string;
  previewAdminHost: string;
  emailConfig: EditableBrandEmailConfig;
  createdAt: string;
  updatedAt: string;
};

export type EditableBrandInput = Omit<EditableBrandRecord, "id" | "createdAt" | "updatedAt">;

export type RuntimeBrandResolution = {
  source: "database";
  brandId?: string;
  brandKey: string;
  brandName: string;
  status: BrandStatus | "ACTIVE";
  environment: "production" | "preview";
  matchedHost: string;
  canonicalPublicHost: string;
  canonicalAdminHost: string;
  apexHost: string;
  isAdminHost: boolean;
};

const BRAND_KEY_PATTERN = /^[a-z0-9-]+$/;
const ENV_KEY_PATTERN = /^[A-Z0-9_]+$/;
const DEFAULT_EMAIL_PROVIDER_SECRET_REF = "RESEND_API_KEY";

function normalizeBrandKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeRecordId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeEditableHost(value: unknown): string {
  const normalized = normalizeHost(String(value || "").replace(/^https?:\/\//i, "").replace(/\/+$/, ""));
  if (normalized.includes("/") || normalized.includes("?") || normalized.includes("#") || normalized.includes(" ")) {
    return "";
  }
  return normalized;
}

function ensureRequired(value: string, label: string) {
  if (!value) throw new Error(`${label} is required`);
}

function normalizeOptionalString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmailList(value: unknown): string {
  const emails = Array.from(
    new Set(
      String(value || "")
        .split(/[;,]/g)
        .map((entry) => normalizeEmail(entry))
        .filter((entry) => entry && isValidEmail(entry))
    )
  );

  return emails.join(", ");
}

function validateOptionalEmail(value: unknown, label: string): string {
  const normalized = normalizeEmail(value);
  if (!normalized) return "";
  if (!isValidEmail(normalized)) {
    throw new Error(`${label} must be a valid email address`);
  }
  return normalized;
}

function normalizeProviderSecretRef(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  if (!normalized) return DEFAULT_EMAIL_PROVIDER_SECRET_REF;
  if (!ENV_KEY_PATTERN.test(normalized)) {
    throw new Error("Provider secret env key must use uppercase letters, numbers, and underscores only");
  }

  return normalized;
}

function findHost(brand: Pick<Brand, "id"> & { hosts: BrandHost[] }, environment: BrandEnvironment, kind: BrandHostKind) {
  return (
    brand.hosts.find((host) => host.environment === environment && host.kind === kind && host.isCanonical) ||
    brand.hosts.find((host) => host.environment === environment && host.kind === kind) ||
    null
  );
}

function mapBrandToEditorRecord(brand: BrandWithHosts): EditableBrandRecord {
  return {
    id: brand.id,
    brandKey: brand.brandKey,
    name: brand.name,
    status: brand.status,
    apexHost: findHost(brand, BrandEnvironment.PRODUCTION, BrandHostKind.APEX)?.host || "",
    productionPublicHost: findHost(brand, BrandEnvironment.PRODUCTION, BrandHostKind.PUBLIC)?.host || "",
    productionAdminHost: findHost(brand, BrandEnvironment.PRODUCTION, BrandHostKind.ADMIN)?.host || "",
    previewPublicHost: findHost(brand, BrandEnvironment.PREVIEW, BrandHostKind.PUBLIC)?.host || "",
    previewAdminHost: findHost(brand, BrandEnvironment.PREVIEW, BrandHostKind.ADMIN)?.host || "",
    emailConfig: {
      status: brand.emailConfig?.status || BrandEmailConfigStatus.INACTIVE,
      provider: BrandEmailProvider.RESEND,
      providerSecretRef: brand.emailConfig?.providerSecretRef || DEFAULT_EMAIL_PROVIDER_SECRET_REF,
      fromName: brand.emailConfig?.fromName || "",
      fromEmail: brand.emailConfig?.fromEmail || "",
      replyToEmail: brand.emailConfig?.replyToEmail || "",
      supportEmail: brand.emailConfig?.supportEmail || "",
    },
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

function buildHostRows(input: EditableBrandInput) {
  const apexHost = normalizeEditableHost(input.apexHost);
  const productionPublicHost = normalizeEditableHost(input.productionPublicHost);
  const productionAdminHost = normalizeEditableHost(input.productionAdminHost);
  const previewPublicHost = normalizeEditableHost(input.previewPublicHost);
  const previewAdminHost = normalizeEditableHost(input.previewAdminHost);

  ensureRequired(apexHost, "Apex host");
  ensureRequired(productionPublicHost, "Production public host");
  ensureRequired(productionAdminHost, "Production admin host");
  ensureRequired(previewPublicHost, "Preview public host");
  ensureRequired(previewAdminHost, "Preview admin host");

  const uniqueHosts = new Set([
    apexHost,
    productionPublicHost,
    productionAdminHost,
    previewPublicHost,
    previewAdminHost,
  ]);

  if (uniqueHosts.size !== 5) {
    throw new Error("Brand hosts must be unique across apex, production, and preview values");
  }

  return [
    {
      host: apexHost,
      environment: BrandEnvironment.PRODUCTION,
      kind: BrandHostKind.APEX,
      isCanonical: true,
    },
    {
      host: productionPublicHost,
      environment: BrandEnvironment.PRODUCTION,
      kind: BrandHostKind.PUBLIC,
      isCanonical: true,
    },
    {
      host: productionAdminHost,
      environment: BrandEnvironment.PRODUCTION,
      kind: BrandHostKind.ADMIN,
      isCanonical: true,
    },
    {
      host: previewPublicHost,
      environment: BrandEnvironment.PREVIEW,
      kind: BrandHostKind.PUBLIC,
      isCanonical: true,
    },
    {
      host: previewAdminHost,
      environment: BrandEnvironment.PREVIEW,
      kind: BrandHostKind.ADMIN,
      isCanonical: true,
    },
  ];
}

function buildEmailConfigInput(raw: any): EditableBrandEmailConfig {
  const status = String(raw?.emailConfig?.status || BrandEmailConfigStatus.INACTIVE)
    .trim()
    .toUpperCase() as BrandEmailConfigStatus;

  if (!Object.values(BrandEmailConfigStatus).includes(status)) {
    throw new Error("Invalid brand email status");
  }

  const provider = BrandEmailProvider.RESEND;
  const providerSecretRef = normalizeProviderSecretRef(raw?.emailConfig?.providerSecretRef);
  const fromName = normalizeOptionalString(raw?.emailConfig?.fromName);
  const fromEmail = validateOptionalEmail(raw?.emailConfig?.fromEmail, "Sender email");
  const replyToEmail = validateOptionalEmail(raw?.emailConfig?.replyToEmail, "Reply-to email");
  const supportEmail = normalizeEmailList(raw?.emailConfig?.supportEmail);

  if (status === BrandEmailConfigStatus.ACTIVE) {
    ensureRequired(fromEmail, "Sender email");
    ensureRequired(supportEmail, "Support email");
    ensureRequired(providerSecretRef, "Provider secret env key");
  }

  return {
    status,
    provider,
    providerSecretRef,
    fromName,
    fromEmail,
    replyToEmail,
    supportEmail,
  };
}

function validateBrandInput(raw: any): EditableBrandInput {
  const brandKey = normalizeBrandKey(raw?.brandKey);
  const name = String(raw?.name || "").trim();
  const status = String(raw?.status || "").trim().toUpperCase() as BrandStatus;

  if (!brandKey || !BRAND_KEY_PATTERN.test(brandKey)) {
    throw new Error("Brand key must use lowercase letters, numbers, and hyphens only");
  }

  ensureRequired(name, "Brand name");

  if (!Object.values(BrandStatus).includes(status)) {
    throw new Error("Invalid brand status");
  }

  return {
    brandKey,
    name,
    status,
    apexHost: normalizeEditableHost(raw?.apexHost),
    productionPublicHost: normalizeEditableHost(raw?.productionPublicHost),
    productionAdminHost: normalizeEditableHost(raw?.productionAdminHost),
    previewPublicHost: normalizeEditableHost(raw?.previewPublicHost),
    previewAdminHost: normalizeEditableHost(raw?.previewAdminHost),
    emailConfig: buildEmailConfigInput(raw),
  };
}

export function validateEditableBrandInput(raw: any): EditableBrandInput {
  return validateBrandInput(raw);
}

async function ensureHostAvailability(
  client: Pick<typeof prisma, "brandHost">,
  hosts: ReturnType<typeof buildHostRows>,
  exceptBrandId?: string
) {
  const conflicts = await client.brandHost.findMany({
    where: {
      host: { in: hosts.map((host) => host.host) },
      ...(exceptBrandId ? { NOT: { brandId: exceptBrandId } } : {}),
    },
    include: {
      brand: {
        select: {
          brandKey: true,
        },
      },
    },
  });

  if (!conflicts.length) return;

  const details = conflicts
    .map((conflict: { host: string; brand: { brandKey: string } }) => `${conflict.host} (${conflict.brand.brandKey})`)
    .sort((left: string, right: string) => left.localeCompare(right))
    .join(", ");

  throw new Error(`Host values must be unique across brands. Conflicts: ${details}`);
}

export async function listEditableBrands(search = ""): Promise<EditableBrandRecord[]> {
  const brands = await prisma.brand.findMany({
    include: { hosts: true, emailConfig: true },
    orderBy: [{ createdAt: "asc" }],
  });

  const records = brands.map(mapBrandToEditorRecord);
  const query = String(search || "")
    .trim()
    .toLowerCase();

  if (!query) return records;

  return records.filter((brand: EditableBrandRecord) =>
    [
      brand.brandKey,
      brand.name,
      brand.apexHost,
      brand.productionPublicHost,
      brand.productionAdminHost,
      brand.previewPublicHost,
      brand.previewAdminHost,
      brand.emailConfig.status,
      brand.emailConfig.providerSecretRef,
      brand.emailConfig.fromName,
      brand.emailConfig.fromEmail,
      brand.emailConfig.replyToEmail,
      brand.emailConfig.supportEmail,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
}

export async function createEditableBrand(raw: any): Promise<EditableBrandRecord> {
  return saveEditableBrandWithClient(prisma, raw);
}

export async function updateEditableBrand(id: string, raw: any): Promise<EditableBrandRecord> {
  return saveEditableBrandWithClient(prisma, raw, id);
}

export async function saveEditableBrandWithClient(
  client: EditableBrandPersistenceClient,
  raw: any,
  existingBrandId?: string
): Promise<EditableBrandRecord> {
  const input = validateBrandInput(raw);
  const hosts = buildHostRows(input);
  await ensureHostAvailability(client as any, hosts, existingBrandId);

  if (!existingBrandId) {
    const brand = await client.brand.create({
      data: {
        brandKey: input.brandKey,
        name: input.name,
        status: input.status,
        hosts: {
          create: hosts,
        },
        emailConfig: {
          create: {
            status: input.emailConfig.status,
            provider: input.emailConfig.provider,
            providerSecretRef: input.emailConfig.providerSecretRef,
            fromName: input.emailConfig.fromName || null,
            fromEmail: input.emailConfig.fromEmail || null,
            replyToEmail: input.emailConfig.replyToEmail || null,
            supportEmail: input.emailConfig.supportEmail || null,
          },
        },
      },
      include: { hosts: true, emailConfig: true },
    });

    return mapBrandToEditorRecord(brand);
  }

  await client.brand.findUniqueOrThrow({ where: { id: existingBrandId } });
  await client.brandHost.deleteMany({ where: { brandId: existingBrandId } });

  const brand = await client.brand.update({
      where: { id: existingBrandId },
      data: {
        brandKey: input.brandKey,
        name: input.name,
        status: input.status,
        hosts: {
          create: hosts,
        },
        emailConfig: {
          upsert: {
            create: {
              status: input.emailConfig.status,
              provider: input.emailConfig.provider,
              providerSecretRef: input.emailConfig.providerSecretRef,
              fromName: input.emailConfig.fromName || null,
              fromEmail: input.emailConfig.fromEmail || null,
              replyToEmail: input.emailConfig.replyToEmail || null,
              supportEmail: input.emailConfig.supportEmail || null,
            },
            update: {
              status: input.emailConfig.status,
              provider: input.emailConfig.provider,
              providerSecretRef: input.emailConfig.providerSecretRef,
              fromName: input.emailConfig.fromName || null,
              fromEmail: input.emailConfig.fromEmail || null,
              replyToEmail: input.emailConfig.replyToEmail || null,
              supportEmail: input.emailConfig.supportEmail || null,
            },
          },
        },
      },
      include: { hosts: true, emailConfig: true },
  });

  return mapBrandToEditorRecord(brand);
}

export async function deleteEditableBrand(id: string): Promise<void> {
  const count = await prisma.brand.count();
  if (count <= 1) {
    throw new Error("Cannot delete the only configured brand. Runtime host resolution requires at least one brand.");
  }
  await prisma.brand.delete({ where: { id } });
}

export async function resolveWriteBrandId(
  raw:
    | {
        brandId?: unknown;
        brandKey?: unknown;
      }
    | null
    | undefined,
  options?: {
    allowSingleBrandFallback?: boolean;
  }
): Promise<string> {
  const brandId = normalizeRecordId(raw?.brandId);
  if (brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true },
    });
    if (!brand) throw new Error("Selected brand was not found");
    return brand.id;
  }

  const brandKey = normalizeBrandKey(raw?.brandKey);
  if (brandKey) {
    const brand = await prisma.brand.findUnique({
      where: { brandKey },
      select: { id: true },
    });
    if (!brand) throw new Error("Selected brand was not found");
    return brand.id;
  }

  if (!options?.allowSingleBrandFallback) {
    throw new Error("Brand selection is required");
  }

  const brands = await prisma.brand.findMany({
    select: { id: true },
    orderBy: [{ createdAt: "asc" }],
    take: 2,
  });

  if (brands.length === 0) {
    throw new Error("No brand is configured. Run the brand sync before creating brand-scoped records.");
  }

  if (brands.length > 1) {
    throw new Error("Brand selection is required once multiple brands exist.");
  }

  return brands[0].id;
}

export async function resolveRuntimeBrandForHost(host: string): Promise<RuntimeBrandResolution | null> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;

  const hostRecord = await prisma.brandHost.findUnique({
    where: { host: normalizedHost },
    include: {
      brand: {
        include: {
          hosts: true,
        },
      },
    },
  });

  if (!hostRecord) return null;

  const brand = hostRecord.brand;
  const environment = hostRecord.environment === BrandEnvironment.PREVIEW ? "preview" : "production";
  const publicHost = findHost(brand, hostRecord.environment, BrandHostKind.PUBLIC)?.host || "";
  const adminHost = findHost(brand, hostRecord.environment, BrandHostKind.ADMIN)?.host || "";
  const apexHost = findHost(brand, BrandEnvironment.PRODUCTION, BrandHostKind.APEX)?.host || "";

  if (!publicHost || !adminHost) return null;

  return {
    source: "database",
    brandId: brand.id,
    brandKey: brand.brandKey,
    brandName: brand.name,
    status: brand.status,
    environment,
    matchedHost: hostRecord.host,
    canonicalPublicHost: publicHost,
    canonicalAdminHost: adminHost,
    apexHost,
    isAdminHost: hostRecord.kind === BrandHostKind.ADMIN,
  };
}

export async function getRuntimeAllowedHosts(extraHosts: string[] = []): Promise<Set<string>> {
  const hosts = new Set(extraHosts.map((host) => normalizeHost(host)).filter(Boolean));
  const dbHosts = await prisma.brandHost.findMany({
    select: { host: true },
  });

  for (const host of dbHosts) {
    const normalized = normalizeHost(host.host);
    if (normalized) hosts.add(normalized);
  }

  return hosts;
}
