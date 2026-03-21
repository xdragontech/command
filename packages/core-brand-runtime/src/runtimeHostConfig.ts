import { getRuntimeAllowedHosts, resolveRuntimeBrandForHost } from "./brandRegistry";
import { normalizeHost } from "./requestHost";

export type RuntimeHostConfig = {
  requestHost: string;
  brandKey: string | null;
  canonicalPublicHost: string | null;
  canonicalAdminHost: string | null;
  allowedHosts: string[];
  resolvedFromBrandRegistry: boolean;
};

export async function getRuntimeHostConfig(requestHost?: string | null): Promise<RuntimeHostConfig> {
  const normalizedHost = normalizeHost(requestHost);
  const runtime = normalizedHost ? await resolveRuntimeBrandForHost(normalizedHost) : null;
  const allowedHosts = Array.from(await getRuntimeAllowedHosts(normalizedHost ? [normalizedHost] : [])).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    requestHost: normalizedHost,
    brandKey: runtime?.brandKey || null,
    canonicalPublicHost: runtime?.canonicalPublicHost || normalizedHost || null,
    canonicalAdminHost: runtime?.canonicalAdminHost || normalizedHost || null,
    allowedHosts,
    resolvedFromBrandRegistry: Boolean(runtime),
  };
}
