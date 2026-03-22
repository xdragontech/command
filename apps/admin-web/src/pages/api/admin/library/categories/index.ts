import type { NextApiRequest, NextApiResponse } from "next";
import { createContentCategory, listContentCategories } from "@command/core-content";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

function pickQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    if (req.method === "GET") {
      const categories = await listContentCategories({
        scope: {
          role: auth.principal.role,
          allowedBrandIds: auth.principal.allowedBrandIds,
        },
        q: pickQueryValue(req.query.q),
        brandId: pickQueryValue(req.query.brandId),
      });
      return json(res, 200, { ok: true, categories });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const category = await createContentCategory(
        {
          role: auth.principal.role,
          allowedBrandIds: auth.principal.allowedBrandIds,
        },
        body
      );
      return json(res, 200, { ok: true, category });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    const status = message === "Forbidden brand scope" ? 403 : 400;
    return json(res, status, { ok: false, error: message });
  }
}
