import type { NextApiRequest, NextApiResponse } from "next";
import {
  SchedulingConflictError,
  createScheduleAssignment,
  listScheduleAssignments,
} from "@command/core-scheduling";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toSchedulingScope } from "../../../../../server/schedulingScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    if (req.method === "GET") {
      const brandId = Array.isArray(req.query.brandId) ? req.query.brandId[0] : req.query.brandId;
      const occurrenceId = Array.isArray(req.query.occurrenceId) ? req.query.occurrenceId[0] : req.query.occurrenceId;
      const participantId = Array.isArray(req.query.participantId) ? req.query.participantId[0] : req.query.participantId;
      const resourceId = Array.isArray(req.query.resourceId) ? req.query.resourceId[0] : req.query.resourceId;
      const assignments = await listScheduleAssignments({
        scope: toSchedulingScope(auth.principal),
        brandId: brandId || null,
        occurrenceId: occurrenceId || null,
        participantId: participantId || null,
        resourceId: resourceId || null,
      });
      return json(res, 200, { ok: true, assignments });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const assignment = await createScheduleAssignment({
        scope: toSchedulingScope(auth.principal),
        input: body,
      });
      return json(res, 200, { ok: true, assignment });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    if (error instanceof SchedulingConflictError) {
      return json(res, 409, { ok: false, error: error.message, conflicts: error.conflicts });
    }

    const message = typeof error?.message === "string" ? error.message : "Failed to manage schedule assignments";
    return json(res, 400, { ok: false, error: message });
  }
}
