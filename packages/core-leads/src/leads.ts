import { LeadSource } from "@prisma/client";
import { prisma } from "@command/core-db";

export type LeadKind = "all" | "chat" | "contact";

export type LeadListScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export type LeadRow = {
  ts: string;
  source: "chat" | "contact";
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  ip?: string;
  name?: string | null;
  email?: string | null;
  raw: any;
};

function parseLimit(raw: unknown, fallback: number) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

function parseBrandId(raw: unknown) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value || "").trim();
  return normalized || null;
}

function eventKey(ev: any): string {
  const src = String(ev?.source || "").toUpperCase();
  if (src === "CHAT") {
    return `chat:${ev?.conversationId || ev?.leadId || ev?.id}`;
  }

  const email = (ev?.lead?.email || (ev?.raw as any)?.lead?.email || (ev?.raw as any)?.email || "") as string;
  return `contact:${ev?.leadId || email || ev?.id}`;
}

export function parseLeadKind(raw: unknown): LeadKind {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "chat" || value === "contact" || value === "all") return value;
  return "all";
}

export function parseLeadLimit(raw: unknown, fallback = 200) {
  return parseLimit(raw, fallback);
}

function resolveReadBrandIds(scope: LeadListScope, brandId: string | null) {
  if (scope.role === "SUPERADMIN") {
    return brandId ? [brandId] : null;
  }

  if (scope.allowedBrandIds.length === 0) return [];
  if (!brandId) return scope.allowedBrandIds;
  if (!scope.allowedBrandIds.includes(brandId)) {
    throw new Error("Forbidden brand scope");
  }

  return [brandId];
}

export async function listLeadRows(params: {
  kind: LeadKind;
  limit?: number;
  brandId?: string | null;
  scope: LeadListScope;
}): Promise<LeadRow[]> {
  const kind = params.kind;
  const limit = parseLimit(params.limit, 200);
  const requestedBrandId = parseBrandId(params.brandId);
  const brandIds = resolveReadBrandIds(params.scope, requestedBrandId);

  if (Array.isArray(brandIds) && brandIds.length === 0) {
    return [];
  }

  const sourceFilter =
    kind === "chat" ? LeadSource.CHAT : kind === "contact" ? LeadSource.CONTACT : null;

  const take = Math.min(Math.max(limit * 6, limit), 1500);
  const where =
    brandIds === null
      ? sourceFilter
        ? { source: sourceFilter }
        : {}
      : sourceFilter
        ? { brandId: { in: brandIds }, source: sourceFilter }
        : { brandId: { in: brandIds } };

  const events = await prisma.leadEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      lead: true,
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
    },
  });

  const seen = new Set<string>();
  const rows: LeadRow[] = [];

  for (const ev of Array.isArray(events) ? events : []) {
    const key = eventKey(ev);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const raw = ev.raw ?? {};
    const rawLead = (raw as any)?.lead ?? raw;
    const sourceLower = String(ev.source || "").toLowerCase();

    rows.push({
      ts: ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString(),
      source: sourceLower === "chat" ? "chat" : "contact",
      brandId: ev.brand?.id || ev.brandId || null,
      brandKey: ev.brand?.brandKey || null,
      brandName: ev.brand?.name || null,
      ip: ev.ip || undefined,
      name: ev.lead?.name ?? rawLead?.name ?? null,
      email: ev.lead?.email ?? rawLead?.email ?? null,
      raw:
        ev.raw ??
        {
          id: ev.id,
          source: ev.source,
          brandId: ev.brandId ?? null,
          brandKey: ev.brand?.brandKey ?? null,
          brandName: ev.brand?.name ?? null,
          leadId: ev.leadId ?? null,
          conversationId: ev.conversationId ?? null,
          name: ev.lead?.name ?? rawLead?.name ?? null,
          email: ev.lead?.email ?? rawLead?.email ?? null,
          ip: ev.ip ?? null,
          createdAt: ev.createdAt,
        },
    });

    if (rows.length >= limit) break;
  }

  return rows;
}
