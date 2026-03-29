import type { NextApiRequest, NextApiResponse } from "next";
import { getPublishedBrandConsentNotice } from "@command/core-brand-runtime";
import { requirePublicApiContext } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    const notice = await getPublishedBrandConsentNotice(context.brand.brandId);
    if (!notice) {
      return res.status(404).json({ ok: false, error: "No published consent notice is configured for this brand" });
    }

    return res.status(200).json({
      ok: true,
      notice,
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return res.status(500).json({ ok: false, error: message });
  }
}
