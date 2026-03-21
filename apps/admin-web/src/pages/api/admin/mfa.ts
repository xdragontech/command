import type { NextApiRequest, NextApiResponse } from "next";
import {
  cancelBackofficeMfaEnrollment,
  getCurrentBackofficeMfaStatus,
  startBackofficeMfaEnrollment,
  verifyBackofficeMfaEnrollment,
} from "@command/core-auth-backoffice";
import { requireBackofficeApi } from "../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const status = await getCurrentBackofficeMfaStatus(auth.principal.id);
      return json(res, 200, { ok: true, status });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const action = String(body.action || "").toLowerCase();

      if (action === "start") {
        const status = await startBackofficeMfaEnrollment(auth.principal.id);
        return json(res, 200, { ok: true, status });
      }

      if (action === "verify") {
        const status = await verifyBackofficeMfaEnrollment(auth.principal.id, String(body.code || ""));
        return json(res, 200, { ok: true, status });
      }

      if (action === "cancel") {
        const status = await cancelBackofficeMfaEnrollment(auth.principal.id);
        return json(res, 200, { ok: true, status });
      }
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
