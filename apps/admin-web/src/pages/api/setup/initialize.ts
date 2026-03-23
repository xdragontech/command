import type { NextApiRequest, NextApiResponse } from "next";
import { buildPostSetupRedirect, isInstallInitialized } from "../../../server/installState";
import { initializeInstall } from "../../../server/setupInitialization";
import {
  clearSetupAccessCookie,
  hasSetupAccess,
} from "../../../server/setupAccess";

function applyNoStore(res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.setHeader("Vary", "Cookie");
}

function json(res: NextApiResponse, status: number, payload: any) {
  applyNoStore(res);
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyNoStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (await isInstallInitialized()) {
    clearSetupAccessCookie(res);
    return json(res, 409, {
      ok: false,
      error: "Setup is already complete",
      redirectTo: (buildPostSetupRedirect() as any).redirect?.destination || "/admin/signin",
    });
  }

  if (!hasSetupAccess(req)) {
    clearSetupAccessCookie(res);
    return json(res, 403, { ok: false, error: "Setup is locked" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await initializeInstall(body);
    clearSetupAccessCookie(res);
    return json(res, 200, { ok: true, result });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Setup initialization failed";
    return json(res, 400, { ok: false, error: message });
  }
}
