import { PartnerUserStatus } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { updatePartnerAccountStatus } from "@command/core-partners";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toPartnerScope } from "../../../../../server/partnerScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return json(res, 400, { ok: false, error: "Sponsor account id is required" });

  try {
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const status = body.status === PartnerUserStatus.BLOCKED ? PartnerUserStatus.BLOCKED : PartnerUserStatus.ACTIVE;
      const account = await updatePartnerAccountStatus({
        scope: toPartnerScope(auth.principal),
        partnerProfileId: id,
        status,
      });
      return json(res, 200, { ok: true, account });
    }

    res.setHeader("Allow", "PATCH");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to update sponsor account" });
  }
}
