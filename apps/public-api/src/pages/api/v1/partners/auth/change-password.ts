import type { NextApiRequest, NextApiResponse } from "next";
import { PartnerKind } from "@prisma/client";
import { changePartnerPassword } from "@command/core-auth-partner";
import {
  requirePublicApiContext,
  sendPublicApiError,
} from "../../../../../server/auth";

function getSessionHeader(req: NextApiRequest) {
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
    const result = await changePartnerPassword({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      sessionToken: getSessionHeader(req),
      kind: PartnerKind.PARTICIPANT,
      password: req.body?.password,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendPublicApiError(res, error);
  }
}
