import type { NextApiRequest, NextApiResponse } from "next";
import {
  deleteEditableBrand,
  updateEditableBrand,
} from "@command/core-brand-runtime";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });
  if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return json(res, 400, { ok: false, error: "Missing id" });

  try {
    if (req.method === "PATCH" || req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const brand = await updateEditableBrand(id, body);
      return json(res, 200, { ok: true, brand });
    }

    if (req.method === "DELETE") {
      await deleteEditableBrand(id);
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "PATCH, PUT, POST, DELETE");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
