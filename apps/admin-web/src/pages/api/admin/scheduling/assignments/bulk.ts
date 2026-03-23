import type { NextApiRequest, NextApiResponse } from "next";
import {
  SchedulingConflictError,
  bulkUpdateScheduleAssignmentStatus,
  type ScheduleAssignmentBulkStatusAction,
} from "@command/core-scheduling";
import { requireBackofficeApi } from "../../../../../server/backofficeAuth";
import { toSchedulingScope } from "../../../../../server/schedulingScope";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

function parseAction(value: unknown): ScheduleAssignmentBulkStatusAction {
  if (value === "publish" || value === "unpublish") return value;
  throw new Error("Bulk assignment action must be publish or unpublish");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const occurrenceId = typeof body.occurrenceId === "string" ? body.occurrenceId : "";
    if (!occurrenceId) throw new Error("Occurrence is required");

    const result = await bulkUpdateScheduleAssignmentStatus({
      scope: toSchedulingScope(auth.principal),
      occurrenceId,
      action: parseAction(body.action),
    });

    return json(res, 200, { ok: true, result });
  } catch (error: any) {
    if (error instanceof SchedulingConflictError) {
      return json(res, 409, { ok: false, error: error.message, conflicts: error.conflicts });
    }

    const message = typeof error?.message === "string" ? error.message : "Failed to update schedule assignment visibility";
    return json(res, 400, { ok: false, error: message });
  }
}
