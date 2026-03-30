import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntimeHostConfig } from "@command/core-brand-runtime";
import { requirePublicIntegration } from "../../../../server/auth";

function getHostQuery(req: NextApiRequest): string {
  const raw = Array.isArray(req.query.host) ? req.query.host[0] : req.query.host;
  return typeof raw === "string" ? raw.trim() : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const integration = await requirePublicIntegration(req, res);
  if (!integration) return;

  const host = getHostQuery(req);
  if (!host) {
    return res.status(400).json({ ok: false, error: "host query parameter is required" });
  }

  try {
    const config = await getRuntimeHostConfig(host);
    return res.status(200).json({
      ok: true,
      config,
      scope: {
        integration: integration.name,
        access: "install",
      },
    });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return res.status(500).json({ ok: false, error: message });
  }
}
