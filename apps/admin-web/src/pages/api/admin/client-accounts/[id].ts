import { ExternalUserStatus } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import {
  deleteManagedExternalUser,
  getManagedExternalUser,
  markManagedExternalUserVerified,
  setManagedExternalUserStatus,
  updateManagedExternalUser,
} from "../../../../server/externalAdminUsers";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) return json(res, 400, { ok: false, error: "Missing id" });

  try {
    if (req.method === "GET") {
      const user = await getManagedExternalUser(id);
      if (!user) return json(res, 404, { ok: false, error: "Client account not found" });
      if (auth.principal.role !== "SUPERADMIN" && !auth.principal.allowedBrandIds.includes(user.brandId)) {
        return json(res, 403, { ok: false, error: "Forbidden" });
      }
      return json(res, 200, { ok: true, user });
    }

    if (req.method === "DELETE") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      await deleteManagedExternalUser(id);
      return json(res, 200, { ok: true });
    }

    if (req.method === "PATCH" || req.method === "POST") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const action = String(body.action || "").toLowerCase();

      if (action === "block" || action === "unblock") {
        const user = await setManagedExternalUserStatus(
          id,
          action === "block" ? ExternalUserStatus.BLOCKED : ExternalUserStatus.ACTIVE
        );
        return json(res, 200, { ok: true, user });
      }

      if (action === "verify") {
        const user = await markManagedExternalUserVerified(id);
        return json(res, 200, { ok: true, user });
      }

      const user = await updateManagedExternalUser(id, body);
      return json(res, 200, { ok: true, user });
    }

    res.setHeader("Allow", "GET, PATCH, POST, DELETE");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
