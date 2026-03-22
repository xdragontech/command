import type { NextApiRequest, NextApiResponse } from "next";
import { listPublicPrompts } from "@command/core-content";
import { requirePublicApiSession, sendPublicApiError } from "../../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiSession(req, res);
  if (!context) return;

  try {
    const items = await listPublicPrompts({
      brandId: context.brand.brandId,
      q: req.query.q,
      category: req.query.category,
      limit: req.query.limit,
    });

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
