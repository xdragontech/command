import type { NextApiRequest, NextApiResponse } from "next";
import { loadLeadAnalytics } from "@command/core-leads";
import { loadWebsiteLeadAttributionReport } from "@command/core-website-analytics";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) {
    return json(res, 401, {
      ok: false,
      error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized",
    });
  }

  try {
    const brandId = typeof req.query.brandId === "string" ? req.query.brandId : null;
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;
    const scope = {
      role: auth.principal.role,
      allowedBrandIds: auth.principal.allowedBrandIds,
    } as const;

    const [analytics, attribution] = await Promise.all([
      loadLeadAnalytics({
        scope,
        brandId,
        from,
        to,
      }),
      loadWebsiteLeadAttributionReport({
        scope,
        brandId,
        from,
        to,
      }),
    ]);

    const attributionCoverage =
      analytics.totals.total > 0 ? attribution.totals.total / analytics.totals.total : 0;

    return json(res, 200, {
      ok: true,
      ...analytics,
      attribution,
      attributionCoverage,
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to load lead report";
    return json(res, 500, { ok: false, error: message });
  }
}
