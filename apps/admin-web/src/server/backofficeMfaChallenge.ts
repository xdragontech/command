import crypto from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import {
  getBackofficeMfaChallenge,
  getBackofficeMfaEnabledAt,
  getSessionUserId,
  requiresBackofficeMfaChallenge,
} from "@command/core-auth-backoffice";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
const IS_PREVIEW = process.env.VERCEL_ENV === "preview";
const IS_SECURE_COOKIE_ENV = process.env.NODE_ENV === "production";

type VerifiedBackofficeMfaPayload = {
  userId: string;
  challenge: string;
  enabledAt: string;
  verifiedAt: number;
  expiresAt: number;
};

function backofficeMfaCookieName(): string {
  if (!IS_SECURE_COOKIE_ENV) return "command-backoffice-mfa";
  return IS_PREVIEW ? "__Secure-stg-command-backoffice-mfa" : "__Secure-command-backoffice-mfa";
}

function getCookieSigningKey(): Buffer {
  const secret = String(process.env.NEXTAUTH_SECRET || "").trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for backoffice MFA challenge cookies");
  }
  return crypto.createHash("sha256").update(`backoffice-mfa:${secret}`).digest();
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getCookieSigningKey()).update(payload).digest("base64url");
}

function encodePayload(payload: VerifiedBackofficeMfaPayload): string {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${raw}.${signPayload(raw)}`;
}

function decodePayload(value: string | null | undefined): VerifiedBackofficeMfaPayload | null {
  const [raw, signature] = String(value || "").split(".");
  if (!raw || !signature) return null;
  if (signPayload(raw) !== signature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.challenge !== "string" ||
      typeof parsed.enabledAt !== "string" ||
      typeof parsed.verifiedAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function readCookie(req: Pick<IncomingMessage, "headers"> & { cookies?: Record<string, string> }, name: string): string | null {
  const direct = req.cookies?.[name];
  if (typeof direct === "string" && direct) return direct;

  const header = req.headers?.cookie;
  if (!header) return null;

  for (const chunk of header.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(trimmed.slice(separator + 1));
  }

  return null;
}

function serializeCookie(name: string, value: string, options?: { maxAge?: number; expires?: Date }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
  ];

  if (IS_SECURE_COOKIE_ENV) {
    parts.push("Secure");
  }

  if (typeof options?.maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join("; ");
}

function appendSetCookie(res: Pick<ServerResponse, "getHeader" | "setHeader">, value: string) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", value);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current.map(String), value]);
    return;
  }

  res.setHeader("Set-Cookie", [String(current), value]);
}

export function clearBackofficeMfaChallengeCookie(res: Pick<ServerResponse, "getHeader" | "setHeader">) {
  appendSetCookie(
    res,
    serializeCookie(backofficeMfaCookieName(), "", {
      maxAge: 0,
      expires: new Date(0),
    })
  );
}

export function setBackofficeMfaChallengeCookie(
  res: Pick<ServerResponse, "getHeader" | "setHeader">,
  sessionLike: unknown
) {
  const userId = getSessionUserId(sessionLike);
  const challenge = getBackofficeMfaChallenge(sessionLike);
  const enabledAt = getBackofficeMfaEnabledAt(sessionLike);

  if (!userId || !challenge || !enabledAt) {
    throw new Error("Backoffice MFA challenge session state is incomplete");
  }

  appendSetCookie(
    res,
    serializeCookie(
      backofficeMfaCookieName(),
      encodePayload({
        userId,
        challenge,
        enabledAt,
        verifiedAt: Date.now(),
        expiresAt: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
      }),
      { maxAge: COOKIE_MAX_AGE_SECONDS }
    )
  );
}

export function hasSatisfiedBackofficeMfaChallenge(
  req: Pick<IncomingMessage, "headers"> & { cookies?: Record<string, string> },
  sessionLike: unknown
): boolean {
  if (!requiresBackofficeMfaChallenge(sessionLike)) return true;

  const userId = getSessionUserId(sessionLike);
  const challenge = getBackofficeMfaChallenge(sessionLike);
  const enabledAt = getBackofficeMfaEnabledAt(sessionLike);
  if (!userId || !challenge || !enabledAt) return false;

  const payload = decodePayload(readCookie(req, backofficeMfaCookieName()));
  if (!payload) return false;
  if (payload.expiresAt <= Date.now()) return false;

  return payload.userId === userId && payload.challenge === challenge && payload.enabledAt === enabledAt;
}
