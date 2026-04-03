import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import { verifyPartnerEmail } from "@command/core-auth-partner";
import { requirePublicApiContext, sendPublicApiError } from "../../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const result = await verifyPartnerEmail({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      token: req.body?.token,
      kind: PartnerKind.SPONSOR,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
