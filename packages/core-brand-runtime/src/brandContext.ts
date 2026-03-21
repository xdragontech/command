import { BrandStatus } from "@prisma/client";
import { normalizeHost } from "./requestHost";
import { resolveRuntimeBrandForHost } from "./brandRegistry";

export type BrandEnvironment = "production" | "preview";

export type PublicBrandContext = {
  brandId?: string;
  brandKey: string;
  brandName: string;
  status: BrandStatus | "ACTIVE";
  environment: BrandEnvironment;
  matchedHost: string;
  canonicalPublicHost: string;
  canonicalAdminHost: string;
  apexHost: string;
};

export type BackofficeBrandScope = {
  allowedBrandKeys: string[];
  lastSelectedBrandKey?: string | null;
};

export function normalizeBrandKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function createBackofficeBrandScope(
  allowedBrandKeys: string[],
  lastSelectedBrandKey?: string | null
): BackofficeBrandScope {
  const normalizedKeys = Array.from(
    new Set(
      allowedBrandKeys
        .map((value) => normalizeBrandKey(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  const selected = normalizeBrandKey(lastSelectedBrandKey);
  return {
    allowedBrandKeys: normalizedKeys,
    lastSelectedBrandKey: selected && normalizedKeys.includes(selected) ? selected : null,
  };
}

export function canAccessBrand(scope: BackofficeBrandScope, brandKey: string | null | undefined): boolean {
  const normalized = normalizeBrandKey(brandKey);
  if (!normalized) return false;
  return scope.allowedBrandKeys.includes(normalized);
}

export async function resolvePublicBrandContextForHost(host: string): Promise<PublicBrandContext | null> {
  const runtime = await resolveRuntimeBrandForHost(host);
  if (!runtime) return null;

  return {
    brandId: runtime.brandId,
    brandKey: normalizeBrandKey(runtime.brandKey) || runtime.brandKey,
    brandName: runtime.brandName,
    status: runtime.status,
    environment: runtime.environment,
    matchedHost: normalizeHost(runtime.matchedHost),
    canonicalPublicHost: normalizeHost(runtime.canonicalPublicHost),
    canonicalAdminHost: normalizeHost(runtime.canonicalAdminHost),
    apexHost: normalizeHost(runtime.apexHost),
  };
}
