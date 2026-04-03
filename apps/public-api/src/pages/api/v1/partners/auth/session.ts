import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import { requirePublicApiPartnerSession } from "../../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiPartnerSession(req, res, PartnerKind.PARTICIPANT);
  if (!context) return;

  return res.status(200).json({
    ok: true,
    account: context.session.account,
  });
}
