import type { NextApiRequest, NextApiResponse } from "next";
import { reviewPartnerApplication } from "@command/core-partners";
import { requireBackofficeApi } from "../../../../../../server/backofficeAuth";
import { toPartnerScope } from "../../../../../../server/partnerScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return json(res, 400, { ok: false, error: "Partner application id is required" });

  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const application = await reviewPartnerApplication({
        scope: toPartnerScope(auth.principal),
        partnerApplicationId: id,
        reviewerUserId: auth.principal.id,
        decision: String(body.decision || "NOTE") as "MARK_IN_REVIEW" | "APPROVE" | "REJECT" | "NOTE",
        notes: body.notes,
      });
      return json(res, 200, { ok: true, application });
    }

    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to review partner application" });
  }
}
