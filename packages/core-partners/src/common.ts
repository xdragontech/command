import { prisma } from "@command/core-db";
import type { PartnerAdminScope } from "./types";

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeNullableText(value: unknown) {
  const next = normalizeText(value);
  return next ? next : null;
}

export function normalizeNullableId(value: unknown) {
  const next = normalizeText(value);
  return next ? next : null;
}

export function resolveReadableBrandIds(scope: PartnerAdminScope, requestedBrandId: string | null) {
  if (scope.role === "SUPERADMIN") {
    return requestedBrandId ? [requestedBrandId] : null;
  }

  if (requestedBrandId) {
    return scope.allowedBrandIds.includes(requestedBrandId) ? [requestedBrandId] : [];
  }

  return scope.allowedBrandIds;
}

export function resolveWriteBrandId(
  scope: PartnerAdminScope,
  rawBrandId: unknown,
  options?: { allowSingleBrandFallback?: boolean }
) {
  const requestedBrandId = normalizeNullableId(rawBrandId);

  if (scope.role === "SUPERADMIN") {
    if (!requestedBrandId) throw new Error("Brand selection is required");
    return requestedBrandId;
  }

  if (requestedBrandId) {
    if (!scope.allowedBrandIds.includes(requestedBrandId)) {
      throw new Error("Requested brand is not available for this account");
    }
    return requestedBrandId;
  }

  if (options?.allowSingleBrandFallback && scope.allowedBrandIds.length === 1) {
    return scope.allowedBrandIds[0];
  }

  throw new Error("Brand selection is required");
}

export async function ensureBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      status: true,
    },
  });
  if (!brand) throw new Error("Brand not found");
  if (brand.status !== "ACTIVE") throw new Error("Brand is not active");
  return brand;
}

export function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function emptyApplicationCounts() {
  return {
    draft: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
  };
}
