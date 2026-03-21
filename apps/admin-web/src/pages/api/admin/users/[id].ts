import { BackofficeUserStatus } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntimeHostConfig } from "@command/core-brand-runtime";
import { buildOrigin } from "@command/core-brand-runtime";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import { getApiRequestHost, getApiRequestProtocol } from "../../../../server/requestHost";
import {
  createManagedBackofficePasswordLink,
  deleteManagedBackofficeUser,
  getManagedBackofficeUser,
  resetManagedBackofficeUserMfa,
  setManagedBackofficeUserStatus,
  updateManagedBackofficeUser,
} from "../../../../server/backofficeAdminUsers";

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
      const user = await getManagedBackofficeUser(id);
      if (!user) return json(res, 404, { ok: false, error: "Staff account not found" });
      return json(res, 200, { ok: true, user });
    }

    if (req.method === "DELETE") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      await deleteManagedBackofficeUser(auth.principal.id, id);
      return json(res, 200, { ok: true });
    }

    if (req.method === "PATCH" || req.method === "POST") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const action = String(body.action || "").toLowerCase();

      if (action === "block" || action === "unblock") {
        const user = await setManagedBackofficeUserStatus(
          auth.principal.id,
          id,
          action === "block" ? BackofficeUserStatus.BLOCKED : BackofficeUserStatus.ACTIVE
        );
        return json(res, 200, { ok: true, user });
      }

      if (action === "generateresetlink") {
        const runtimeHost = await getRuntimeHostConfig(getApiRequestHost(req));
        const origin = buildOrigin(
          getApiRequestProtocol(req),
          runtimeHost.canonicalAdminHost || getApiRequestHost(req)
        );
        const invite = await createManagedBackofficePasswordLink(id, "reset", origin);
        return json(res, 200, { ok: true, invite });
      }

      if (action === "resetmfa") {
        const user = await resetManagedBackofficeUserMfa(id);
        return json(res, 200, { ok: true, user });
      }

      const user = await updateManagedBackofficeUser(auth.principal.id, id, body);
      return json(res, 200, { ok: true, user });
    }

    res.setHeader("Allow", "GET, PATCH, POST, DELETE");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
