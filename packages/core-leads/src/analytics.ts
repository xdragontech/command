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
  raw: any;
};

export type LeadAnalytics = {
  totals: {
    total: number;
    contact: number;
    chat: number;
  };
  last7d: {
    total: number;
    contact: number;
    chat: number;
  };
  brandBreakdown: Array<{
    brandId: string | null;
    brandKey: string | null;
    brandName: string | null;
    total: number;
    contact: number;
    chat: number;
  }>;
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

function buildBrandBreakdown(
  rows: LeadAnalyticsRow[],
  brandsById: Map<string, { brandKey: string | null; brandName: string | null }>
) {
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

export async function loadLeadAnalytics(params: { scope: LeadAnalyticsScope }): Promise<LeadAnalytics> {
  const { scope } = params;
  const since = new Date();
  since.setDate(since.getDate() - 7);

  if (scope.role !== "SUPERADMIN" && scope.allowedBrandIds.length === 0) {
    return {
      totals: { total: 0, contact: 0, chat: 0 },
      last7d: { total: 0, contact: 0, chat: 0 },
      brandBreakdown: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const where = scope.role === "SUPERADMIN" ? {} : { brandId: { in: scope.allowedBrandIds } };
  const [allRows, last7Rows, brands] = await Promise.all([
    prisma.leadEvent.findMany({
      where,
      select: {
        id: true,
        brandId: true,
        source: true,
        leadId: true,
        conversationId: true,
        raw: true,
      },
    }),
    prisma.leadEvent.findMany({
      where: {
        ...where,
        createdAt: { gte: since },
      },
      select: {
        id: true,
        brandId: true,
        source: true,
        leadId: true,
        conversationId: true,
        raw: true,
      },
    }),
    prisma.brand.findMany({
      where: scope.role === "SUPERADMIN" ? {} : { id: { in: scope.allowedBrandIds } },
      select: {
        id: true,
        brandKey: true,
        name: true,
      },
    }),
  ]);

  const brandsById = new Map(
    brands.map((brand) => [brand.id, { brandKey: brand.brandKey, brandName: brand.name }])
  );

  return {
    totals: countDistinctLeadContacts(allRows as LeadAnalyticsRow[]),
    last7d: countDistinctLeadContacts(last7Rows as LeadAnalyticsRow[]),
    brandBreakdown: buildBrandBreakdown(allRows as LeadAnalyticsRow[], brandsById),
    updatedAt: new Date().toISOString(),
  };
}
