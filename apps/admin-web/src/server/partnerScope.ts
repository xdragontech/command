export type PartnerPrincipal = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export function toPartnerScope(principal: PartnerPrincipal) {
  return {
    role: principal.role,
    allowedBrandIds: principal.allowedBrandIds,
  };
}
