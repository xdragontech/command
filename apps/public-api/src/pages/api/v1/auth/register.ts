import type { NextApiRequest, NextApiResponse } from "next";
import { registerExternalUser } from "@command/core-auth-external";
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
      routeKey: "SIGNUP",
      statusCode: 201,
      options: { trustForwardedClientHeaders: true },
      operation: async () => {
        const result = await registerExternalUser({
          brandKey: context.brand.brandKey,
          publicOrigin: context.brand.publicOrigin,
          email: req.body?.email,
          password: req.body?.password,
          name: req.body?.name,
        });

        if (result.analytics?.createdUserId) {
          await recordWebsiteConversionFromRequest({
            req,
            brandId: context.brand.brandId,
            eventId: `client-signup-created:${result.analytics.createdUserId}`,
            conversionType: "CLIENT_SIGNUP_CREATED",
            raw: {
              externalUserId: result.analytics.createdUserId,
            },
            options: { trustForwardedClientHeaders: true },
          });
        }

        return result;
      },
    });

    return res.status(201).json({
      ok: true,
      verificationRequired: true,
    });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
