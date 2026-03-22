import type { NextApiRequest, NextApiResponse } from "next";
import { requestExternalPasswordReset } from "@command/core-auth-external";
import { requirePublicApiContext, sendPublicApiError } from "../../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    await requestExternalPasswordReset({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      email: req.body?.email,
    });

    return res.status(202).json({ ok: true });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
