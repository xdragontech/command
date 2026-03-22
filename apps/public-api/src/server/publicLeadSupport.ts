import type { NextApiRequest, NextApiResponse } from "next";

export type PublicLeadRequestIdentity = {
  ip: string;
  userAgent: string | null;
  referer: string | null;
  countryIso2: string | null;
  countryName: string | null;
};

function getHeader(req: NextApiRequest, name: string) {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

export function getClientIp(req: NextApiRequest): string {
  const cfIp = getHeader(req, "cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwardedFor = getHeader(req, "x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = getHeader(req, "x-real-ip");
  if (realIp) return realIp.trim();

  const socketIp = req.socket?.remoteAddress;
  if (typeof socketIp === "string" && socketIp) return socketIp;

  return "unknown";
}

function getCountryIso2(req: NextApiRequest) {
  const value = getHeader(req, "cf-ipcountry");
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized && normalized !== "XX" ? normalized : null;
}

function toCountryName(iso2: string | null) {
  if (!iso2) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return (display.of(iso2) as string) || null;
  } catch {
    return null;
  }
}

export function getPublicLeadRequestIdentity(req: NextApiRequest): PublicLeadRequestIdentity {
  const countryIso2 = getCountryIso2(req);

  return {
    ip: getClientIp(req),
    userAgent: getHeader(req, "user-agent")?.trim() || null,
    referer: getHeader(req, "referer")?.trim() || null,
    countryIso2,
    countryName: toCountryName(countryIso2),
  };
}

async function upstashIncr(key: string): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { result?: number };
    return typeof data?.result === "number" ? data.result : null;
  } catch (error) {
    console.warn("Lead rate limit increment failed; allowing request", error);
    return null;
  }
}

async function upstashExpire(key: string, ttlSeconds: number): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  await fetch(`${url}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

async function upstashLpush(key: string, value: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  await fetch(`${url}/lpush/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

async function upstashLtrim(key: string, start: number, stop: number): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  await fetch(`${url}/ltrim/${encodeURIComponent(key)}/${start}/${stop}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

export async function logLeadEvent(kind: "contact" | "chat", payload: Record<string, unknown>) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  const key = `leadlog:${kind}`;
  const entry = JSON.stringify(payload);
  await upstashLpush(key, entry);
  await upstashLtrim(key, 0, 999);
  await upstashExpire(key, 60 * 60 * 24 * 90);
}

export type PublicLeadRateLimitConfig = {
  name: string;
  perMinute: number;
  perHour: number;
  scopeKey?: string | null;
};

export async function enforcePublicLeadRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  config: PublicLeadRateLimitConfig
) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;

  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const minuteWindow = Math.floor(now / 60_000);
    const hourWindow = Math.floor(now / 3_600_000);
    const scope = config.scopeKey ? `${config.scopeKey}:` : "";
    const minuteKey = `rl:${config.name}:${scope}m:${minuteWindow}:${ip}`;
    const hourKey = `rl:${config.name}:${scope}h:${hourWindow}:${ip}`;

    const minuteCount = await upstashIncr(minuteKey);
    if (minuteCount === 1) await upstashExpire(minuteKey, 60);

    const hourCount = await upstashIncr(hourKey);
    if (hourCount === 1) await upstashExpire(hourKey, 3600);

    const minuteExceeded = typeof minuteCount === "number" && minuteCount > config.perMinute;
    const hourExceeded = typeof hourCount === "number" && hourCount > config.perHour;

    if (minuteExceeded || hourExceeded) {
      const retryAfter = minuteExceeded ? 60 : 3600;
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        ok: false,
        error: "Rate limit exceeded. Please try again shortly.",
      });
      return false;
    }
  } catch (error) {
    console.warn("Lead rate limiting failed; allowing request", error);
  }

  return true;
}

export function cleanString(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
