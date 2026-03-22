import type { NextApiRequest, NextApiResponse } from "next";
import { getPublicGuideBySlug } from "@command/core-content";
import { requirePublicApiSession, sendPublicApiError } from "../../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiSession(req, res);
  if (!context) return;

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  if (!slug) {
    return res.status(400).json({ ok: false, error: "Guide slug is required" });
  }

  try {
    const item = await getPublicGuideBySlug({
      brandId: context.brand.brandId,
      slug,
    });

    if (!item) {
      return res.status(404).json({ ok: false, error: "Guide not found" });
    }

    return res.status(200).json({ ok: true, item });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
