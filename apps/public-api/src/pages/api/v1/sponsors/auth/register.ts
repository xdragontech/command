import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import { registerPartnerUser } from "@command/core-auth-partner";
import { requirePublicApiContext, sendPublicApiError } from "../../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const result = await registerPartnerUser({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      kind: PartnerKind.SPONSOR,
      email: req.body?.email,
      password: req.body?.password,
      displayName: req.body?.displayName,
      contactName: req.body?.contactName,
      contactPhone: req.body?.contactPhone,
      productServiceType: req.body?.productServiceType,
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
