import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import { loginPartnerUser } from "@command/core-auth-partner";
import { requirePublicApiContext, sendPublicApiError } from "../../../../../server/auth";
import { getExternalRequestIdentity } from "../../../../../server/requestIdentity";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const result = await loginPartnerUser({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      kind: PartnerKind.SPONSOR,
      email: req.body?.email,
      password: req.body?.password,
      identity: getExternalRequestIdentity(req, { trustForwardedClientHeaders: true }),
    });

    return res.status(200).json({
      ok: true,
      session: result.session,
      account: result.account,
    });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
