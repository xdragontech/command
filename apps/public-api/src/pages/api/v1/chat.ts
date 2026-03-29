import type { NextApiRequest, NextApiResponse } from "next";
import { requirePublicApiContext, sendPublicApiError } from "../../../server/auth";
import {
  enforcePublicLeadRateLimit,
  getPublicLeadRequestIdentity,
} from "../../../server/publicLeadSupport";
import { submitPublicChat } from "../../../server/publicChat";
import { recordWebsiteConversionFromRequest } from "../../../server/websiteAnalytics";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  const rateLimitOk = await enforcePublicLeadRateLimit(req, res, {
    name: "chat",
    perMinute: 20,
    perHour: 200,
    scopeKey: context.brand.brandKey,
  }, {
    trustForwardedClientHeaders: true,
  });
  if (!rateLimitOk) return;

  try {
    const result = await submitPublicChat({
      brand: context.brand,
      integration: context.integration,
      identity: getPublicLeadRequestIdentity(req, { trustForwardedClientHeaders: true }),
      payload: req.body || {},
    });

    if (result.analytics) {
      await recordWebsiteConversionFromRequest({
        req,
        brandId: context.brand.brandId,
        eventId: result.analytics.conversionEventId,
        conversionType: "CHAT_LEAD_SUBMIT",
        raw: result.analytics.raw,
        options: { trustForwardedClientHeaders: true },
      });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
