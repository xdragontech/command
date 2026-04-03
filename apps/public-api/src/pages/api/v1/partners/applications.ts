import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import {
  listPartnerPortalApplications,
  submitPartnerPortalApplication,
} from "@command/core-partners";
import { requirePublicApiPartnerSession, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const context = await requirePublicApiPartnerSession(req, res, PartnerKind.PARTICIPANT);
    if (!context) return;

    try {
      const payload = await listPartnerPortalApplications({
        partnerUserId: context.session.account.id,
        expectedKind: PartnerKind.PARTICIPANT,
      });

      return res.status(200).json({
        ok: true,
        ...payload,
      });
    } catch (error) {
      return sendPublicApiError(res, error);
    }
  }

  if (req.method === "POST") {
    const context = await requirePublicApiPartnerSession(req, res, PartnerKind.PARTICIPANT);
    if (!context) return;

    try {
      const application = await submitPartnerPortalApplication({
        partnerUserId: context.session.account.id,
        expectedKind: PartnerKind.PARTICIPANT,
        scheduleEventSeriesId: req.body?.scheduleEventSeriesId,
      });

      return res.status(201).json({
        ok: true,
        application,
      });
    } catch (error) {
      return sendPublicApiError(res, error);
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
