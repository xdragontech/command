import { PartnerKind } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { listPartnerAccounts } from "@command/core-partners";
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
      const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
      const brandId = Array.isArray(req.query.brandId) ? req.query.brandId[0] : req.query.brandId;
      const accounts = await listPartnerAccounts({
        scope: toPartnerScope(auth.principal),
        kind: PartnerKind.PARTICIPANT,
        brandId: brandId || null,
        q: String(q || ""),
      });
      return json(res, 200, { ok: true, accounts });
    }

    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to load partner accounts" });
  }
}
