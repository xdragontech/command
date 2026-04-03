import type { NextApiRequest, NextApiResponse } from "next";
import { listPartnerApplications } from "@command/core-partners";
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
      const kind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
      const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
      const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
      const pendingOnly = String(Array.isArray(req.query.pendingOnly) ? req.query.pendingOnly[0] : req.query.pendingOnly || "") === "true";
      const applications = await listPartnerApplications({
        scope: toPartnerScope(auth.principal),
        brandId: brandId || null,
        eventSeriesId: eventSeriesId || null,
        kind: kind || null,
        status: status || null,
        pendingOnly,
        q: String(q || ""),
      });
      return json(res, 200, { ok: true, applications });
    }

    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to load partner applications" });
  }
}
