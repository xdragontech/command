import type { NextApiRequest, NextApiResponse } from "next";
import { requirePublicApiContext, sendPublicApiError } from "../../../server/auth";
import {
  enforcePublicLeadRateLimit,
  getPublicLeadRequestIdentity,
} from "../../../server/publicLeadSupport";
import { capturePublicApiRoutePerformance } from "../../../server/performanceMetrics";
import { submitPublicContact } from "../../../server/publicContact";
import { recordWebsiteConversionFromRequest } from "../../../server/websiteAnalytics";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  const rateLimitOk = await enforcePublicLeadRateLimit(req, res, {
    name: "contact",
    perMinute: 5,
    perHour: 40,
    scopeKey: context.brand.brandKey,
  }, {
    trustForwardedClientHeaders: true,
  });
  if (!rateLimitOk) return;

  try {
    const result = await capturePublicApiRoutePerformance({
      req,
      brandId: context.brand.brandId,
      routeKey: "CONTACT",
      options: { trustForwardedClientHeaders: true },
      operation: async () => {
        const contactResult = await submitPublicContact({
          brand: context.brand,
          integration: context.integration,
          identity: getPublicLeadRequestIdentity(req, { trustForwardedClientHeaders: true }),
          payload: req.body || {},
        });

        if (contactResult.analytics) {
          await recordWebsiteConversionFromRequest({
            req,
            brandId: context.brand.brandId,
            eventId: contactResult.analytics.conversionEventId,
            conversionType: "CONTACT_SUBMIT",
            raw: contactResult.analytics.raw,
            options: { trustForwardedClientHeaders: true },
          });
        }

        return contactResult;
      },
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
