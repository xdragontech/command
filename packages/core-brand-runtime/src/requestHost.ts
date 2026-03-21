export function normalizeHost(value: string | null | undefined): string {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

export function buildOrigin(protocol: string, host: string): string {
  const safeProtocol = protocol === "http" ? "http" : "https";
  return `${safeProtocol}://${normalizeHost(host)}`;
}
