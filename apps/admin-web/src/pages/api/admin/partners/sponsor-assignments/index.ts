import type { NextApiRequest, NextApiResponse } from "next";
import { createSponsorEventAssignment, listSponsorEventAssignments } from "@command/core-partners";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toPartnerScope } from "../../../../../server/partnerScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    if (req.method === "GET") {
      const brandId = Array.isArray(req.query.brandId) ? req.query.brandId[0] : req.query.brandId;
      const eventSeriesId = Array.isArray(req.query.eventSeriesId) ? req.query.eventSeriesId[0] : req.query.eventSeriesId;
      const assignments = await listSponsorEventAssignments({
        scope: toPartnerScope(auth.principal),
        brandId: brandId || null,
        eventSeriesId: eventSeriesId || null,
      });
      return json(res, 200, { ok: true, assignments });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const assignment = await createSponsorEventAssignment({
        scope: toPartnerScope(auth.principal),
        input: body,
      });
      return json(res, 200, { ok: true, assignment });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to manage sponsor assignments" });
  }
}
