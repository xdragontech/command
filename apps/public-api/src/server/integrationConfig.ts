import type { NextApiRequest } from "next";

export type PublicIntegrationConfig = {
  name: string;
  key: string;
  brandKey: string;
  publicOrigin: string;
};

type PublicIntegrationDescriptor = {
  name?: unknown;
  key?: unknown;
  brandKey?: unknown;
  publicOrigin?: unknown;
};

function normalizeKey(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBrandKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOrigin(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  const parsed = new URL(raw);
  return parsed.origin;
}

function parseIntegrationDescriptor(input: PublicIntegrationDescriptor, index: number): PublicIntegrationConfig {
  const key = normalizeKey(input.key);
  const brandKey = normalizeBrandKey(input.brandKey);
  const publicOrigin = normalizeOrigin(input.publicOrigin);
  const name = normalizeKey(input.name) || `integration-${index + 1}`;

  if (!key || !brandKey || !publicOrigin) {
    throw new Error("Each public integration must include key, brandKey, and publicOrigin");
  }

  return {
    name,
    key,
    brandKey,
    publicOrigin,
  };
}

export function getConfiguredPublicIntegrations(): PublicIntegrationConfig[] {
  const raw = String(process.env.COMMAND_PUBLIC_INTEGRATIONS_JSON || "").trim();
  if (!raw) {
    throw new Error("COMMAND_PUBLIC_INTEGRATIONS_JSON is required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("COMMAND_PUBLIC_INTEGRATIONS_JSON must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("COMMAND_PUBLIC_INTEGRATIONS_JSON must be a JSON array");
  }

  const integrations = parsed.map((entry, index) =>
    parseIntegrationDescriptor((entry || {}) as PublicIntegrationDescriptor, index)
  );

  const dedupedKeys = new Set<string>();
  for (const integration of integrations) {
    if (dedupedKeys.has(integration.key)) {
      throw new Error("Public integration keys must be unique");
    }
    dedupedKeys.add(integration.key);
  }

  return integrations;
}

export function getIntegrationHeader(req: NextApiRequest) {
  const header = req.headers["x-command-integration-key"];
  if (Array.isArray(header)) return header[0] || "";
  return typeof header === "string" ? header.trim() : "";
}

export function resolveIntegrationFromRequest(req: NextApiRequest): PublicIntegrationConfig {
  const key = getIntegrationHeader(req);
  if (!key) {
    throw new Error("Missing integration key");
  }

  const integration = getConfiguredPublicIntegrations().find((entry) => entry.key === key);
  if (!integration) {
    throw new Error("Invalid integration key");
  }

  return integration;
}
