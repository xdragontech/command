import { BrandConsentNoticeStatus, type BrandConsentNotice, type Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";

const DEFAULT_CONSENT_NOTICE = {
  title: "Website Analytics Consent",
  message:
    "We use consented analytics to understand website performance and improve the public experience. You can accept or decline analytics tracking.",
  acceptLabel: "Accept analytics",
  declineLabel: "Decline",
} as const;

type ConsentNoticePersistenceClient = Pick<
  Prisma.TransactionClient,
  "brand" | "brandConsentNotice"
> &
  Pick<typeof prisma, never>;

export type BrandConsentNoticeVersionRecord = {
  id: string;
  version: number;
  status: BrandConsentNoticeStatus;
  title: string;
  message: string;
  acceptLabel: string;
  declineLabel: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EditableBrandConsentNoticeRecord = {
  brandId: string;
  draft: BrandConsentNoticeVersionRecord | null;
  published: BrandConsentNoticeVersionRecord | null;
  effective: BrandConsentNoticeVersionRecord | null;
  nextDraftVersion: number;
};

export type EditableBrandConsentNoticeInput = {
  title: string;
  message: string;
  acceptLabel: string;
  declineLabel: string;
};

function normalizeText(value: unknown) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function ensureRequired(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} is required`);
  }
}

function mapNoticeToRecord(notice: BrandConsentNotice): BrandConsentNoticeVersionRecord {
  return {
    id: notice.id,
    version: notice.version,
    status: notice.status,
    title: notice.title,
    message: notice.message,
    acceptLabel: notice.acceptLabel,
    declineLabel: notice.declineLabel,
    publishedAt: notice.publishedAt ? notice.publishedAt.toISOString() : null,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  };
}

function pickDraft(rows: BrandConsentNotice[]) {
  return rows.find((row) => row.status === BrandConsentNoticeStatus.DRAFT) || null;
}

function pickPublished(rows: BrandConsentNotice[]) {
  return rows.find((row) => row.status === BrandConsentNoticeStatus.PUBLISHED) || null;
}

function mapEditableNotice(brandId: string, rows: BrandConsentNotice[]): EditableBrandConsentNoticeRecord {
  const draft = pickDraft(rows);
  const published = pickPublished(rows);

  return {
    brandId,
    draft: draft ? mapNoticeToRecord(draft) : null,
    published: published ? mapNoticeToRecord(published) : null,
    effective: draft ? mapNoticeToRecord(draft) : published ? mapNoticeToRecord(published) : null,
    nextDraftVersion: draft?.version || (published ? published.version + 1 : 1),
  };
}

async function listNoticesForBrand(client: ConsentNoticePersistenceClient, brandId: string) {
  return client.brandConsentNotice.findMany({
    where: { brandId },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
}

function buildDefaultConsentNoticeData(brandId: string) {
  return {
    brandId,
    version: 1,
    status: BrandConsentNoticeStatus.PUBLISHED,
    title: DEFAULT_CONSENT_NOTICE.title,
    message: DEFAULT_CONSENT_NOTICE.message,
    acceptLabel: DEFAULT_CONSENT_NOTICE.acceptLabel,
    declineLabel: DEFAULT_CONSENT_NOTICE.declineLabel,
    publishedAt: new Date(),
  };
}

export async function ensureBrandConsentNoticeWithClient(
  client: ConsentNoticePersistenceClient,
  brandId: string
) {
  const existing = await client.brandConsentNotice.findFirst({
    where: { brandId },
    select: { id: true },
  });
  if (existing) return;

  await client.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { id: true },
  });

  await client.brandConsentNotice.create({
    data: buildDefaultConsentNoticeData(brandId),
  });
}

export function getDefaultBrandConsentNoticeInput(): EditableBrandConsentNoticeInput {
  return {
    title: DEFAULT_CONSENT_NOTICE.title,
    message: DEFAULT_CONSENT_NOTICE.message,
    acceptLabel: DEFAULT_CONSENT_NOTICE.acceptLabel,
    declineLabel: DEFAULT_CONSENT_NOTICE.declineLabel,
  };
}

export function validateEditableBrandConsentNoticeInput(raw: any): EditableBrandConsentNoticeInput {
  const title = normalizeText(raw?.title);
  const message = normalizeText(raw?.message);
  const acceptLabel = normalizeText(raw?.acceptLabel);
  const declineLabel = normalizeText(raw?.declineLabel);

  ensureRequired(title, "Consent title");
  ensureRequired(message, "Consent message");
  ensureRequired(acceptLabel, "Accept button label");
  ensureRequired(declineLabel, "Decline button label");

  return {
    title,
    message,
    acceptLabel,
    declineLabel,
  };
}

export async function getEditableBrandConsentNotice(brandId: string): Promise<EditableBrandConsentNoticeRecord> {
  return prisma.$transaction(async (tx) => {
    await ensureBrandConsentNoticeWithClient(tx, brandId);
    const rows = await listNoticesForBrand(tx, brandId);
    return mapEditableNotice(brandId, rows);
  });
}

export async function saveBrandConsentNoticeDraft(
  brandId: string,
  raw: any
): Promise<EditableBrandConsentNoticeRecord> {
  const input = validateEditableBrandConsentNoticeInput(raw);

  return prisma.$transaction(async (tx) => {
    await ensureBrandConsentNoticeWithClient(tx, brandId);

    const rows = await listNoticesForBrand(tx, brandId);
    const draft = pickDraft(rows);
    const published = pickPublished(rows);

    if (draft) {
      await tx.brandConsentNotice.update({
        where: { id: draft.id },
        data: {
          title: input.title,
          message: input.message,
          acceptLabel: input.acceptLabel,
          declineLabel: input.declineLabel,
        },
      });
    } else {
      await tx.brandConsentNotice.create({
        data: {
          brandId,
          version: published ? published.version + 1 : 1,
          status: BrandConsentNoticeStatus.DRAFT,
          title: input.title,
          message: input.message,
          acceptLabel: input.acceptLabel,
          declineLabel: input.declineLabel,
          publishedAt: null,
        },
      });
    }

    const nextRows = await listNoticesForBrand(tx, brandId);
    return mapEditableNotice(brandId, nextRows);
  });
}

export async function publishBrandConsentNoticeDraft(
  brandId: string
): Promise<EditableBrandConsentNoticeRecord> {
  return prisma.$transaction(async (tx) => {
    await ensureBrandConsentNoticeWithClient(tx, brandId);

    const draft = await tx.brandConsentNotice.findFirst({
      where: {
        brandId,
        status: BrandConsentNoticeStatus.DRAFT,
      },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }],
    });

    if (!draft) {
      throw new Error("No consent notice draft exists to publish");
    }

    await tx.brandConsentNotice.update({
      where: { id: draft.id },
      data: {
        status: BrandConsentNoticeStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    const nextRows = await listNoticesForBrand(tx, brandId);
    return mapEditableNotice(brandId, nextRows);
  });
}

export async function getPublishedBrandConsentNotice(
  brandId: string
): Promise<BrandConsentNoticeVersionRecord | null> {
  return prisma.$transaction(async (tx) => {
    await ensureBrandConsentNoticeWithClient(tx, brandId);
    const row = await tx.brandConsentNotice.findFirst({
      where: {
        brandId,
        status: BrandConsentNoticeStatus.PUBLISHED,
      },
      orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
    });

    return row ? mapNoticeToRecord(row) : null;
  });
}
