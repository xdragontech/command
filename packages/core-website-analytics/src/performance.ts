import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { WebsiteAnalyticsValidationError } from "./errors";
import { derivePath } from "./classification";
import type { WebsiteAnalyticsIdentity } from "./types";

const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

export type RecordWebsiteAnalyticsPerformanceMetricArgs = {
  brandId: string;
  sessionId: string;
  eventId: string;
  metricName: string;
  metricValue: number;
  identity: WebsiteAnalyticsIdentity;
  occurredAt?: Date;
  url?: string | null;
  path?: string | null;
  raw?: unknown;
};

export type RecordWebsiteAnalyticsPerformanceMetricResult = {
  sessionId: string;
  recorded: boolean;
  duplicate: boolean;
};

function trimString(value: unknown, max = 2000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function validateSessionId(value: string) {
  const trimmed = value.trim();
  if (!SESSION_ID_PATTERN.test(trimmed)) {
    throw new WebsiteAnalyticsValidationError("Website session header is missing or invalid.");
  }
  return trimmed;
}

function validateMetricName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new WebsiteAnalyticsValidationError("Performance metric name is required.");
  }
  return trimmed.slice(0, 120);
}

function validateMetricValue(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new WebsiteAnalyticsValidationError("Performance metric value must be a non-negative number.");
  }
  return Number(value.toFixed(4));
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

export async function recordWebsiteAnalyticsPerformanceMetric(
  args: RecordWebsiteAnalyticsPerformanceMetricArgs
): Promise<RecordWebsiteAnalyticsPerformanceMetricResult> {
  const sessionId = validateSessionId(args.sessionId);
  const eventId = trimString(args.eventId, 200);
  if (!eventId) {
    throw new WebsiteAnalyticsValidationError("Performance metric eventId is required.");
  }

  const metricName = validateMetricName(args.metricName);
  const metricValue = validateMetricValue(args.metricValue);
  const occurredAt = args.occurredAt ?? new Date();
  const url = trimString(args.url, 2000);
  const path = derivePath({
    path: trimString(args.path, 500),
    url,
  });

  return prisma.$transaction(async (tx) => {
    let session = await tx.websiteSession.findUnique({
      where: {
        brandId_sessionId: {
          brandId: args.brandId,
          sessionId,
        },
      },
    });

    if (!session) {
      session = await tx.websiteSession.create({
        data: {
          brandId: args.brandId,
          sessionId,
          startedAt: occurredAt,
          lastSeenAt: occurredAt,
          landingUrl: url,
          landingPath: path,
          lastPath: path,
          sourceCategory: "UNKNOWN",
          sourceMedium: "UNKNOWN",
          countryIso2: args.identity.countryIso2,
          countryName: args.identity.countryName,
          ip: args.identity.ip,
          userAgent: args.identity.userAgent,
        },
      });
    }

    const eventPath = path ?? session.lastPath ?? session.landingPath ?? null;

    try {
      await tx.websiteAnalyticsEvent.create({
        data: {
          brandId: args.brandId,
          websiteSessionId: session.id,
          eventId,
          eventType: "PERFORMANCE_METRIC",
          path: eventPath,
          url,
          occurredAt,
          sourceCategory: session.sourceCategory,
          sourcePlatform: session.sourcePlatform,
          sourceMedium: session.sourceMedium,
          referer: session.referer,
          referrerHost: session.referrerHost,
          countryIso2: args.identity.countryIso2,
          countryName: args.identity.countryName,
          ip: args.identity.ip,
          userAgent: args.identity.userAgent,
          metricName,
          metricValue,
          raw: toJson(args.raw),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return {
          sessionId,
          recorded: false,
          duplicate: true,
        };
      }

      throw error;
    }

    const nextLastSeenAt = maxDate(session.lastSeenAt, occurredAt);
    const reopenedSession = Boolean(session.endedAt && occurredAt > session.endedAt);

    await tx.websiteSession.update({
      where: { id: session.id },
      data: {
        lastSeenAt: nextLastSeenAt,
        endedAt: reopenedSession ? null : session.endedAt,
        lastPath: eventPath ?? session.lastPath,
        countryIso2: session.countryIso2 ?? args.identity.countryIso2,
        countryName: session.countryName ?? args.identity.countryName,
        ip: session.ip ?? args.identity.ip,
        userAgent: session.userAgent ?? args.identity.userAgent,
      },
    });

    return {
      sessionId,
      recorded: true,
      duplicate: false,
    };
  });
}
