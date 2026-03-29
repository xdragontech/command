import type {
  WebsiteAnalyticsNormalizedAttribution,
  WebsiteAnalyticsSourceCategory,
  WebsiteAnalyticsSourceMedium,
} from "./types";

type AnalyticsAttributionInput = {
  url?: string | null;
  referer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
};

type PlatformMatch = {
  platform: string;
  category: WebsiteAnalyticsSourceCategory;
};

const SEARCH_HOSTS: Array<[RegExp, string]> = [
  [/google\./, "google"],
  [/bing\.com$/, "bing"],
  [/duckduckgo\.com$/, "duckduckgo"],
  [/search\.yahoo\.com$/, "yahoo"],
  [/yahoo\.com$/, "yahoo"],
  [/ecosia\.org$/, "ecosia"],
  [/search\.brave\.com$/, "brave"],
];

const SOCIAL_HOSTS: Array<[RegExp, string]> = [
  [/facebook\.com$/, "facebook"],
  [/instagram\.com$/, "instagram"],
  [/linkedin\.com$/, "linkedin"],
  [/x\.com$/, "x"],
  [/twitter\.com$/, "x"],
  [/t\.co$/, "x"],
  [/reddit\.com$/, "reddit"],
  [/pinterest\./, "pinterest"],
  [/youtube\.com$/, "youtube"],
  [/tiktok\.com$/, "tiktok"],
];

const AI_HOSTS: Array<[RegExp, string]> = [
  [/chatgpt\.com$/, "chatgpt"],
  [/chat\.openai\.com$/, "chatgpt"],
  [/perplexity\.ai$/, "perplexity"],
  [/claude\.ai$/, "claude"],
  [/gemini\.google\.com$/, "gemini"],
  [/copilot\.microsoft\.com$/, "copilot"],
  [/poe\.com$/, "poe"],
  [/you\.com$/, "you"],
];

function normalizeHost(host: string | null) {
  if (!host) return null;
  return host.trim().toLowerCase().replace(/^www\./, "") || null;
}

function trimString(value: string | null | undefined, max = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseUrl(value: string | null | undefined) {
  const raw = trimString(value, 2000);
  if (!raw) return null;

  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw);
    if (raw.startsWith("/")) return new URL(raw, "https://analytics.invalid");
    return null;
  } catch {
    return null;
  }
}

function getQueryValue(url: URL | null, key: string) {
  if (!url) return null;
  return trimString(url.searchParams.get(key), 200);
}

function detectPlatformByHost(host: string | null): PlatformMatch | null {
  if (!host) return null;

  for (const [pattern, platform] of AI_HOSTS) {
    if (pattern.test(host)) return { platform, category: "AI_REFERRAL" };
  }

  for (const [pattern, platform] of SEARCH_HOSTS) {
    if (pattern.test(host)) return { platform, category: "SEARCH" };
  }

  for (const [pattern, platform] of SOCIAL_HOSTS) {
    if (pattern.test(host)) return { platform, category: "SOCIAL" };
  }

  return { platform: host, category: "REFERRAL" };
}

function normalizePlatform(value: string | null) {
  const normalized = trimString(value, 120)?.toLowerCase() || null;
  return normalized?.replace(/\s+/g, "_") || null;
}

function isPaidMedium(value: string | null) {
  if (!value) return false;
  return /(cpc|ppc|paid|display|banner|affiliate)/i.test(value);
}

function resolveCategory(args: {
  utmSource: string | null;
  utmMedium: string | null;
  clickPlatform: string | null;
  referrerMatch: PlatformMatch | null;
  referer: string | null;
}): WebsiteAnalyticsSourceCategory {
  if (isPaidMedium(args.utmMedium) || args.clickPlatform) return "PAID";
  if (args.utmMedium && /email/i.test(args.utmMedium)) return "EMAIL";
  if (args.utmMedium && /social/i.test(args.utmMedium)) return "SOCIAL";
  if (args.utmMedium && /(ai|llm)/i.test(args.utmMedium)) return "AI_REFERRAL";
  if (args.utmSource) return "UNKNOWN";
  if (args.referrerMatch) return args.referrerMatch.category;
  if (!args.referer) return "DIRECT";
  return "UNKNOWN";
}

function resolveMedium(args: {
  sourceCategory: WebsiteAnalyticsSourceCategory;
  utmMedium: string | null;
  hasReferer: boolean;
}): WebsiteAnalyticsSourceMedium {
  if (args.utmMedium) {
    if (isPaidMedium(args.utmMedium)) return "PAID";
    if (/email/i.test(args.utmMedium)) return "EMAIL";
    if (/social/i.test(args.utmMedium)) return "SOCIAL";
    if (/organic/i.test(args.utmMedium)) return "ORGANIC";
    if (/referral/i.test(args.utmMedium)) return "REFERRAL";
    if (/(ai|llm)/i.test(args.utmMedium)) return "AI_REFERRAL";
  }

  switch (args.sourceCategory) {
    case "DIRECT":
      return "DIRECT";
    case "SEARCH":
      return "ORGANIC";
    case "SOCIAL":
      return "SOCIAL";
    case "REFERRAL":
      return args.hasReferer ? "REFERRAL" : "UNKNOWN";
    case "EMAIL":
      return "EMAIL";
    case "PAID":
      return "PAID";
    case "AI_REFERRAL":
      return "AI_REFERRAL";
    default:
      return "UNKNOWN";
  }
}

export function derivePath(input: { path?: string | null; url?: string | null }) {
  const explicitPath = trimString(input.path, 500);
  if (explicitPath) return explicitPath.startsWith("/") ? explicitPath : `/${explicitPath}`;

  const url = parseUrl(input.url);
  if (!url) return null;
  return trimString(url.pathname || "/", 500);
}

export function classifyWebsiteAttribution(
  input: AnalyticsAttributionInput
): WebsiteAnalyticsNormalizedAttribution {
  const url = parseUrl(input.url);
  const referer = trimString(input.referer, 2000);
  const referrerUrl = parseUrl(referer);
  const referrerHost = normalizeHost(referrerUrl?.hostname || null);

  const utmSource = trimString(input.utmSource, 200) ?? getQueryValue(url, "utm_source");
  const utmMedium = trimString(input.utmMedium, 200) ?? getQueryValue(url, "utm_medium");
  const utmCampaign = trimString(input.utmCampaign, 200) ?? getQueryValue(url, "utm_campaign");
  const utmTerm = trimString(input.utmTerm, 200) ?? getQueryValue(url, "utm_term");
  const utmContent = trimString(input.utmContent, 200) ?? getQueryValue(url, "utm_content");
  const gclid = trimString(input.gclid, 200) ?? getQueryValue(url, "gclid");
  const fbclid = trimString(input.fbclid, 200) ?? getQueryValue(url, "fbclid");
  const msclkid = trimString(input.msclkid, 200) ?? getQueryValue(url, "msclkid");
  const ttclid = trimString(input.ttclid, 200) ?? getQueryValue(url, "ttclid");

  const clickPlatform = gclid
    ? "google"
    : msclkid
      ? "microsoft"
      : fbclid
        ? "facebook"
        : ttclid
          ? "tiktok"
          : null;

  const referrerMatch = detectPlatformByHost(referrerHost);
  const sourceCategory = resolveCategory({
    utmSource,
    utmMedium,
    clickPlatform,
    referrerMatch,
    referer,
  });
  const sourceMedium = resolveMedium({
    sourceCategory,
    utmMedium,
    hasReferer: Boolean(referer),
  });

  return {
    sourceCategory,
    sourcePlatform:
      normalizePlatform(utmSource) ??
      normalizePlatform(clickPlatform) ??
      normalizePlatform(referrerMatch?.platform ?? null),
    sourceMedium,
    referrerHost,
    referer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    gclid,
    fbclid,
    msclkid,
    ttclid,
  };
}
