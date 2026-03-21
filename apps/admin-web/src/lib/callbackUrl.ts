export function normalizeCallbackUrl(
  raw: string | string[] | undefined,
  currentOrigin: string,
  allowedHosts: string[],
  fallback = "/admin/library"
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return fallback;

  try {
    if (value.startsWith("/")) return value;
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (allowedHosts.includes(host)) {
      return `${currentOrigin}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
