import { prisma } from "@command/core-db";

export type LeadAnalyticsScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

type LeadAnalyticsRow = {
  id: string;
  brandId: string | null;
  source: "CHAT" | "CONTACT";
  leadId: string | null;
  conversationId: string | null;
  createdAt: Date;
  raw: any;
};

type BrandIdentity = {
  brandKey: string | null;
  brandName: string | null;
};

export type LeadAnalytics = {
  totals: {
    total: number;
    contact: number;
    chat: number;
  };
  timeline: Array<{
    date: string;
    label: string;
    total: number;
    contact: number;
    chat: number;
  }>;
  brandBreakdown: Array<{
    brandId: string | null;
    brandKey: string | null;
    brandName: string | null;
    total: number;
    contact: number;
    chat: number;
  }>;
  brandOptions: Array<{
    brandId: string;
    brandKey: string | null;
    brandName: string | null;
  }>;
  range: {
    from: string;
    to: string;
  };
  updatedAt: string;
};

function eventContactKey(row: LeadAnalyticsRow) {
  const brandScope = String(row.brandId || "unscoped");
  if (row.source === "CHAT") {
    return `chat:${brandScope}:${row.conversationId || row.leadId || row.id}`;
  }

  const email = row.raw?.lead?.email || row.raw?.email || row.id;
  return `contact:${brandScope}:${row.leadId || email || row.id}`;
}

function countDistinctLeadContacts(rows: LeadAnalyticsRow[]) {
  const seenChat = new Set<string>();
  const seenContact = new Set<string>();

  for (const row of rows) {
    if (row.source === "CHAT") {
      seenChat.add(eventContactKey(row));
    } else {
      seenContact.add(eventContactKey(row));
    }
  }

  return {
    total: seenChat.size + seenContact.size,
    chat: seenChat.size,
    contact: seenContact.size,
  };
}

function buildBrandBreakdown(rows: LeadAnalyticsRow[], brandsById: Map<string, BrandIdentity>) {
  const grouped = new Map<string, LeadAnalyticsRow[]>();

  for (const row of rows) {
    const key = row.brandId || "unscoped";
    const current = grouped.get(key);
    if (current) {
      current.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  return Array.from(grouped.entries())
    .map(([brandId, brandRows]) => {
      const totals = countDistinctLeadContacts(brandRows);
      const brand = brandId === "unscoped" ? null : brandsById.get(brandId) || null;
      return {
        brandId: brandId === "unscoped" ? null : brandId,
        brandKey: brand?.brandKey || null,
        brandName: brand?.brandName || null,
        total: totals.total,
        contact: totals.contact,
        chat: totals.chat,
      };
    })
    .sort((left, right) => right.total - left.total || left.brandName?.localeCompare(right.brandName || "") || 0);
}

function buildTimeline(rows: LeadAnalyticsRow[], from: string, to: string) {
  const grouped = new Map<string, LeadAnalyticsRow[]>();

  for (const row of rows) {
    const key = toIsoDate(row.createdAt);
    const current = grouped.get(key);
    if (current) {
      current.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const points: LeadAnalytics["timeline"] = [];
  for (const date of eachUtcDate(from, to)) {
    const counts = countDistinctLeadContacts(grouped.get(date) || []);
    points.push({
      date,
      label: formatShortDate(date),
      total: counts.total,
      contact: counts.contact,
      chat: counts.chat,
    });
  }

  return points;
}

function buildBrandOptions(brands: Array<{ id: string; brandKey: string | null; name: string }>) {
  return [...brands]
    .sort((left, right) => left.name.localeCompare(right.name) || (left.brandKey || "").localeCompare(right.brandKey || ""))
    .map((brand) => ({
      brandId: brand.id,
      brandKey: brand.brandKey,
      brandName: brand.name,
    }));
}

function defaultRange() {
  const today = new Date();
  const to = toIsoDate(today);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    from: toIsoDate(start),
    to,
  };
}

function normalizeRange(inputFrom?: string | null, inputTo?: string | null) {
  const fallback = defaultRange();
  const from = isIsoDateOnly(inputFrom) ? inputFrom : fallback.from;
  const to = isIsoDateOnly(inputTo) ? inputTo : fallback.to;
  return from <= to ? { from, to } : { from: to, to: from };
}

function isIsoDateOnly(value?: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseRangeStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseRangeEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function* eachUtcDate(from: string, to: string) {
  const current = parseRangeStart(from);
  const end = parseRangeStart(to);

  while (current <= end) {
    yield toIsoDate(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function emptyAnalytics(range: { from: string; to: string }, brandOptions: LeadAnalytics["brandOptions"]): LeadAnalytics {
  return {
    totals: { total: 0, contact: 0, chat: 0 },
    timeline: buildTimeline([], range.from, range.to),
    brandBreakdown: [],
    brandOptions,
    range,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadLeadAnalytics(params: {
  scope: LeadAnalyticsScope;
  brandId?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<LeadAnalytics> {
  const { scope } = params;
  const range = normalizeRange(params.from, params.to);

  if (scope.role !== "SUPERADMIN" && scope.allowedBrandIds.length === 0) {
    return emptyAnalytics(range, []);
  }

  const accessibleBrandWhere =
    scope.role === "SUPERADMIN" ? {} : { id: { in: scope.allowedBrandIds } };

  const brands = await prisma.brand.findMany({
    where: accessibleBrandWhere,
    select: {
      id: true,
      brandKey: true,
      name: true,
    },
  });

  const brandOptions = buildBrandOptions(brands);

  if (params.brandId && scope.role !== "SUPERADMIN" && !scope.allowedBrandIds.includes(params.brandId)) {
    return emptyAnalytics(range, brandOptions);
  }

  const where: Record<string, any> = {
    createdAt: {
      gte: parseRangeStart(range.from),
      lte: parseRangeEnd(range.to),
    },
  };

  if (params.brandId) {
    where.brandId = params.brandId;
  } else if (scope.role !== "SUPERADMIN") {
    where.brandId = { in: scope.allowedBrandIds };
  }

  const rows = await prisma.leadEvent.findMany({
    where,
    select: {
      id: true,
      brandId: true,
      source: true,
      leadId: true,
      conversationId: true,
      createdAt: true,
      raw: true,
    },
  });

  const brandsById = new Map(
    brands.map((brand) => [brand.id, { brandKey: brand.brandKey, brandName: brand.name } satisfies BrandIdentity])
  );

  const typedRows = rows as LeadAnalyticsRow[];

  return {
    totals: countDistinctLeadContacts(typedRows),
    timeline: buildTimeline(typedRows, range.from, range.to),
    brandBreakdown: buildBrandBreakdown(typedRows, brandsById),
    brandOptions,
    range,
    updatedAt: new Date().toISOString(),
  };
}
