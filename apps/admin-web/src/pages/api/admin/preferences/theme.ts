import type { NextApiRequest, NextApiResponse } from "next";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";
import {
  getBackofficeThemePreference,
  setBackofficeThemePreference,
  type BackofficeThemePreference,
} from "../../../../server/backofficeThemePreference";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

function parseTheme(value: unknown): BackofficeThemePreference {
  if (value === "dark") return "dark";
  return "light";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) {
    return json(res, 401, { ok: false, error: auth.reason === "MFA_REQUIRED" ? "MFA required" : "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const theme = await getBackofficeThemePreference(auth.principal.id);
      return json(res, 200, { ok: true, theme });
    }

    if (req.method === "PATCH") {
      const theme = parseTheme(req.body?.theme);
      const savedTheme = await setBackofficeThemePreference(auth.principal.id, theme);
      return json(res, 200, { ok: true, theme: savedTheme });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return json(res, 400, { ok: false, error: error?.message || "Failed to update theme preference" });
  }
}
