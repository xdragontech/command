import type { NextApiRequest, NextApiResponse } from "next";
import {
  PublicScheduleQueryError,
  getPublicScheduleFeed,
} from "@command/core-scheduling";
import { requirePublicApiContext, sendPublicApiError } from "../../../../../server/auth";
import { enforcePublicRateLimit } from "../../../../../server/publicLeadSupport";

const FEED_RATE_LIMIT = {
  perMinute: 60,
  perHour: 1000,
} as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  const feedId = Array.isArray(req.query.feedId) ? req.query.feedId[0] : req.query.feedId;
  if (!feedId) {
    return res.status(400).json({ ok: false, error: "Feed ID is required" });
  }

  const rateLimitOk = await enforcePublicRateLimit(
    req,
    res,
    {
      name: "schedule_feed",
      perMinute: FEED_RATE_LIMIT.perMinute,
      perHour: FEED_RATE_LIMIT.perHour,
      scopeKey: `${context.brand.brandId}:${feedId}`,
    },
    { trustForwardedClientHeaders: true }
  );
  if (!rateLimitOk) return;

  try {
    const result = await getPublicScheduleFeed({
      brandId: context.brand.brandId,
      feedId,
    });

    return res.status(200).json({ ok: true, feedId: result.feedId, items: result.items });
  } catch (error) {
    if (error instanceof PublicScheduleQueryError) {
      const status = error.message === "Feed not found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: error.message });
    }

    return sendPublicApiError(res, error);
  }
}
