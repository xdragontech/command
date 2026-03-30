import type { NextApiRequest, NextApiResponse } from "next";
import { verifyExternalEmail } from "@command/core-auth-external";
import { requirePublicApiContext, sendPublicApiError } from "../../../../server/auth";
import { capturePublicApiRoutePerformance } from "../../../../server/performanceMetrics";
import { recordWebsiteConversionFromRequest } from "../../../../server/websiteAnalytics";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    await capturePublicApiRoutePerformance({
      req,
      brandId: context.brand.brandId,
      routeKey: "VERIFY_EMAIL",
      statusCode: 200,
      options: { trustForwardedClientHeaders: true },
      operation: async () => {
        const result = await verifyExternalEmail({
          brandKey: context.brand.brandKey,
          publicOrigin: context.brand.publicOrigin,
          token: req.body?.token,
        });

        if (result.analytics?.verifiedUserId) {
          await recordWebsiteConversionFromRequest({
            req,
            brandId: context.brand.brandId,
            eventId: `client-signup-verified:${result.analytics.verifiedUserId}`,
            conversionType: "CLIENT_SIGNUP_VERIFIED",
            raw: {
              externalUserId: result.analytics.verifiedUserId,
            },
            options: { trustForwardedClientHeaders: true },
          });
        }

        return result;
      },
    });

    return res.status(200).json({
      ok: true,
      verified: true,
    });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
