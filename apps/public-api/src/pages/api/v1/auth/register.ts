import type { NextApiRequest, NextApiResponse } from "next";
import { registerExternalUser } from "@command/core-auth-external";
import { requirePublicApiContext, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const result = await registerExternalUser({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
