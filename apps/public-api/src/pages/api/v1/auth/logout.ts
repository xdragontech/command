import type { NextApiRequest, NextApiResponse } from "next";
import { logoutExternalSession } from "@command/core-auth-external";
import { requirePublicApiContext, sendPublicApiError } from "../../../../server/auth";

function getSessionToken(req: NextApiRequest) {
  const header = req.headers["x-command-session"];
  if (Array.isArray(header)) return header[0] || "";
  return typeof header === "string" ? header.trim() : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const context = await requirePublicApiContext(req, res);
  if (!context) return;

  try {
    await logoutExternalSession({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      sessionToken: getSessionToken(req),
    });

    return res.status(204).end();
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
