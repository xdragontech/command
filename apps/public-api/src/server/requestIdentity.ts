import type { NextApiRequest } from "next";
import type { ExternalRequestIdentity } from "@command/core-auth-external";
import {
  getClientIp,
  getCountryIso2,
  getUserAgent,
  toCountryName,
  type TrustedClientIdentityOptions,
} from "./clientIdentity";

export function getExternalRequestIdentity(
  req: NextApiRequest,
  options?: TrustedClientIdentityOptions
): ExternalRequestIdentity {
  const countryIso2 = getCountryIso2(req, options);
  const userAgent = getUserAgent(req, options);

  return {
    ip: getClientIp(req, options),
    userAgent,
    countryIso2,
    countryName: toCountryName(countryIso2),
  };
}
