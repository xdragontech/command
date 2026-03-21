import type { NextApiRequest, NextApiResponse } from "next";
import { authHandler, authOptions } from "../../../server/authOptions";

export { authOptions };

export default function auth(req: NextApiRequest, res: NextApiResponse) {
  return authHandler(req, res);
}
