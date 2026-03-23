import type { NextApiRequest, NextApiResponse } from "next";
import { listScheduleConflicts } from "@command/core-scheduling";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import { toSchedulingScope } from "../../../../server/schedulingScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    const brandId = Array.isArray(req.query.brandId) ? req.query.brandId[0] : req.query.brandId;
    const occurrenceId = Array.isArray(req.query.occurrenceId) ? req.query.occurrenceId[0] : req.query.occurrenceId;
    const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
    const to = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to;
    const conflicts = await listScheduleConflicts({
      scope: toSchedulingScope(auth.principal),
      brandId: brandId || null,
      occurrenceId: occurrenceId || null,
      from: from || null,
      to: to || null,
    });

    return json(res, 200, { ok: true, conflicts });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to load schedule conflicts";
    return json(res, 400, { ok: false, error: message });
  }
}
