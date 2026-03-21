export const BACKOFFICE_AUTH_SCOPE = "BACKOFFICE" as const;
export const BACKOFFICE_CREDENTIALS_PROVIDER_ID = "backoffice-credentials" as const;

function readValue(source: any, key: string): any {
  if (!source || typeof source !== "object") return undefined;
  if (key in source) return source[key];
  if (source.user && typeof source.user === "object" && key in source.user) return source.user[key];
  return undefined;
}

export function getAuthScope(source: any): string | null {
  const scope = readValue(source, "authScope");
  return scope === BACKOFFICE_AUTH_SCOPE ? scope : null;
}

export function getSessionStatus(source: any): string | null {
  const status = readValue(source, "status");
  return typeof status === "string" && status ? status : null;
}

export function getBackofficeRole(source: any): "SUPERADMIN" | "STAFF" | null {
  const role = readValue(source, "backofficeRole");
  return role === "SUPERADMIN" || role === "STAFF" ? role : null;
}

export function getSessionUserId(source: any): string | null {
  const id = readValue(source, "id");
  return typeof id === "string" && id ? id : null;
}

export function getSessionEmail(source: any): string | null {
  const email = readValue(source, "email");
  return typeof email === "string" && email ? email : null;
}

export function getSessionUsername(source: any): string | null {
  const username = readValue(source, "username");
  return typeof username === "string" && username ? username : null;
}

export function isBackofficeSession(source: any): boolean {
  return getAuthScope(source) === BACKOFFICE_AUTH_SCOPE && getSessionStatus(source) !== "BLOCKED";
}
