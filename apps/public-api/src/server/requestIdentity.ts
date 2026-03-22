import type { NextApiRequest } from "next";
import type { ExternalRequestIdentity } from "@command/core-auth-external";

function getHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function getClientIp(req: NextApiRequest) {
  const cfIp = getHeader(req, "cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xff = getHeader(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
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

export function getExternalRequestIdentity(req: NextApiRequest): ExternalRequestIdentity {
  const countryIso2 = getCountryIso2(req);
  const userAgent = getHeader(req, "user-agent")?.trim() || null;

  return {
    ip: getClientIp(req),
    userAgent,
    countryIso2,
    countryName: toCountryName(countryIso2),
  };
}
