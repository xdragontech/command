import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from "next";
import { BackofficeRole } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import {
  getBackofficeIdentityFromSession,
  getBackofficeRole,
  getSessionEmail,
  getSessionUsername,
  isBackofficeSession,
  requiresBackofficeMfaChallenge,
  resolveBackofficeHomePath,
  type BackofficeIdentityState,
} from "@command/core-auth-backoffice";
import { authOptions } from "./authOptions";
import { hasSatisfiedBackofficeMfaChallenge } from "./backofficeMfaChallenge";

type RequireBackofficeOptions = {
  callbackUrl?: string;
  superadminOnly?: boolean;
  allowPendingMfa?: boolean;
};

function buildAdminRedirect(callbackUrl?: string) {
  const target = callbackUrl || "/admin/library";
  return {
    redirect: {
      destination: `/admin/signin?callbackUrl=${encodeURIComponent(target)}`,
      permanent: false,
    },
  } as const;
}

function buildAdminMfaRedirect(callbackUrl?: string) {
  const target = callbackUrl || "/admin/library";
  return {
    redirect: {
      destination: `/admin/mfa?callbackUrl=${encodeURIComponent(target)}`,
      permanent: false,
    },
  } as const;
}

async function loadResolvedPrincipal(
  session: unknown,
  options?: RequireBackofficeOptions
): Promise<BackofficeIdentityState | null> {
  if (!isBackofficeSession(session)) return null;

  const principal = await getBackofficeIdentityFromSession(session);
  if (!principal) return null;
  if (options?.superadminOnly && principal.role !== BackofficeRole.SUPERADMIN) return null;

  return principal;
}

export function hasVerifiedBackofficeMfaForRequest(
  req:
    | Pick<NextApiRequest, "cookies" | "headers">
    | Pick<GetServerSidePropsContext["req"], "cookies" | "headers">,
  session: unknown
) {
  return hasSatisfiedBackofficeMfaChallenge(req as any, session);
}

export function requiresPendingBackofficeMfa(
  session: unknown,
  req:
    | Pick<NextApiRequest, "cookies" | "headers">
    | Pick<GetServerSidePropsContext["req"], "cookies" | "headers">
) {
  return requiresBackofficeMfaChallenge(session) && !hasVerifiedBackofficeMfaForRequest(req, session);
}

export function resolveBackofficePostAuthDestination(session: unknown): string {
  return resolveBackofficeHomePath(session);
}

export async function requireBackofficeApi(
  req: NextApiRequest,
  res: NextApiResponse,
  options?: RequireBackofficeOptions
) {
  const session = await getServerSession(req, res, authOptions);
  const principal = await loadResolvedPrincipal(session, options);

  if (!principal) {
    return { ok: false as const, session, principal: null, reason: "UNAUTHORIZED" as const };
  }

  if (!options?.allowPendingMfa && requiresPendingBackofficeMfa(session, req)) {
    return { ok: false as const, session, principal, reason: "MFA_REQUIRED" as const };
  }

  return { ok: true as const, session, principal, reason: null };
}

export async function requireBackofficePage(ctx: GetServerSidePropsContext, options?: RequireBackofficeOptions) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const principal = await loadResolvedPrincipal(session, options);

  if (!principal) {
    return {
      ok: false as const,
      session,
      principal: null,
      reason: "UNAUTHORIZED" as const,
      response: buildAdminRedirect(options?.callbackUrl || ctx.resolvedUrl || "/admin/library"),
    };
  }

  if (!options?.allowPendingMfa && requiresPendingBackofficeMfa(session, ctx.req)) {
    return {
      ok: false as const,
      session,
      principal,
      reason: "MFA_REQUIRED" as const,
      response: buildAdminMfaRedirect(options?.callbackUrl || ctx.resolvedUrl || resolveBackofficePostAuthDestination(session)),
    };
  }

  return {
    ok: true as const,
    session,
    principal,
    reason: null,
    response: null,
    loggedInAs: getSessionEmail(session) || getSessionUsername(session) || principal.displayName,
  };
}
