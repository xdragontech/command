import type { NextApiRequest, NextApiResponse } from "next";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import {
  createManagedExternalUser,
  listManagedExternalUsers,
} from "../../../../server/externalAdminUsers";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const users =
        auth.principal.role === "SUPERADMIN"
          ? await listManagedExternalUsers()
          : await listManagedExternalUsers(auth.principal.allowedBrandIds);
      return json(res, 200, { ok: true, users });
    }

    if (req.method === "POST") {
      if (auth.principal.role !== "SUPERADMIN") return json(res, 403, { ok: false, error: "Forbidden" });
      const user = await createManagedExternalUser(req.body || {});
      return json(res, 200, { ok: true, user });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
