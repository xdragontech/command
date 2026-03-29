import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getRuntimeAllowedHosts } from "@command/core-brand-runtime";
import {
  BACKOFFICE_AUTH_SCOPE,
  BACKOFFICE_CREDENTIALS_PROVIDER_ID,
  authorizeBackofficeCredentials,
  recordSuccessfulBackofficeLogin,
  refreshBackofficeIdentity,
} from "@command/core-auth-backoffice";
import { isInstallInitialized } from "./installState";
import { getBackofficeRequestIdentity } from "./backofficeRequestIdentity";

const IS_PREVIEW = process.env.VERCEL_ENV === "preview";
const IS_SECURE_COOKIE_ENV = process.env.NODE_ENV === "production";

function cookieName(kind: "session-token" | "callback-url") {
  if (!IS_SECURE_COOKIE_ENV) return `command-next-auth.${kind}`;
  return IS_PREVIEW ? `__Secure-stg-command-next-auth.${kind}` : `__Secure-command-next-auth.${kind}`;
}

function csrfCookieName() {
  if (!IS_SECURE_COOKIE_ENV) return "command-next-auth.csrf-token";
  return IS_PREVIEW ? "stg-command-next-auth.csrf-token" : "command-next-auth.csrf-token";
}

function cookieOptions({ httpOnly = true }: { httpOnly?: boolean } = {}) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    path: "/",
    secure: IS_SECURE_COOKIE_ENV,
  };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: IS_SECURE_COOKIE_ENV,
  pages: {
    signIn: "/admin/signin",
  },
  cookies: {
    sessionToken: {
      name: cookieName("session-token"),
      options: cookieOptions({ httpOnly: true }),
    },
    callbackUrl: {
      name: cookieName("callback-url"),
      options: cookieOptions({ httpOnly: true }),
    },
    csrfToken: {
      name: csrfCookieName(),
      options: cookieOptions({ httpOnly: true }),
    },
  },
  providers: [
    CredentialsProvider({
      id: BACKOFFICE_CREDENTIALS_PROVIDER_ID,
      name: "Backoffice Credentials",
      credentials: {
        email: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!(await isInstallInitialized())) {
          return null;
        }
        const user = await authorizeBackofficeCredentials(credentials);
        if (user && user.mfaState !== "ENABLED") {
          try {
            await recordSuccessfulBackofficeLogin({
              backofficeUserId: user.id,
              identity: getBackofficeRequestIdentity(req as any),
            });
          } catch (error) {
            console.error("Backoffice login telemetry write failed", error);
          }
        }
        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const backofficeMfaState =
          (user as any).authScope === BACKOFFICE_AUTH_SCOPE ? (user as any).mfaState || "DISABLED" : "DISABLED";

        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        (token as any).role = (user as any).role;
        (token as any).status = (user as any).status;
        (token as any).authScope = (user as any).authScope;
        (token as any).backofficeRole = (user as any).backofficeRole || null;
        (token as any).mfaMethod = (user as any).mfaMethod || null;
        (token as any).mfaState = (user as any).mfaState || "DISABLED";
        (token as any).mfaEnabledAt = (user as any).mfaEnabledAt || null;
        (token as any).username = (user as any).username || null;
        (token as any).allowedBrandKeys = (user as any).allowedBrandKeys || [];
        (token as any).allowedBrandIds = (user as any).allowedBrandIds || [];
        (token as any).lastSelectedBrandKey = (user as any).lastSelectedBrandKey || null;
        (token as any).backofficeMfaChallenge =
          backofficeMfaState === "ENABLED" ? crypto.randomUUID() : null;
      }

      const authScope = (token as any).authScope;
      if (authScope !== BACKOFFICE_AUTH_SCOPE) {
        return token;
      }

      const refreshed = await refreshBackofficeIdentity({
        sub: typeof token.sub === "string" ? token.sub : null,
        email: typeof token.email === "string" ? token.email : null,
      });

      if (!refreshed) {
        (token as any).status = "BLOCKED";
        (token as any).mfaMethod = null;
        (token as any).mfaState = "DISABLED";
        (token as any).mfaEnabledAt = null;
        (token as any).allowedBrandKeys = [];
        (token as any).allowedBrandIds = [];
        (token as any).backofficeMfaChallenge = null;
        return token;
      }

      token.sub = refreshed.id;
      token.email = refreshed.email;
      token.name = refreshed.name;
      (token as any).role = refreshed.role;
      (token as any).status = refreshed.status;
      (token as any).authScope = refreshed.authScope;
      (token as any).backofficeRole = refreshed.backofficeRole;
      (token as any).mfaMethod = refreshed.mfaMethod;
      (token as any).mfaState = refreshed.mfaState;
      (token as any).mfaEnabledAt = refreshed.mfaEnabledAt;
      (token as any).username = refreshed.username;
      (token as any).allowedBrandKeys = refreshed.allowedBrandKeys;
      (token as any).allowedBrandIds = refreshed.allowedBrandIds;
      (token as any).lastSelectedBrandKey = refreshed.lastSelectedBrandKey;
      (token as any).backofficeMfaChallenge =
        refreshed.mfaState === "ENABLED"
          ? typeof (token as any).backofficeMfaChallenge === "string" && (token as any).backofficeMfaChallenge
            ? (token as any).backofficeMfaChallenge
            : crypto.randomUUID()
          : null;

      return token;
    },

    async session({ session, token }) {
      const sessionUser =
        session.user ??
        ((session as any).user = {
          name: null,
          email: null,
          image: null,
        });

      sessionUser.email = typeof token.email === "string" ? token.email : sessionUser.email;
      sessionUser.name = typeof token.name === "string" ? token.name : sessionUser.name;
      (sessionUser as any).id = typeof token.sub === "string" ? token.sub : undefined;
      (sessionUser as any).role = (token as any).role || "ADMIN";
      (sessionUser as any).status = (token as any).status || "ACTIVE";
      (sessionUser as any).authScope = (token as any).authScope || null;
      (sessionUser as any).backofficeRole = (token as any).backofficeRole || null;
      (sessionUser as any).mfaMethod = (token as any).mfaMethod || null;
      (sessionUser as any).mfaState = (token as any).mfaState || "DISABLED";
      (sessionUser as any).mfaEnabledAt = (token as any).mfaEnabledAt || null;
      (sessionUser as any).backofficeMfaRequired =
        (token as any).authScope === BACKOFFICE_AUTH_SCOPE && (token as any).mfaState === "ENABLED";
      (sessionUser as any).backofficeMfaChallenge = (token as any).backofficeMfaChallenge || null;
      (sessionUser as any).username = (token as any).username || null;
      (sessionUser as any).allowedBrandKeys = Array.isArray((token as any).allowedBrandKeys)
        ? (token as any).allowedBrandKeys
        : [];
      (sessionUser as any).lastSelectedBrandKey = (token as any).lastSelectedBrandKey || null;

      (session as any).role = (token as any).role || "ADMIN";
      (session as any).status = (token as any).status || "ACTIVE";
      (session as any).authScope = (token as any).authScope || null;
      (session as any).backofficeRole = (token as any).backofficeRole || null;
      (session as any).mfaMethod = (token as any).mfaMethod || null;
      (session as any).mfaState = (token as any).mfaState || "DISABLED";
      (session as any).mfaEnabledAt = (token as any).mfaEnabledAt || null;
      (session as any).backofficeMfaRequired =
        (token as any).authScope === BACKOFFICE_AUTH_SCOPE && (token as any).mfaState === "ENABLED";
      (session as any).backofficeMfaChallenge = (token as any).backofficeMfaChallenge || null;
      (session as any).allowedBrandKeys = Array.isArray((token as any).allowedBrandKeys)
        ? (token as any).allowedBrandKeys
        : [];
      (session as any).allowedBrandIds = Array.isArray((token as any).allowedBrandIds)
        ? (token as any).allowedBrandIds
        : [];
      (session as any).lastSelectedBrandKey = (token as any).lastSelectedBrandKey || null;
      return session;
    },

    async redirect({ url, baseUrl }) {
      try {
        if (url.startsWith("/")) return `${baseUrl}${url}`;

        const target = new URL(url);
        const host = target.hostname.toLowerCase();
        const baseHost = new URL(baseUrl).hostname.toLowerCase();
        const allowedHosts = await getRuntimeAllowedHosts([baseHost]);

        if (allowedHosts.has(host)) return url;
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
  },
  logger: {
    error(code, metadata) {
      console.error("NextAuth error", code, metadata);
    },
    warn(code) {
      console.warn("NextAuth warn", code);
    },
  },
};

export function authHandler(req: NextApiRequest, res: NextApiResponse) {
  return NextAuth(req, res, authOptions);
}
