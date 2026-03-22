import type { NextApiRequest, NextApiResponse } from "next";
import { getPublicApiReadiness } from "../../server/runtimeReadiness";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const readiness = await getPublicApiReadiness();
  return res.status(readiness.ok ? 200 : 503).json(readiness);
}
