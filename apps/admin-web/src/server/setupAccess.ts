import crypto from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { MIN_BACKOFFICE_PASSWORD_LENGTH } from "@command/core-auth-backoffice";
import { getBackofficeBootstrapPasswordEnvKey } from "@command/core-config";

const COOKIE_MAX_AGE_SECONDS = 60 * 60;
const IS_PREVIEW = process.env.VERCEL_ENV === "preview";
const IS_SECURE_COOKIE_ENV = process.env.NODE_ENV === "production";

type SetupAccessPayload = {
  unlockedAt: number;
  expiresAt: number;
};

function setupAccessCookieName() {
  if (!IS_SECURE_COOKIE_ENV) return "command-setup-access";
  return IS_PREVIEW ? "__Secure-stg-command-setup-access" : "__Secure-command-setup-access";
}

export function getConfiguredSetupAccessPassword() {
  const key = getBackofficeBootstrapPasswordEnvKey();
  const password = String(process.env[key] || "").trim();

  if (!password) {
    throw new Error(`${key} is required to unlock /setup.`);
  }

  if (password.length < MIN_BACKOFFICE_PASSWORD_LENGTH) {
    throw new Error(`${key} must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters.`);
  }

  return password;
}

function getCookieSigningKey(): Buffer {
  const nextAuthSecret = String(process.env.NEXTAUTH_SECRET || "").trim();
  if (!nextAuthSecret) {
    throw new Error("NEXTAUTH_SECRET is required for setup-access cookies");
  }

  return crypto
    .createHash("sha256")
    .update(`setup-access:${nextAuthSecret}:${getConfiguredSetupAccessPassword()}`)
    .digest();
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getCookieSigningKey()).update(payload).digest("base64url");
}

function encodePayload(payload: SetupAccessPayload): string {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${raw}.${signPayload(raw)}`;
}

function decodePayload(value: string | null | undefined): SetupAccessPayload | null {
  const [raw, signature] = String(value || "").split(".");
  if (!raw || !signature) return null;
  if (signPayload(raw) !== signature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.unlockedAt !== "number" || typeof parsed.expiresAt !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function readCookie(
  req: Pick<IncomingMessage, "headers"> & { cookies?: Partial<Record<string, string>> },
  name: string
): string | null {
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
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", "HttpOnly"];

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

function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input).digest();
}

export function verifySetupUnlockPassword(candidate: string): boolean {
  const expected = getConfiguredSetupAccessPassword();
  const actual = String(candidate || "").trim();
  if (!actual) return false;

  return crypto.timingSafeEqual(sha256Buffer(actual), sha256Buffer(expected));
}

export function setSetupAccessCookie(res: Pick<ServerResponse, "getHeader" | "setHeader">) {
  appendSetCookie(
    res,
    serializeCookie(
      setupAccessCookieName(),
      encodePayload({
        unlockedAt: Date.now(),
        expiresAt: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
      }),
      { maxAge: COOKIE_MAX_AGE_SECONDS }
    )
  );
}

export function clearSetupAccessCookie(res: Pick<ServerResponse, "getHeader" | "setHeader">) {
  appendSetCookie(
    res,
    serializeCookie(setupAccessCookieName(), "", {
      maxAge: 0,
      expires: new Date(0),
    })
  );
}

export function hasSetupAccess(
  req: Pick<IncomingMessage, "headers"> & { cookies?: Partial<Record<string, string>> }
): boolean {
  try {
    const payload = decodePayload(readCookie(req, setupAccessCookieName()));
    if (!payload) return false;
    return payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}
