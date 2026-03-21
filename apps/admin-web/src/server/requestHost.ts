import type { IncomingHttpHeaders } from "http";
import { buildOrigin, normalizeHost } from "@command/core-brand-runtime";

function firstValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

type HeadersCarrier = {
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
};

export function getApiRequestHost(req: HeadersCarrier): string {
  return normalizeHost(firstValue(req.headers["x-forwarded-host"]) || firstValue(req.headers.host));
}

export function getApiRequestProtocol(req: HeadersCarrier): string {
  const proto = firstValue(req.headers["x-forwarded-proto"]).trim().toLowerCase();
  if (proto === "http" || proto === "https") return proto;
  return process.env.NODE_ENV === "development" ? "http" : "https";
}

export function getApiRequestOrigin(req: HeadersCarrier): string {
  return buildOrigin(getApiRequestProtocol(req), getApiRequestHost(req));
}
