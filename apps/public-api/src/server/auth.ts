import type { NextApiRequest, NextApiResponse } from "next";
import {
  ExternalAuthServiceError,
  getExternalSessionState,
  resolveExternalBrandContext,
  type ExternalBrandContext,
  type ExternalSessionState,
} from "@command/core-auth-external";
import {
  resolveIntegrationFromRequest,
  type PublicIntegrationConfig,
} from "./integrationConfig";

export type PublicApiContext = {
  integration: PublicIntegrationConfig;
  brand: ExternalBrandContext;
};

export type PublicApiSessionContext = PublicApiContext & {
  session: ExternalSessionState;
};

export function sendPublicApiError(res: NextApiResponse, error: unknown) {
  if (error instanceof ExternalAuthServiceError) {
    return res.status(error.status).json({ ok: false, error: error.message });
  }

  if (error instanceof Error) {
    return res.status(500).json({ ok: false, error: error.message || "Server error" });
  }

  return res.status(500).json({ ok: false, error: "Server error" });
}

export async function requirePublicIntegration(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PublicIntegrationConfig | null> {
  try {
    return resolveIntegrationFromRequest(req);
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Unauthorized";
    const status =
      message === "Missing integration key" || message === "Invalid integration key" ? 401 : 503;
    res.status(status).json({ ok: false, error: message });
    return null;
  }
}

export async function requirePublicApiContext(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PublicApiContext | null> {
  const integration = await requirePublicIntegration(req, res);
  if (!integration) return null;

  try {
    const brand = await resolveExternalBrandContext({
      brandKey: integration.brandKey,
      publicOrigin: integration.publicOrigin,
    });

    return { integration, brand };
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Unauthorized";
    res.status(503).json({ ok: false, error: message });
    return null;
  }
}

function getSessionHeader(req: NextApiRequest) {
  const header = req.headers["x-command-session"];
  if (Array.isArray(header)) return header[0] || "";
  return typeof header === "string" ? header.trim() : "";
}

export async function requirePublicApiSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PublicApiSessionContext | null> {
  const context = await requirePublicApiContext(req, res);
  if (!context) return null;

  const sessionToken = getSessionHeader(req);
  if (!sessionToken) {
    res.status(401).json({ ok: false, error: "Missing session token" });
    return null;
  }

  try {
    const session = await getExternalSessionState({
      brandKey: context.brand.brandKey,
      publicOrigin: context.brand.publicOrigin,
      sessionToken,
    });

    return {
      ...context,
      session,
    };
  } catch (error) {
    sendPublicApiError(res, error);
    return null;
  }
}
