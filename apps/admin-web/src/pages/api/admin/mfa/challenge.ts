import type { NextApiRequest, NextApiResponse } from "next";
import {
  recordSuccessfulBackofficeLogin,
  verifyBackofficeMfaChallenge,
} from "@command/core-auth-backoffice";
import {
  hasVerifiedBackofficeMfaForRequest,
  requireBackofficeApi,
} from "../../../../server/backofficeAuth";
import {
  clearBackofficeMfaChallengeCookie,
  setBackofficeMfaChallengeCookie,
} from "../../../../server/backofficeMfaChallenge";
import { getBackofficeRequestIdentity } from "../../../../server/backofficeRequestIdentity";

function json(res: NextApiResponse, status: number, payload: any) {
  return res.status(status).json(payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireBackofficeApi(req, res, { allowPendingMfa: true });
  if (!auth.ok) {
    const error = auth.reason === "MFA_REQUIRED" ? "MFA challenge required" : "Unauthorized";
    return json(res, 401, { ok: false, error });
  }

  if (auth.principal.mfaState !== "ENABLED") {
    clearBackofficeMfaChallengeCookie(res);
    return json(res, 400, { ok: false, error: "Authenticator MFA is not enabled on this account" });
  }

  if (hasVerifiedBackofficeMfaForRequest(req, auth.session)) {
    return json(res, 200, { ok: true, result: { usedRecoveryCode: false, alreadyVerified: true } });
  }

  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const result = await verifyBackofficeMfaChallenge(auth.principal.id, String(body.code || ""));
      try {
        await recordSuccessfulBackofficeLogin({
          backofficeUserId: auth.principal.id,
          identity: getBackofficeRequestIdentity(req),
        });
      } catch (error) {
        console.error("Backoffice MFA login telemetry write failed", error);
      }
      setBackofficeMfaChallengeCookie(res, auth.session);
      return json(res, 200, { ok: true, result });
    }

    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Server error";
    return json(res, 400, { ok: false, error: message });
  }
}
