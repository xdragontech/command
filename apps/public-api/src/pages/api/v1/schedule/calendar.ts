import type { NextApiRequest, NextApiResponse } from "next";
import {
  PublicScheduleQueryError,
  listPublicScheduleCalendar,
} from "@command/core-scheduling";
import { requirePublicApiContext, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const result = await listPublicScheduleCalendar({
      brandId: context.brand.brandId,
      from: req.query.from,
      to: req.query.to,
      occurrenceDate: req.query.occurrenceDate,
      eventSeries: req.query.eventSeries,
      participantType: req.query.participantType,
      resource: req.query.resource,
      location: req.query.location,
      resourceType: req.query.resourceType,
      q: Array.isArray(req.query.q) ? req.query.q[0] : req.query.q,
      sequence: req.query.sequence,
      limit: req.query.limit,
    });

    return res.status(200).json({ ok: true, range: result.range, items: result.items });
  } catch (error) {
    if (error instanceof PublicScheduleQueryError) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    return sendPublicApiError(res, error);
  }
}
