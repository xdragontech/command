import type { NextApiRequest, NextApiResponse } from "next";
import {
  emailPartnerTemporaryPassword,
  updateSponsorPartnerAccount,
} from "@command/core-partners";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toPartnerScope } from "../../../../../server/partnerScope";
import { PartnerKind } from "@prisma/client";

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
      const account = await updateSponsorPartnerAccount({
        scope: toPartnerScope(auth.principal),
        partnerProfileId: id,
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
      return json(res, 200, { ok: true, account });
    }

    if (req.method === "POST") {
      await emailPartnerTemporaryPassword({
        scope: toPartnerScope(auth.principal),
        partnerProfileId: id,
        expectedKind: PartnerKind.SPONSOR,
      });
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "PATCH, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to update sponsor account" });
  }
}
