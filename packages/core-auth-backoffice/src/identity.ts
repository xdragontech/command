import bcrypt from "bcryptjs";
import {
  BackofficeMfaMethod,
  BackofficeRole,
  BackofficeUserStatus,
  BrandStatus,
  type Prisma,
} from "@prisma/client";
import { getConfiguredProtectedBackofficeEmail } from "@command/core-config";
import { prisma } from "@command/core-db";
import { deriveBackofficeMfaState, type BackofficeMfaState } from "./mfa";
import {
  BACKOFFICE_AUTH_SCOPE,
  getAuthScope,
  getBackofficeRole,
  getSessionEmail,
  getSessionUsername,
  isBackofficeSession,
} from "./scopes";

type BrandAccessRow = {
  id: string;
  brandKey: string;
  status: BrandStatus;
};

type BackofficeUserWithAccess = Prisma.BackofficeUserGetPayload<{
  include: {
    brandAccesses: {
      include: {
        brand: {
          select: {
            id: true;
            brandKey: true;
            status: true;
          };
        };
      };
    };
  };
}>;

export type BackofficeIdentityState = {
  id: string;
  email: string | null;
  username: string;
  role: BackofficeRole;
  status: BackofficeUserStatus;
  mfaMethod: BackofficeMfaMethod | null;
  mfaState: BackofficeMfaState;
  mfaEnabledAt: string | null;
  allowedBrandIds: string[];
  allowedBrandKeys: string[];
  lastSelectedBrandKey: string | null;
  displayName: string;
};

export type BackofficeAuthUser = {
  id: string;
  email?: string;
  name: string;
  username: string;
  role: "ADMIN";
  backofficeRole: BackofficeRole;
  status: BackofficeUserStatus;
  authScope: typeof BACKOFFICE_AUTH_SCOPE;
  mfaMethod: BackofficeMfaMethod | null;
  mfaState: BackofficeMfaState;
  mfaEnabledAt: string | null;
  allowedBrandIds: string[];
  allowedBrandKeys: string[];
  lastSelectedBrandKey: string | null;
};

function normalizeEmail(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeUsername(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toDisplayName(user: { username: string; email: string | null }) {
  return user.email || user.username;
}

function resolveBackofficeRole(role: BackofficeRole, email: string | null | undefined, username: string | null | undefined) {
  return isProtectedBackofficeIdentity(email, username) ? BackofficeRole.SUPERADMIN : role;
}

function getAccessibleBrands(rows: Array<{ brand: BrandAccessRow }>): BrandAccessRow[] {
  return rows
    .map((row) => row.brand)
    .filter((brand) => brand && brand.status !== BrandStatus.DISABLED);
}

function toBackofficeIdentityState(user: BackofficeUserWithAccess): BackofficeIdentityState {
  const accessibleBrands = getAccessibleBrands(user.brandAccesses);
  const allowedBrandIds = accessibleBrands.map((brand) => brand.id);
  const allowedBrandKeys = accessibleBrands.map((brand) => brand.brandKey);
  const role = resolveBackofficeRole(user.role, user.email, user.username);

  return {
    id: user.id,
    email: user.email || null,
    username: user.username,
    role,
    status: user.status,
    mfaMethod: user.mfaMethod || null,
    mfaState: deriveBackofficeMfaState({
      mfaMethod: user.mfaMethod,
      mfaEnabledAt: user.mfaEnabledAt,
      mfaSecretEncrypted: user.mfaSecretEncrypted,
      mfaRecoveryCodesEncrypted: user.mfaRecoveryCodesEncrypted,
    }),
    mfaEnabledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
    allowedBrandIds,
    allowedBrandKeys,
    lastSelectedBrandKey:
      user.lastSelectedBrandKey && allowedBrandKeys.includes(user.lastSelectedBrandKey)
        ? user.lastSelectedBrandKey
        : null,
    displayName: toDisplayName(user),
  };
}

function toBackofficeAuthUser(state: BackofficeIdentityState): BackofficeAuthUser {
  return {
    id: state.id,
    email: state.email || undefined,
    name: state.displayName,
    username: state.username,
    role: "ADMIN",
    backofficeRole: state.role,
    status: state.status,
    authScope: BACKOFFICE_AUTH_SCOPE,
    mfaMethod: state.mfaMethod,
    mfaState: state.mfaState,
    mfaEnabledAt: state.mfaEnabledAt,
    allowedBrandIds: state.allowedBrandIds,
    allowedBrandKeys: state.allowedBrandKeys,
    lastSelectedBrandKey: state.lastSelectedBrandKey,
  };
}

export function isProtectedBackofficeIdentity(email: string | null | undefined, _username: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  const protectedEmail = getConfiguredProtectedBackofficeEmail();
  return Boolean(normalizedEmail && protectedEmail && normalizedEmail === protectedEmail);
}

async function fetchBackofficeUserByIdentifier(identifier: string): Promise<BackofficeUserWithAccess | null> {
  return prisma.backofficeUser.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }],
    },
    include: {
      brandAccesses: {
        include: {
          brand: {
            select: {
              id: true,
              brandKey: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

async function fetchBackofficeUserById(id: string): Promise<BackofficeUserWithAccess | null> {
  return prisma.backofficeUser.findUnique({
    where: { id },
    include: {
      brandAccesses: {
        include: {
          brand: {
            select: {
              id: true,
              brandKey: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

export async function authorizeBackofficeCredentials(
  credentials: Record<string, unknown> | undefined
): Promise<BackofficeAuthUser | null> {
  const identifierRaw = String(credentials?.email || credentials?.username || "").trim();
  const identifier = normalizeUsername(identifierRaw);
  const password = String(credentials?.password || "");

  if (!identifier || !password) return null;

  const user = await fetchBackofficeUserByIdentifier(identifier);

  if (!user) return null;
  if (user.status === BackofficeUserStatus.BLOCKED) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  const state = toBackofficeIdentityState(user);
  if (state.role !== BackofficeRole.SUPERADMIN && state.allowedBrandIds.length === 0) {
    return null;
  }

  return toBackofficeAuthUser(state);
}

export async function refreshBackofficeIdentity(sessionLike: { sub?: string | null; email?: string | null }): Promise<BackofficeAuthUser | null> {
  const tokenId = String(sessionLike.sub || "");

  if (!tokenId) return null;

  const user = await fetchBackofficeUserById(tokenId);
  if (!user) return null;

  const state = toBackofficeIdentityState(user);
  if (state.role !== BackofficeRole.SUPERADMIN && state.allowedBrandIds.length === 0) {
    return null;
  }

  return toBackofficeAuthUser(state);
}

export async function getBackofficeIdentityFromSession(session: unknown): Promise<BackofficeIdentityState | null> {
  if (getAuthScope(session) !== BACKOFFICE_AUTH_SCOPE) return null;

  const hydrated = await refreshBackofficeIdentity({
    sub:
      (session as any)?.user?.id ||
      (session as any)?.id ||
      (session as any)?.sub ||
      null,
    email:
      (session as any)?.user?.email ||
      (session as any)?.email ||
      null,
  });

  if (!hydrated) return null;

  return {
    id: hydrated.id,
    email: hydrated.email || null,
    username: hydrated.username,
    role: hydrated.backofficeRole,
    status: hydrated.status,
    mfaMethod: hydrated.mfaMethod,
    mfaState: hydrated.mfaState,
    mfaEnabledAt: hydrated.mfaEnabledAt,
    allowedBrandIds: hydrated.allowedBrandIds,
    allowedBrandKeys: hydrated.allowedBrandKeys,
    lastSelectedBrandKey: hydrated.lastSelectedBrandKey,
    displayName: hydrated.name,
  };
}

export function resolveBackofficeHomePath(session: unknown): string {
  return getBackofficeRole(session) === BackofficeRole.SUPERADMIN ? "/admin/dashboard" : "/admin/library";
}

export function describeBackofficePrincipal(session: unknown): string | null {
  return getSessionEmail(session) || getSessionUsername(session);
}

export function isBackofficeSessionLike(session: unknown): boolean {
  return isBackofficeSession(session);
}
