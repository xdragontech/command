import type { NextApiRequest, NextApiResponse } from "next";
import { createScheduleResource, listScheduleResources } from "@command/core-scheduling";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toSchedulingScope } from "../../../../../server/schedulingScope";

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
      const seriesId = Array.isArray(req.query.seriesId) ? req.query.seriesId[0] : req.query.seriesId;
      const type = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
      const resources = await listScheduleResources({
        scope: toSchedulingScope(auth.principal),
        q: String(q || ""),
        brandId: brandId || null,
        seriesId: seriesId || null,
        type: type || null,
      });
      return json(res, 200, { ok: true, resources });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const resource = await createScheduleResource({
        scope: toSchedulingScope(auth.principal),
        input: body,
      });
      return json(res, 200, { ok: true, resource });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to manage schedule resources";
    return json(res, 400, { ok: false, error: message });
  }
}
