import type { NextApiRequest } from "next";

export type TrustedClientIdentityOptions = {
  trustForwardedClientHeaders?: boolean;
};

const FORWARDED_CLIENT_IP_HEADER = "x-command-client-ip";
const FORWARDED_CLIENT_COUNTRY_HEADER = "x-command-client-country-iso2";
const FORWARDED_CLIENT_USER_AGENT_HEADER = "x-command-client-user-agent";
const FORWARDED_CLIENT_REFERER_HEADER = "x-command-client-referer";

export function getHeader(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function getForwardedHeader(
  req: NextApiRequest,
  headerName: string,
  options?: TrustedClientIdentityOptions
) {
  if (!options?.trustForwardedClientHeaders) return undefined;
  const value = getHeader(req, headerName);
  return value?.trim() || undefined;
}

export function getClientIp(req: NextApiRequest, options?: TrustedClientIdentityOptions) {
  const forwardedIp = getForwardedHeader(req, FORWARDED_CLIENT_IP_HEADER, options);
  if (forwardedIp) return forwardedIp;

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

export function getCountryIso2(req: NextApiRequest, options?: TrustedClientIdentityOptions) {
  const forwardedCountry = getForwardedHeader(req, FORWARDED_CLIENT_COUNTRY_HEADER, options);
  const rawValue = forwardedCountry ?? getHeader(req, "cf-ipcountry");
  if (!rawValue) return null;

  const normalized = rawValue.trim().toUpperCase();
  return normalized && normalized !== "XX" ? normalized : null;
}

export function getUserAgent(req: NextApiRequest, options?: TrustedClientIdentityOptions) {
  const forwardedUserAgent = getForwardedHeader(req, FORWARDED_CLIENT_USER_AGENT_HEADER, options);
  return forwardedUserAgent ?? getHeader(req, "user-agent")?.trim() ?? null;
}

export function getReferer(req: NextApiRequest, options?: TrustedClientIdentityOptions) {
  const forwardedReferer = getForwardedHeader(req, FORWARDED_CLIENT_REFERER_HEADER, options);
  return forwardedReferer ?? getHeader(req, "referer")?.trim() ?? null;
}

export function toCountryName(iso2: string | null) {
  if (!iso2) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return (display.of(iso2) as string) || null;
  } catch {
    return null;
  }
}
