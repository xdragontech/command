import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import {
  getPartnerPortalProfile,
  updatePartnerPortalProfile,
} from "@command/core-partners";
import { requirePublicApiPartnerSession, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const context = await requirePublicApiPartnerSession(req, res, PartnerKind.PARTICIPANT);
    if (!context) return;

    try {
      const profile = await getPartnerPortalProfile({
        partnerUserId: context.session.account.id,
        expectedKind: PartnerKind.PARTICIPANT,
      });

      return res.status(200).json({
        ok: true,
        profile,
      });
    } catch (error) {
      return sendPublicApiError(res, error);
    }
  }

  if (req.method === "PATCH") {
    const context = await requirePublicApiPartnerSession(req, res, PartnerKind.PARTICIPANT);
    if (!context) return;

    try {
      const profile = await updatePartnerPortalProfile({
        partnerUserId: context.session.account.id,
        expectedKind: PartnerKind.PARTICIPANT,
        input: req.body || {},
      });

      return res.status(200).json({
        ok: true,
        profile,
      });
    } catch (error) {
      return sendPublicApiError(res, error);
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
