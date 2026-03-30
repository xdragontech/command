import crypto from "crypto";
import type { NextApiRequest } from "next";
import { prisma } from "@command/core-db";
import {
  capturePrismaQueryTiming,
  installPrismaQueryTiming,
  type PrismaQueryTimingSnapshot,
} from "@command/core-db/performance";
import { recordWebsiteAnalyticsPerformanceMetric } from "@command/core-website-analytics";
import {
  getClientIp,
  getCountryIso2,
  getReferer,
  getUserAgent,
  toCountryName,
  type TrustedClientIdentityOptions,
} from "./clientIdentity";
import { getWebsiteAnalyticsSessionId } from "./websiteAnalytics";

installPrismaQueryTiming(prisma);

export const PUBLIC_SITE_PERFORMANCE_ROUTES = {
  LOGIN: "Login",
  SIGNUP: "Signup",
  VERIFY_EMAIL: "Email Verification",
  CONTACT: "Contact",
  CHAT: "Chat",
} as const;

export type PublicSitePerformanceRouteKey = keyof typeof PUBLIC_SITE_PERFORMANCE_ROUTES;

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function nextMetricEventId(routeKey: PublicSitePerformanceRouteKey, suffix: string) {
  return `perf:${routeKey.toLowerCase()}:${suffix}:${crypto.randomUUID()}`;
}

async function recordPublicApiPerformanceMetrics(args: {
  req: NextApiRequest;
  brandId: string;
  routeKey: PublicSitePerformanceRouteKey;
  routeLabel: string;
  requestDurationMs: number;
  dbTiming: PrismaQueryTimingSnapshot;
  statusCode?: number;
  options?: TrustedClientIdentityOptions;
}) {
  const sessionId = getWebsiteAnalyticsSessionId(args.req);
  if (!sessionId) return;

  const countryIso2 = getCountryIso2(args.req, args.options);
  const url = getReferer(args.req, args.options);
  const identity = {
    ip: getClientIp(args.req, args.options),
    countryIso2,
    countryName: toCountryName(countryIso2),
    userAgent: getUserAgent(args.req, args.options),
  };
  const rawBase = {
    source: "PUBLIC_API",
    routeKey: args.routeKey,
    routeLabel: args.routeLabel,
    statusCode: args.statusCode ?? null,
  };

  await Promise.allSettled([
    recordWebsiteAnalyticsPerformanceMetric({
      brandId: args.brandId,
      sessionId,
      eventId: nextMetricEventId(args.routeKey, "server"),
      metricName: "SERVER_MS",
      metricValue: roundMetric(args.requestDurationMs),
      identity,
      url,
      raw: rawBase,
    }),
    recordWebsiteAnalyticsPerformanceMetric({
      brandId: args.brandId,
      sessionId,
      eventId: nextMetricEventId(args.routeKey, "db-ms"),
      metricName: "DB_QUERY_MS",
      metricValue: roundMetric(args.dbTiming.totalDurationMs),
      identity,
      url,
      raw: rawBase,
    }),
    recordWebsiteAnalyticsPerformanceMetric({
      brandId: args.brandId,
      sessionId,
      eventId: nextMetricEventId(args.routeKey, "db-count"),
      metricName: "DB_QUERY_COUNT",
      metricValue: args.dbTiming.queryCount,
      identity,
      url,
      raw: rawBase,
    }),
  ]);
}

export async function capturePublicApiRoutePerformance<T>(args: {
  req: NextApiRequest;
  brandId: string;
  routeKey: PublicSitePerformanceRouteKey;
  statusCode?: number;
  options?: TrustedClientIdentityOptions;
  operation: () => Promise<T>;
}) {
  const routeLabel = PUBLIC_SITE_PERFORMANCE_ROUTES[args.routeKey];
  const startedAt = performance.now();
  const measured = await capturePrismaQueryTiming(args.operation);
  const requestDurationMs = roundMetric(performance.now() - startedAt);

  await recordPublicApiPerformanceMetrics({
    req: args.req,
    brandId: args.brandId,
    routeKey: args.routeKey,
    routeLabel,
    requestDurationMs,
    dbTiming: measured.snapshot,
    statusCode: args.statusCode,
    options: args.options,
  });

  if (measured.error) {
    throw measured.error;
  }

  return measured.result as T;
}
