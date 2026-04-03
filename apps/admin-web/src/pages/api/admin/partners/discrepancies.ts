import type { NextApiRequest, NextApiResponse } from "next";
import { listPartnerDiscrepancies } from "@command/core-partners";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import { toPartnerScope } from "../../../../server/partnerScope";

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
      const participantType = Array.isArray(req.query.participantType) ? req.query.participantType[0] : req.query.participantType;
      const requirementType = Array.isArray(req.query.requirementType) ? req.query.requirementType[0] : req.query.requirementType;
      const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
      const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
      const discrepancies = await listPartnerDiscrepancies({
        scope: toPartnerScope(auth.principal),
        brandId: brandId || null,
        eventSeriesId: eventSeriesId || null,
        participantType: participantType || null,
        requirementType: requirementType || null,
        state: state || null,
        q: String(q || ""),
      });
      return json(res, 200, { ok: true, discrepancies });
    }

    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to load partner discrepancies" });
  }
}
