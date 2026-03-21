import {
  authorizeBackofficeCredentials,
  getBackofficeIdentityFromSession,
  refreshBackofficeIdentity,
  resolveBackofficeHomePath,
  BACKOFFICE_AUTH_SCOPE,
  BACKOFFICE_CREDENTIALS_PROVIDER_ID,
  type BackofficeAuthUser,
  type BackofficeIdentityState,
} from "@command/core-auth-backoffice";

export const ADMIN_AUTH_SCOPE = BACKOFFICE_AUTH_SCOPE;
export const ADMIN_CREDENTIALS_PROVIDER_ID = BACKOFFICE_CREDENTIALS_PROVIDER_ID;

export type AdminRuntimeUser = BackofficeAuthUser;
export type AdminRuntimeIdentity = BackofficeIdentityState;

export async function authorizeAdminCredentials(credentials: Record<string, unknown> | undefined) {
  return authorizeBackofficeCredentials(credentials);
}

export async function refreshAdminIdentity(sessionLike: { sub?: string | null; email?: string | null }) {
  return refreshBackofficeIdentity(sessionLike);
}

export async function getAdminIdentityFromSession(session: unknown) {
  return getBackofficeIdentityFromSession(session);
}

export function resolveAdminHomePath(session: unknown) {
  return resolveBackofficeHomePath(session);
}
