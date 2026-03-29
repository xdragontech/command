type HeaderCarrier = {
  headers: Record<string, string | string[] | undefined>;
};

export type BackofficeRequestIdentity = {
  ip: string;
  countryIso2: string | null;
  countryName: string | null;
  userAgent: string | null;
};

function getHeader(req: HeaderCarrier, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function getClientIp(req: HeaderCarrier) {
  const cfIp = getHeader(req, "cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xff = getHeader(req, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = getHeader(req, "x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

function getCountryIso2(req: HeaderCarrier) {
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

export function getBackofficeRequestIdentity(req: HeaderCarrier): BackofficeRequestIdentity {
  const countryIso2 = getCountryIso2(req);

  return {
    ip: getClientIp(req),
    countryIso2,
    countryName: toCountryName(countryIso2),
    userAgent: getHeader(req, "user-agent")?.trim() || null,
  };
}
