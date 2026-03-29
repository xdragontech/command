import type { NextApiRequest, NextApiResponse } from "next";
import { publishBrandConsentNoticeDraft } from "@command/core-brand-runtime";
import { requireBackofficeApi } from "../../../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

function getBrandId(req: NextApiRequest) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  return typeof id === "string" ? id : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });
  if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });

  const brandId = getBrandId(req);
  if (!brandId) return json(res, 400, { ok: false, error: "Missing brand id" });

  try {
    if (req.method === "POST") {
      const notice = await publishBrandConsentNoticeDraft(brandId);
      return json(res, 200, { ok: true, notice });
    }

    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
