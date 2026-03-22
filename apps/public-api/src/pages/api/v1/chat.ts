import type { NextApiRequest, NextApiResponse } from "next";
import { requirePublicApiContext, sendPublicApiError } from "../../../server/auth";
import {
  enforcePublicLeadRateLimit,
  getPublicLeadRequestIdentity,
} from "../../../server/publicLeadSupport";
import { submitPublicChat } from "../../../server/publicChat";

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
  });
  if (!rateLimitOk) return;

  try {
    const result = await submitPublicChat({
      brand: context.brand,
      integration: context.integration,
      identity: getPublicLeadRequestIdentity(req),
      payload: req.body || {},
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
