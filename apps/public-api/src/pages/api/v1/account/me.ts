import type { NextApiRequest, NextApiResponse } from "next";
import { updateCurrentExternalAccount } from "@command/core-auth-external";
import { requirePublicApiSession, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const context = await requirePublicApiSession(req, res);
    if (!context) return;

    return res.status(200).json({
      ok: true,
      account: context.session.account,
    });
  }

  if (req.method === "PATCH") {
    const context = await requirePublicApiSession(req, res);
    if (!context) return;

    try {
      const account = await updateCurrentExternalAccount({
        brandKey: context.brand.brandKey,
        publicOrigin: context.brand.publicOrigin,
        sessionToken: context.session.session.token,
        name: req.body?.name,
      });

      return res.status(200).json({
        ok: true,
        account,
      });
    } catch (error) {
      return sendPublicApiError(res, error);
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
