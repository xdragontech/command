import type { NextApiRequest, NextApiResponse } from "next";
import {
  getEditableBrandConsentNotice,
  saveBrandConsentNoticeDraft,
} from "@command/core-brand-runtime";
import { requireBackofficeApi } from "../../../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

function getBrandId(req: NextApiRequest) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  return typeof id === "string" ? id : "";
}

function canViewBrand(auth: Awaited<ReturnType<typeof requireBackofficeApi>>, brandId: string) {
  if (!auth.ok) return false;
  if (auth.principal.role === "SUPERADMIN") return true;
  return auth.principal.allowedBrandIds.includes(brandId);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });

  const brandId = getBrandId(req);
  if (!brandId) return json(res, 400, { ok: false, error: "Missing brand id" });
  if (!canViewBrand(auth, brandId)) return json(res, 403, { ok: false, error: "Forbidden" });

  try {
    if (req.method === "GET") {
      const notice = await getEditableBrandConsentNotice(brandId);
      return json(res, 200, { ok: true, notice });
    }

    if (req.method === "PATCH" || req.method === "PUT" || req.method === "POST") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const notice = await saveBrandConsentNoticeDraft(brandId, body);
      return json(res, 200, { ok: true, notice });
    }

    res.setHeader("Allow", "GET, PATCH, PUT, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
