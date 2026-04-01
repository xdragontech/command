import type { NextApiRequest, NextApiResponse } from "next";
import {
  createSchedulePublicFeed,
  listSchedulePublicFeeds,
} from "@command/core-scheduling";
import { requireBackofficeApi } from "../../../../../../server/backofficeAuth";
import { toSchedulingScope } from "../../../../../../server/schedulingScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  const seriesId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!seriesId) return json(res, 400, { ok: false, error: "Series id is required" });

  try {
    if (req.method === "GET") {
      const feeds = await listSchedulePublicFeeds({
        scope: toSchedulingScope(auth.principal),
        seriesId,
      });
      return json(res, 200, { ok: true, feeds });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const feed = await createSchedulePublicFeed({
        scope: toSchedulingScope(auth.principal),
        input: {
          ...body,
          scheduleEventSeriesId: seriesId,
        },
      });
      return json(res, 200, { ok: true, feed });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to manage schedule feeds";
    return json(res, 400, { ok: false, error: message });
  }
}
