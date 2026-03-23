export type SchedulingPrincipal = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export function toSchedulingScope(principal: SchedulingPrincipal) {
  return {
    role: principal.role,
    allowedBrandIds: principal.allowedBrandIds,
  };
}

