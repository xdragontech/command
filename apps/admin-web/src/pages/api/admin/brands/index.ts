import type { NextApiRequest, NextApiResponse } from "next";
import { listEditableBrands } from "@command/core-brand-runtime";
import { requireBackofficeApi } from "../../../../server/backofficeAuth";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res);
  if (!auth.ok) return json(res, 401, { ok: false, error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const brands = (await listEditableBrands()).map((brand) => ({
        id: brand.id,
        brandKey: brand.brandKey,
        name: brand.name,
        status: brand.status,
      }));
      return json(res, 200, { ok: true, brands });
    }

    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
