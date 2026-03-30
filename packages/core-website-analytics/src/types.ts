export const WEBSITE_ANALYTICS_SOURCE_CATEGORIES = [
  "DIRECT",
  "SEARCH",
  "SOCIAL",
  "REFERRAL",
  "EMAIL",
  "PAID",
  "AI_REFERRAL",
  "UNKNOWN",
] as const;

export const WEBSITE_ANALYTICS_SOURCE_MEDIA = [
  "DIRECT",
  "ORGANIC",
  "SOCIAL",
  "REFERRAL",
  "EMAIL",
  "PAID",
  "AI_REFERRAL",
  "UNKNOWN",
] as const;

export const WEBSITE_ANALYTICS_EVENT_TYPES = [
  "SESSION_START",
  "PAGE_VIEW",
  "ENGAGEMENT_PING",
  "SESSION_END",
  "CONVERSION",
  "WEB_VITAL",
  "PERFORMANCE_METRIC",
] as const;

export const WEBSITE_ANALYTICS_INGEST_EVENT_TYPES = [
  "SESSION_START",
  "PAGE_VIEW",
  "ENGAGEMENT_PING",
  "SESSION_END",
  "WEB_VITAL",
  "PERFORMANCE_METRIC",
] as const;

export const WEBSITE_ANALYTICS_CONVERSION_TYPES = [
  "CONTACT_SUBMIT",
  "CHAT_LEAD_SUBMIT",
  "CLIENT_LOGIN_SUCCESS",
  "CLIENT_SIGNUP_CREATED",
  "CLIENT_SIGNUP_VERIFIED",
] as const;

export type WebsiteAnalyticsSourceCategory =
  (typeof WEBSITE_ANALYTICS_SOURCE_CATEGORIES)[number];
export type WebsiteAnalyticsSourceMedium = (typeof WEBSITE_ANALYTICS_SOURCE_MEDIA)[number];
export type WebsiteAnalyticsEventType = (typeof WEBSITE_ANALYTICS_EVENT_TYPES)[number];
export type WebsiteAnalyticsIngestEventType =
  (typeof WEBSITE_ANALYTICS_INGEST_EVENT_TYPES)[number];
export type WebsiteAnalyticsConversionType =
  (typeof WEBSITE_ANALYTICS_CONVERSION_TYPES)[number];

export type WebsiteAnalyticsCollectEventInput = {
  eventId?: unknown;
  eventType?: unknown;
  occurredAt?: unknown;
  path?: unknown;
  url?: unknown;
  referer?: unknown;
  engagedSeconds?: unknown;
  metricName?: unknown;
  metricValue?: unknown;
  conversionType?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmTerm?: unknown;
  utmContent?: unknown;
  gclid?: unknown;
  fbclid?: unknown;
  msclkid?: unknown;
  ttclid?: unknown;
  raw?: unknown;
};

export type WebsiteAnalyticsCollectRequest = {
  events?: unknown;
};

export type WebsiteAnalyticsIdentity = {
  ip: string;
  countryIso2: string | null;
  countryName: string | null;
  userAgent: string | null;
};

export type WebsiteAnalyticsNormalizedAttribution = {
  sourceCategory: WebsiteAnalyticsSourceCategory;
  sourcePlatform: string | null;
  sourceMedium: WebsiteAnalyticsSourceMedium;
  referrerHost: string | null;
  referer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
};

export type ValidatedWebsiteAnalyticsEvent = {
  eventId: string;
  eventType: WebsiteAnalyticsIngestEventType;
  occurredAt: Date;
  path: string | null;
  url: string | null;
  referer: string | null;
  engagedSeconds: number | null;
  metricName: string | null;
  metricValue: number | null;
  attribution: WebsiteAnalyticsNormalizedAttribution;
  raw: unknown;
};
