import { PartnerKind } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { createSponsorPartnerAccount, listPartnerAccounts } from "@command/core-partners";
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
        kind: PartnerKind.SPONSOR,
        brandId: brandId || null,
        q: String(q || ""),
      });
      return json(res, 200, { ok: true, accounts });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const account = await createSponsorPartnerAccount({
        scope: toPartnerScope(auth.principal),
        brandId: body.brandId,
        email: body.email,
        displayName: body.displayName,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        mainWebsiteUrl: body.mainWebsiteUrl,
        summary: body.summary,
        description: body.description,
        productServiceType: body.productServiceType,
        sponsorType: body.sponsorType,
        status: body.status,
        password: body.password,
      });
      return json(res, 201, { ok: true, account });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to load sponsor accounts" });
  }
}
