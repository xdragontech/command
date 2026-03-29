import type { NextApiRequest } from "next";
import {
  recordWebsiteAnalyticsConversion,
  type WebsiteAnalyticsConversionType,
} from "@command/core-website-analytics";
import {
  getClientIp,
  getCountryIso2,
  getHeader,
  getReferer,
  getUserAgent,
  toCountryName,
  type TrustedClientIdentityOptions,
} from "./clientIdentity";

const WEBSITE_SESSION_HEADER = "x-command-website-session";

export function getWebsiteAnalyticsSessionId(req: NextApiRequest) {
  const value = getHeader(req, WEBSITE_SESSION_HEADER);
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function recordWebsiteConversionFromRequest(args: {
  req: NextApiRequest;
  brandId: string;
  eventId: string;
  conversionType: WebsiteAnalyticsConversionType;
  raw?: unknown;
  options?: TrustedClientIdentityOptions;
}) {
  const sessionId = getWebsiteAnalyticsSessionId(args.req);
  if (!sessionId) return { linked: false as const, reason: "missing-session" as const };

  const countryIso2 = getCountryIso2(args.req, args.options);

  try {
    const result = await recordWebsiteAnalyticsConversion({
      brandId: args.brandId,
      sessionId,
      eventId: args.eventId,
      conversionType: args.conversionType,
      identity: {
        ip: getClientIp(args.req, args.options),
        countryIso2,
        countryName: toCountryName(countryIso2),
        userAgent: getUserAgent(args.req, args.options),
      },
      // The forwarded referer from the BFF is the current public page URL.
      // Acquisition/source attribution still belongs to the WebsiteSession and can
      // be enriched later if the analytics batch arrives after the conversion.
      url: getReferer(args.req, args.options),
      raw: args.raw,
    });

    return {
      linked: result.linked,
      duplicate: result.duplicate,
    };
  } catch (error) {
    console.error("Website analytics conversion linkage failed", {
      brandId: args.brandId,
      conversionType: args.conversionType,
      eventId: args.eventId,
      error: error instanceof Error ? error.message : String(error),
    });

    return { linked: false as const, reason: "error" as const };
  }
}
