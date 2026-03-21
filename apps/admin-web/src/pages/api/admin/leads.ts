import type { NextApiRequest, NextApiResponse } from "next";
import { listLeadRows, parseLeadKind, parseLeadLimit } from "@command/core-leads";
import { requireBackofficeApi } from "../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    const kind = parseLeadKind(req.query.kind);
    const limit = parseLeadLimit(req.query.limit, 200);
    const brandId = Array.isArray(req.query.brandId) ? req.query.brandId[0] : req.query.brandId;
    const items = await listLeadRows({
      kind,
      limit,
      brandId,
      scope: {
        role: auth.principal.role,
        allowedBrandIds: auth.principal.allowedBrandIds,
      },
    });

    return json(res, 200, { ok: true, kind, limit, brandId: brandId || null, items });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to load leads";
    const status = message === "Forbidden brand scope" ? 403 : 400;
    return json(res, status, { ok: false, error: message });
  }
}
