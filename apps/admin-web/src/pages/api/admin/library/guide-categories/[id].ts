import type { NextApiRequest, NextApiResponse } from "next";
import { deleteContentGuideCategory, updateContentGuideCategory } from "@command/core-content";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return json(res, 400, { ok: false, error: "Missing id" });

  try {
    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const category = await updateContentGuideCategory(
        {
          role: auth.principal.role,
          allowedBrandIds: auth.principal.allowedBrandIds,
        },
        id,
        body
      );
      return json(res, 200, { ok: true, category });
    }

    if (req.method === "DELETE") {
      await deleteContentGuideCategory(
        {
          role: auth.principal.role,
          allowedBrandIds: auth.principal.allowedBrandIds,
        },
        id
      );
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "PUT, DELETE");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    const status =
      message === "Forbidden brand scope" ? 403 : message === "Guide category not found" ? 404 : 400;
    return json(res, status, { ok: false, error: message });
  }
}
