import type { NextApiRequest, NextApiResponse } from "next";
import { loadDashboardMetrics, parseMetricsPeriod } from "@command/core-leads";
import { loadWebsiteDashboardSummary } from "@command/core-website-analytics";
import { requireBackofficeApi } from "../../../server/backofficeAuth";

type MetricsResponse =
  | ({
      ok: true;
    } & Awaited<ReturnType<typeof loadDashboardMetrics>> & {
        websiteSummary: Awaited<ReturnType<typeof loadWebsiteDashboardSummary>>;
      })
  | { ok: false; error: string };

function json(res: NextApiResponse<MetricsResponse>, status: number, payload: MetricsResponse) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<MetricsResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) {
    return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });
  }

  try {
    const period = parseMetricsPeriod(req.query.period);
    const scope = {
      role: auth.principal.role,
      allowedBrandIds: auth.principal.allowedBrandIds,
    } as const;
    const metrics = await loadDashboardMetrics({
      period,
      scope,
    });
    const websiteSummary = await loadWebsiteDashboardSummary({
      scope,
      from: new Date(metrics.from),
      to: new Date(metrics.to),
    });

    return json(res, 200, { ok: true, ...metrics, websiteSummary });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 500, { ok: false, error: message });
  }
}
