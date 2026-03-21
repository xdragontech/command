import type { NextApiRequest, NextApiResponse } from "next";
import { consumeManagedBackofficePasswordReset } from "../../../../server/backofficeAdminUsers";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    await consumeManagedBackofficePasswordReset({
      userId: body.id,
      token: body.token,
      password: body.password,
    });
    return json(res, 200, { ok: true });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
