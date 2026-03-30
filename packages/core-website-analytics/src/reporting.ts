import type { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import type {
  WebsiteAnalyticsConversionType,
  WebsiteAnalyticsSourceCategory,
} from "./types";

export type WebsiteAnalyticsScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export type WebsiteAnalyticsBrandOption = {
  brandId: string;
  brandKey: string | null;
  brandName: string | null;
};

export type WebsiteTrafficTimelinePoint = {
  date: string;
  label: string;
  sessions: number;
  engagedSessions: number;
  convertedSessions: number;
};

export type WebsiteTrafficSourceRow = {
  sourceCategory: WebsiteAnalyticsSourceCategory;
  sourcePlatform: string | null;
  sessions: number;
  engagedSessions: number;
  convertedSessions: number;
  conversionRate: number;
  share: number;
};

export type WebsiteTrafficLandingPageRow = {
  path: string;
  sessions: number;
  engagedSessions: number;
  convertedSessions: number;
  conversionRate: number;
  averageEngagedSeconds: number;
};

export type WebsiteTrafficPerformanceMetricSource =
  | "BROWSER"
  | "PUBLIC_WEBSITE"
  | "PUBLIC_API";

export type WebsiteTrafficPerformanceRow = {
  metricName: string;
  metricSource: WebsiteTrafficPerformanceMetricSource;
  routeKey: string | null;
  routeLabel: string | null;
  label: string;
  sampleCount: number;
  averageValue: number;
  p75Value: number;
};

export type WebsiteTrafficReport = {
  totals: {
    sessions: number;
    engagedSessions: number;
    bouncedSessions: number;
    convertedSessions: number;
    conversionRate: number;
    bounceRate: number;
    averageEngagedSeconds: number;
  };
  timeline: WebsiteTrafficTimelinePoint[];
  sourceBreakdown: WebsiteTrafficSourceRow[];
  landingPages: WebsiteTrafficLandingPageRow[];
  performanceMetrics: WebsiteTrafficPerformanceRow[];
  brandOptions: WebsiteAnalyticsBrandOption[];
  range: {
    from: string;
    to: string;
  };
  updatedAt: string;
};

export type WebsiteLeadAttributionSourceRow = {
  sourceCategory: WebsiteAnalyticsSourceCategory;
  sourcePlatform: string | null;
  total: number;
  contact: number;
  chat: number;
};

export type WebsiteLeadAttributionLandingPageRow = {
  path: string;
  total: number;
  contact: number;
  chat: number;
};

export type WebsiteLeadAttributionPlatformRow = {
  platform: string;
  total: number;
  contact: number;
  chat: number;
};

export type WebsiteLeadAttributionReport = {
  totals: {
    total: number;
    contact: number;
    chat: number;
  };
  sourceBreakdown: WebsiteLeadAttributionSourceRow[];
  landingPages: WebsiteLeadAttributionLandingPageRow[];
  referrerPlatforms: WebsiteLeadAttributionPlatformRow[];
};

export type WebsiteDashboardSummary = {
  sessions: number;
  engagedSessions: number;
  convertedSessions: number;
  conversionRate: number;
  bounceRate: number;
  averageEngagedSeconds: number;
  topSources: Array<{
    sourceCategory: WebsiteAnalyticsSourceCategory;
    sourcePlatform: string | null;
    sessions: number;
    share: number;
  }>;
};

type SessionRow = {
  startedAt: Date;
  engaged: boolean;
  bounced: boolean;
  converted: boolean;
  engagedSeconds: number;
  landingPath: string | null;
  sourceCategory: WebsiteAnalyticsSourceCategory;
  sourcePlatform: string | null;
};

type PerformanceMetricEventRow = {
  eventType: "WEB_VITAL" | "PERFORMANCE_METRIC";
  metricName: string | null;
  metricValue: number | null;
  raw: Prisma.JsonValue | null;
};

type AttributedLeadRow = {
  conversionType: WebsiteAnalyticsConversionType | null;
  session: {
    landingPath: string | null;
    sourceCategory: WebsiteAnalyticsSourceCategory;
    sourcePlatform: string | null;
    referrerHost: string | null;
  };
};

function defaultRange() {
  const today = new Date();
  const to = toIsoDate(today);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    from: toIsoDate(start),
    to,
  };
}

function isIsoDateOnly(value?: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRange(inputFrom?: string | null, inputTo?: string | null) {
  const fallback = defaultRange();
  const from = isIsoDateOnly(inputFrom) ? inputFrom : fallback.from;
  const to = isIsoDateOnly(inputTo) ? inputTo : fallback.to;
  return from <= to ? { from, to } : { from: to, to: from };
}

function parseRangeStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseRangeEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function* eachUtcDate(from: string, to: string) {
  const current = parseRangeStart(from);
  const end = parseRangeStart(to);

  while (current <= end) {
    yield toIsoDate(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function roundRate(value: number) {
  return Number(value.toFixed(4));
}

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

function getJsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getJsonString(value: Record<string, unknown> | null, key: string, max = 120) {
  const raw = value?.[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizePerformanceMetricSource(
  eventType: "WEB_VITAL" | "PERFORMANCE_METRIC",
  raw: Prisma.JsonValue | null
): WebsiteTrafficPerformanceMetricSource {
  if (eventType === "WEB_VITAL") return "BROWSER";

  const source = getJsonString(getJsonObject(raw), "source", 40);
  if (source === "PUBLIC_WEBSITE" || source === "PUBLIC_API") {
    return source;
  }

  return "PUBLIC_API";
}

function buildPerformanceMetricLabel(args: {
  eventType: "WEB_VITAL" | "PERFORMANCE_METRIC";
  metricName: string;
  metricSource: WebsiteTrafficPerformanceMetricSource;
  routeLabel: string | null;
}) {
  if (args.eventType === "WEB_VITAL") {
    return args.metricName;
  }

  const routeLabel = args.routeLabel || "Request";

  if (args.metricSource === "PUBLIC_WEBSITE" && args.metricName === "REQUEST_MS") {
    return `Public Website ${routeLabel} Request Time`;
  }

  if (args.metricSource === "PUBLIC_API" && args.metricName === "REQUEST_MS") {
    return `Public API ${routeLabel} Round-Trip Time`;
  }

  if (args.metricSource === "PUBLIC_API" && args.metricName === "SERVER_MS") {
    return `Public API ${routeLabel} Server Time`;
  }

  if (args.metricSource === "PUBLIC_API" && args.metricName === "DB_QUERY_MS") {
    return `Public API ${routeLabel} DB Query Time`;
  }

  if (args.metricSource === "PUBLIC_API" && args.metricName === "DB_QUERY_COUNT") {
    return `Public API ${routeLabel} DB Query Count`;
  }

  return args.metricName;
}

function getPerformanceMetricSortWeight(args: {
  eventType: "WEB_VITAL" | "PERFORMANCE_METRIC";
  metricName: string;
  metricSource: WebsiteTrafficPerformanceMetricSource;
}) {
  if (args.eventType === "WEB_VITAL") {
    const browserOrder = ["LCP", "CLS", "INP", "FCP", "TTFB", "FID"];
    const index = browserOrder.indexOf(args.metricName.toUpperCase());
    return index >= 0 ? index : browserOrder.length;
  }

  const performanceOrder =
    args.metricSource === "PUBLIC_WEBSITE"
      ? ["REQUEST_MS"]
      : ["REQUEST_MS", "SERVER_MS", "DB_QUERY_MS", "DB_QUERY_COUNT"];
  const index = performanceOrder.indexOf(args.metricName);
  return 100 + (index >= 0 ? index : performanceOrder.length);
}

function buildBrandOptions(brands: Array<{ id: string; brandKey: string | null; name: string }>) {
  return [...brands]
    .sort((left, right) => left.name.localeCompare(right.name) || (left.brandKey || "").localeCompare(right.brandKey || ""))
    .map((brand) => ({
      brandId: brand.id,
      brandKey: brand.brandKey,
      brandName: brand.name,
    }));
}

function buildAccessibleBrandWhere(scope: WebsiteAnalyticsScope) {
  return scope.role === "SUPERADMIN" ? {} : { id: { in: scope.allowedBrandIds } };
}

async function loadAccessibleBrands(scope: WebsiteAnalyticsScope) {
  return prisma.brand.findMany({
    where: buildAccessibleBrandWhere(scope),
    select: {
      id: true,
      brandKey: true,
      name: true,
    },
  });
}

function buildTrafficWhere(params: {
  scope: WebsiteAnalyticsScope;
  brandId?: string | null;
  from: string;
  to: string;
}) {
  const where: Record<string, unknown> = {
    startedAt: {
      gte: parseRangeStart(params.from),
      lte: parseRangeEnd(params.to),
    },
  };

  if (params.brandId) {
    where.brandId = params.brandId;
  } else if (params.scope.role !== "SUPERADMIN") {
    where.brandId = { in: params.scope.allowedBrandIds };
  }

  return where;
}

function buildEventWhere(params: {
  scope: WebsiteAnalyticsScope;
  brandId?: string | null;
  from: string;
  to: string;
}) {
  const where: Record<string, unknown> = {
    occurredAt: {
      gte: parseRangeStart(params.from),
      lte: parseRangeEnd(params.to),
    },
  };

  if (params.brandId) {
    where.brandId = params.brandId;
  } else if (params.scope.role !== "SUPERADMIN") {
    where.brandId = { in: params.scope.allowedBrandIds };
  }

  return where;
}

function emptyTrafficReport(
  range: { from: string; to: string },
  brandOptions: WebsiteAnalyticsBrandOption[]
): WebsiteTrafficReport {
  return {
    totals: {
      sessions: 0,
      engagedSessions: 0,
      bouncedSessions: 0,
      convertedSessions: 0,
      conversionRate: 0,
      bounceRate: 0,
      averageEngagedSeconds: 0,
    },
    timeline: Array.from(eachUtcDate(range.from, range.to)).map((date) => ({
      date,
      label: formatShortDate(date),
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
    })),
    sourceBreakdown: [],
    landingPages: [],
    performanceMetrics: [],
    brandOptions,
    range,
    updatedAt: new Date().toISOString(),
  };
}

function emptyLeadAttributionReport(): WebsiteLeadAttributionReport {
  return {
    totals: {
      total: 0,
      contact: 0,
      chat: 0,
    },
    sourceBreakdown: [],
    landingPages: [],
    referrerPlatforms: [],
  };
}

export async function loadWebsiteTrafficReport(params: {
  scope: WebsiteAnalyticsScope;
  brandId?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<WebsiteTrafficReport> {
  const range = normalizeRange(params.from, params.to);

  if (params.scope.role !== "SUPERADMIN" && params.scope.allowedBrandIds.length === 0) {
    return emptyTrafficReport(range, []);
  }

  const brands = await loadAccessibleBrands(params.scope);
  const brandOptions = buildBrandOptions(brands);

  if (
    params.brandId &&
    params.scope.role !== "SUPERADMIN" &&
    !params.scope.allowedBrandIds.includes(params.brandId)
  ) {
    return emptyTrafficReport(range, brandOptions);
  }

  const [sessionRows, performanceEventRows] = await Promise.all([
    prisma.websiteSession.findMany({
      where: buildTrafficWhere({
        scope: params.scope,
        brandId: params.brandId,
        from: range.from,
        to: range.to,
      }),
      select: {
        startedAt: true,
        engaged: true,
        bounced: true,
        converted: true,
        engagedSeconds: true,
        landingPath: true,
        sourceCategory: true,
        sourcePlatform: true,
      },
      orderBy: { startedAt: "asc" },
    }) as Promise<SessionRow[]>,
    prisma.websiteAnalyticsEvent.findMany({
      where: {
        ...buildEventWhere({
          scope: params.scope,
          brandId: params.brandId,
          from: range.from,
          to: range.to,
        }),
        eventType: {
          in: ["WEB_VITAL", "PERFORMANCE_METRIC"],
        },
      },
      select: {
        eventType: true,
        metricName: true,
        metricValue: true,
        raw: true,
      },
    }) as Promise<PerformanceMetricEventRow[]>,
  ]);

  const totals = {
    sessions: sessionRows.length,
    engagedSessions: sessionRows.filter((row) => row.engaged).length,
    bouncedSessions: sessionRows.filter((row) => row.bounced).length,
    convertedSessions: sessionRows.filter((row) => row.converted).length,
    conversionRate: 0,
    bounceRate: 0,
    averageEngagedSeconds: 0,
  };

  if (!totals.sessions) {
    return emptyTrafficReport(range, brandOptions);
  }

  totals.conversionRate = roundRate(totals.convertedSessions / totals.sessions);
  totals.bounceRate = roundRate(totals.bouncedSessions / totals.sessions);
  totals.averageEngagedSeconds = totals.engagedSessions
    ? roundMetric(
        sessionRows.reduce((sum, row) => sum + row.engagedSeconds, 0) / totals.engagedSessions
      )
    : 0;

  const timelineRows = new Map<string, WebsiteTrafficTimelinePoint>();
  for (const date of eachUtcDate(range.from, range.to)) {
    timelineRows.set(date, {
      date,
      label: formatShortDate(date),
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
    });
  }

  const sourceRows = new Map<string, WebsiteTrafficSourceRow>();
  const landingRows = new Map<string, WebsiteTrafficLandingPageRow>();

  for (const row of sessionRows) {
    const dateKey = toIsoDate(row.startedAt);
    const point = timelineRows.get(dateKey);
    if (point) {
      point.sessions += 1;
      if (row.engaged) point.engagedSessions += 1;
      if (row.converted) point.convertedSessions += 1;
    }

    const sourceKey = `${row.sourceCategory}:${row.sourcePlatform || ""}`;
    const source = sourceRows.get(sourceKey) || {
      sourceCategory: row.sourceCategory,
      sourcePlatform: row.sourcePlatform,
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
      conversionRate: 0,
      share: 0,
    };
    source.sessions += 1;
    if (row.engaged) source.engagedSessions += 1;
    if (row.converted) source.convertedSessions += 1;
    sourceRows.set(sourceKey, source);

    const landingPath = row.landingPath || "(unknown)";
    const landing = landingRows.get(landingPath) || {
      path: landingPath,
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
      conversionRate: 0,
      averageEngagedSeconds: 0,
    };
    landing.sessions += 1;
    if (row.engaged) landing.engagedSessions += 1;
    if (row.converted) landing.convertedSessions += 1;
    landing.averageEngagedSeconds += row.engagedSeconds;
    landingRows.set(landingPath, landing);
  }

  const sourceBreakdown = Array.from(sourceRows.values())
    .map((row) => ({
      ...row,
      conversionRate: row.sessions ? roundRate(row.convertedSessions / row.sessions) : 0,
      share: totals.sessions ? roundRate(row.sessions / totals.sessions) : 0,
    }))
    .sort(
      (left, right) =>
        right.sessions - left.sessions ||
        right.convertedSessions - left.convertedSessions ||
        left.sourceCategory.localeCompare(right.sourceCategory)
    );

  const landingPages = Array.from(landingRows.values())
    .map((row) => ({
      ...row,
      conversionRate: row.sessions ? roundRate(row.convertedSessions / row.sessions) : 0,
      averageEngagedSeconds: row.engagedSessions
        ? roundMetric(row.averageEngagedSeconds / row.engagedSessions)
        : 0,
    }))
    .sort((left, right) => right.sessions - left.sessions || left.path.localeCompare(right.path))
    .slice(0, 20);

  const performanceMetricRows = new Map<
    string,
    {
      eventType: "WEB_VITAL" | "PERFORMANCE_METRIC";
      metricName: string;
      metricSource: WebsiteTrafficPerformanceMetricSource;
      routeKey: string | null;
      routeLabel: string | null;
      label: string;
      values: number[];
    }
  >();
  for (const row of performanceEventRows) {
    if (!row.metricName || typeof row.metricValue !== "number") continue;
    const raw = getJsonObject(row.raw);
    const metricSource = normalizePerformanceMetricSource(row.eventType, row.raw);
    const routeKey = row.eventType === "PERFORMANCE_METRIC" ? getJsonString(raw, "routeKey", 60) : null;
    const routeLabel = row.eventType === "PERFORMANCE_METRIC" ? getJsonString(raw, "routeLabel", 120) : null;
    const groupKey = [row.eventType, metricSource, row.metricName, routeKey || ""].join(":");
    const current = performanceMetricRows.get(groupKey) || {
      eventType: row.eventType,
      metricName: row.metricName,
      metricSource,
      routeKey,
      routeLabel,
      label: buildPerformanceMetricLabel({
        eventType: row.eventType,
        metricName: row.metricName,
        metricSource,
        routeLabel,
      }),
      values: [],
    };
    current.values.push(row.metricValue);
    performanceMetricRows.set(groupKey, current);
  }

  const performanceMetrics = Array.from(performanceMetricRows.values())
    .map((row) => {
      const values = row.values;
      const sorted = [...values].sort((left, right) => left - right);
      const p75Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.75) - 1));
      const averageValue = values.reduce((sum, value) => sum + value, 0) / values.length;
      return {
        metricName: row.metricName,
        metricSource: row.metricSource,
        routeKey: row.routeKey,
        routeLabel: row.routeLabel,
        label: row.label,
        sampleCount: values.length,
        averageValue: roundMetric(averageValue),
        p75Value: roundMetric(sorted[p75Index] || 0),
      };
    })
    .sort((left, right) => {
      const leftWeight = getPerformanceMetricSortWeight({
        eventType: left.metricSource === "BROWSER" ? "WEB_VITAL" : "PERFORMANCE_METRIC",
        metricName: left.metricName,
        metricSource: left.metricSource,
      });
      const rightWeight = getPerformanceMetricSortWeight({
        eventType: right.metricSource === "BROWSER" ? "WEB_VITAL" : "PERFORMANCE_METRIC",
        metricName: right.metricName,
        metricSource: right.metricSource,
      });
      return (
        leftWeight - rightWeight ||
        (left.routeLabel || "").localeCompare(right.routeLabel || "") ||
        left.label.localeCompare(right.label)
      );
    });

  return {
    totals,
    timeline: Array.from(timelineRows.values()),
    sourceBreakdown,
    landingPages,
    performanceMetrics,
    brandOptions,
    range,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadWebsiteLeadAttributionReport(params: {
  scope: WebsiteAnalyticsScope;
  brandId?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<WebsiteLeadAttributionReport> {
  const range = normalizeRange(params.from, params.to);

  if (params.scope.role !== "SUPERADMIN" && params.scope.allowedBrandIds.length === 0) {
    return emptyLeadAttributionReport();
  }

  if (
    params.brandId &&
    params.scope.role !== "SUPERADMIN" &&
    !params.scope.allowedBrandIds.includes(params.brandId)
  ) {
    return emptyLeadAttributionReport();
  }

  const rows = (await prisma.websiteAnalyticsEvent.findMany({
    where: {
      ...buildEventWhere({
        scope: params.scope,
        brandId: params.brandId,
        from: range.from,
        to: range.to,
      }),
      eventType: "CONVERSION",
      conversionType: {
        in: ["CONTACT_SUBMIT", "CHAT_LEAD_SUBMIT"],
      },
    },
    select: {
      conversionType: true,
      session: {
        select: {
          landingPath: true,
          sourceCategory: true,
          sourcePlatform: true,
          referrerHost: true,
        },
      },
    },
  })) as AttributedLeadRow[];

  if (!rows.length) {
    return emptyLeadAttributionReport();
  }

  const totals = {
    total: rows.length,
    contact: rows.filter((row) => row.conversionType === "CONTACT_SUBMIT").length,
    chat: rows.filter((row) => row.conversionType === "CHAT_LEAD_SUBMIT").length,
  };

  const sourceRows = new Map<string, WebsiteLeadAttributionSourceRow>();
  const landingRows = new Map<string, WebsiteLeadAttributionLandingPageRow>();
  const platformRows = new Map<string, WebsiteLeadAttributionPlatformRow>();

  for (const row of rows) {
    const typeKey = row.conversionType === "CHAT_LEAD_SUBMIT" ? "chat" : "contact";

    const sourceKey = `${row.session.sourceCategory}:${row.session.sourcePlatform || ""}`;
    const source = sourceRows.get(sourceKey) || {
      sourceCategory: row.session.sourceCategory,
      sourcePlatform: row.session.sourcePlatform,
      total: 0,
      contact: 0,
      chat: 0,
    };
    source.total += 1;
    source[typeKey] += 1;
    sourceRows.set(sourceKey, source);

    const landingPath = row.session.landingPath || "(unknown)";
    const landing = landingRows.get(landingPath) || {
      path: landingPath,
      total: 0,
      contact: 0,
      chat: 0,
    };
    landing.total += 1;
    landing[typeKey] += 1;
    landingRows.set(landingPath, landing);

    const platformName =
      row.session.sourcePlatform || row.session.referrerHost || "direct / unknown";
    const platform = platformRows.get(platformName) || {
      platform: platformName,
      total: 0,
      contact: 0,
      chat: 0,
    };
    platform.total += 1;
    platform[typeKey] += 1;
    platformRows.set(platformName, platform);
  }

  return {
    totals,
    sourceBreakdown: Array.from(sourceRows.values()).sort(
      (left, right) => right.total - left.total || left.sourceCategory.localeCompare(right.sourceCategory)
    ),
    landingPages: Array.from(landingRows.values())
      .sort((left, right) => right.total - left.total || left.path.localeCompare(right.path))
      .slice(0, 20),
    referrerPlatforms: Array.from(platformRows.values())
      .sort((left, right) => right.total - left.total || left.platform.localeCompare(right.platform))
      .slice(0, 20),
  };
}

export async function loadWebsiteDashboardSummary(params: {
  scope: WebsiteAnalyticsScope;
  from: Date;
  to: Date;
}): Promise<WebsiteDashboardSummary> {
  if (params.scope.role !== "SUPERADMIN" && params.scope.allowedBrandIds.length === 0) {
    return {
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
      conversionRate: 0,
      bounceRate: 0,
      averageEngagedSeconds: 0,
      topSources: [],
    };
  }

  const rows = (await prisma.websiteSession.findMany({
    where: {
      ...(params.scope.role === "SUPERADMIN" ? {} : { brandId: { in: params.scope.allowedBrandIds } }),
      startedAt: {
        gte: params.from,
        lte: params.to,
      },
    },
    select: {
      engaged: true,
      bounced: true,
      converted: true,
      engagedSeconds: true,
      sourceCategory: true,
      sourcePlatform: true,
    },
  })) as Array<Pick<SessionRow, "engaged" | "bounced" | "converted" | "engagedSeconds" | "sourceCategory" | "sourcePlatform">>;

  const sessions = rows.length;
  const engagedSessions = rows.filter((row) => row.engaged).length;
  const convertedSessions = rows.filter((row) => row.converted).length;
  const bouncedSessions = rows.filter((row) => row.bounced).length;

  const sourceCounts = new Map<string, { sourceCategory: WebsiteAnalyticsSourceCategory; sourcePlatform: string | null; sessions: number }>();
  for (const row of rows) {
    const key = `${row.sourceCategory}:${row.sourcePlatform || ""}`;
    const current = sourceCounts.get(key) || {
      sourceCategory: row.sourceCategory,
      sourcePlatform: row.sourcePlatform,
      sessions: 0,
    };
    current.sessions += 1;
    sourceCounts.set(key, current);
  }

  return {
    sessions,
    engagedSessions,
    convertedSessions,
    conversionRate: sessions ? roundRate(convertedSessions / sessions) : 0,
    bounceRate: sessions ? roundRate(bouncedSessions / sessions) : 0,
    averageEngagedSeconds: engagedSessions
      ? roundMetric(rows.reduce((sum, row) => sum + row.engagedSeconds, 0) / engagedSessions)
      : 0,
    topSources: Array.from(sourceCounts.values())
      .map((row) => ({
        ...row,
        share: sessions ? roundRate(row.sessions / sessions) : 0,
      }))
      .sort((left, right) => right.sessions - left.sessions)
      .slice(0, 3),
  };
}
