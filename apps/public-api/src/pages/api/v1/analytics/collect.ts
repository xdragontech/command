import type { NextApiRequest, NextApiResponse } from "next";
import {
  WebsiteAnalyticsValidationError,
  ingestWebsiteAnalytics,
} from "@command/core-website-analytics";
import { requirePublicApiContext, sendPublicApiError } from "../../../../server/auth";
import {
  getClientIp,
  getCountryIso2,
  getHeader,
  getUserAgent,
  toCountryName,
} from "../../../../server/clientIdentity";

const WEBSITE_SESSION_HEADER = "x-command-website-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  const sessionId = getHeader(req, WEBSITE_SESSION_HEADER)?.trim() || "";
  if (!sessionId) {
    return res.status(400).json({
      ok: false,
      error: "Missing website session header.",
    });
  }

  const countryIso2 = getCountryIso2(req, { trustForwardedClientHeaders: true });

  try {
    const result = await ingestWebsiteAnalytics({
      brandId: context.brand.brandId,
      sessionId,
      identity: {
        ip: getClientIp(req, { trustForwardedClientHeaders: true }),
        countryIso2,
        countryName: toCountryName(countryIso2),
        userAgent: getUserAgent(req, { trustForwardedClientHeaders: true }),
      },
      payload: req.body || {},
    });

    return res.status(200).json({
      ok: true,
      sessionId: result.sessionId,
      acceptedEvents: result.acceptedEvents,
      duplicateEvents: result.duplicateEvents,
    });
  } catch (error) {
    if (error instanceof WebsiteAnalyticsValidationError) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }

    return sendPublicApiError(res, error);
  }
}
