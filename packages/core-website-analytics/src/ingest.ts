import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { WebsiteAnalyticsValidationError } from "./errors";
import { classifyWebsiteAttribution, derivePath } from "./classification";
import type {
  ValidatedWebsiteAnalyticsEvent,
  WebsiteAnalyticsCollectEventInput,
  WebsiteAnalyticsCollectRequest,
  WebsiteAnalyticsIdentity,
  WebsiteAnalyticsIngestEventType,
} from "./types";

const MAX_BATCH_EVENTS = 100;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

type IngestWebsiteAnalyticsArgs = {
  brandId: string;
  sessionId: string;
  identity: WebsiteAnalyticsIdentity;
  payload: WebsiteAnalyticsCollectRequest;
};

type IngestWebsiteAnalyticsResult = {
  sessionId: string;
  acceptedEvents: number;
  duplicateEvents: number;
};

function trimString(value: unknown, max = 2000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseOccurredAt(value: unknown) {
  if (typeof value !== "string") {
    throw new WebsiteAnalyticsValidationError("Analytics event occurredAt must be an ISO string.");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new WebsiteAnalyticsValidationError("Analytics event occurredAt must be a valid ISO date.");
  }

  return date;
}

function parseEventType(value: unknown): WebsiteAnalyticsIngestEventType {
  if (value === "CONVERSION") {
    throw new WebsiteAnalyticsValidationError(
      "Client-reported conversion events are not accepted yet. Conversion linkage remains server-owned."
    );
  }

  if (
    value !== "SESSION_START" &&
    value !== "PAGE_VIEW" &&
    value !== "ENGAGEMENT_PING" &&
    value !== "SESSION_END" &&
    value !== "WEB_VITAL"
  ) {
    throw new WebsiteAnalyticsValidationError("Unsupported analytics eventType.");
  }

  return value;
}

function parseMetricValue(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WebsiteAnalyticsValidationError("Analytics metricValue must be a finite number.");
  }

  return value;
}

function parseEngagedSeconds(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new WebsiteAnalyticsValidationError("Analytics engagedSeconds must be a non-negative number.");
  }

  return Math.floor(value);
}

function validateEvent(input: WebsiteAnalyticsCollectEventInput): ValidatedWebsiteAnalyticsEvent {
  const eventId = trimString(input?.eventId, 200);
  if (!eventId) {
    throw new WebsiteAnalyticsValidationError("Analytics eventId is required.");
  }

  const eventType = parseEventType(input?.eventType);
  const occurredAt = parseOccurredAt(input?.occurredAt);
  const url = trimString(input?.url, 2000);
  const referer = trimString(input?.referer, 2000);
  const path = derivePath({
    path: trimString(input?.path, 500),
    url,
  });
  const metricName = trimString(input?.metricName, 120);
  const metricValue = parseMetricValue(input?.metricValue);
  const engagedSeconds = parseEngagedSeconds(input?.engagedSeconds);

  if (eventType === "WEB_VITAL" && (!metricName || metricValue == null)) {
    throw new WebsiteAnalyticsValidationError(
      "WEB_VITAL events require both metricName and metricValue."
    );
  }

  if (eventType !== "WEB_VITAL" && (metricName || metricValue != null)) {
    throw new WebsiteAnalyticsValidationError(
      "metricName and metricValue are only valid for WEB_VITAL events."
    );
  }

  if (eventType === "ENGAGEMENT_PING" && engagedSeconds == null) {
    throw new WebsiteAnalyticsValidationError(
      "ENGAGEMENT_PING events require engagedSeconds."
    );
  }

  return {
    eventId,
    eventType,
    occurredAt,
    path,
    url,
    referer,
    engagedSeconds,
    metricName,
    metricValue,
    attribution: classifyWebsiteAttribution({
      url,
      referer,
      utmSource: trimString(input?.utmSource, 200),
      utmMedium: trimString(input?.utmMedium, 200),
      utmCampaign: trimString(input?.utmCampaign, 200),
      utmTerm: trimString(input?.utmTerm, 200),
      utmContent: trimString(input?.utmContent, 200),
      gclid: trimString(input?.gclid, 200),
      fbclid: trimString(input?.fbclid, 200),
      msclkid: trimString(input?.msclkid, 200),
      ttclid: trimString(input?.ttclid, 200),
    }),
    raw: input?.raw ?? null,
  };
}

function validatePayload(payload: WebsiteAnalyticsCollectRequest) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new WebsiteAnalyticsValidationError("Analytics payload must be an object.");
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new WebsiteAnalyticsValidationError("Analytics payload must contain at least one event.");
  }

  if (payload.events.length > MAX_BATCH_EVENTS) {
    throw new WebsiteAnalyticsValidationError(
      `Analytics payload may include at most ${MAX_BATCH_EVENTS} events.`
    );
  }

  const seenEventIds = new Set<string>();
  return payload.events.map((event) => {
    const validated = validateEvent((event || {}) as WebsiteAnalyticsCollectEventInput);
    if (seenEventIds.has(validated.eventId)) {
      throw new WebsiteAnalyticsValidationError("Duplicate analytics eventId detected in request payload.");
    }
    seenEventIds.add(validated.eventId);
    return validated;
  });
}

function validateSessionId(value: string) {
  const trimmed = value.trim();
  if (!SESSION_ID_PATTERN.test(trimmed)) {
    throw new WebsiteAnalyticsValidationError("Website session header is missing or invalid.");
  }
  return trimmed;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

export async function ingestWebsiteAnalytics(
  args: IngestWebsiteAnalyticsArgs
): Promise<IngestWebsiteAnalyticsResult> {
  const sessionId = validateSessionId(args.sessionId);
  const events = validatePayload(args.payload).sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()
  );

  const earliestEvent = events[0];
  const latestEvent = events[events.length - 1];

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
          startedAt: earliestEvent.occurredAt,
          lastSeenAt: latestEvent.occurredAt,
          landingUrl: earliestEvent.url,
          landingPath: earliestEvent.path,
          lastPath: latestEvent.path,
          sourceCategory: earliestEvent.attribution.sourceCategory,
          sourcePlatform: earliestEvent.attribution.sourcePlatform,
          sourceMedium: earliestEvent.attribution.sourceMedium,
          referrerHost: earliestEvent.attribution.referrerHost,
          referer: earliestEvent.attribution.referer,
          utmSource: earliestEvent.attribution.utmSource,
          utmMedium: earliestEvent.attribution.utmMedium,
          utmCampaign: earliestEvent.attribution.utmCampaign,
          utmTerm: earliestEvent.attribution.utmTerm,
          utmContent: earliestEvent.attribution.utmContent,
          gclid: earliestEvent.attribution.gclid,
          fbclid: earliestEvent.attribution.fbclid,
          msclkid: earliestEvent.attribution.msclkid,
          ttclid: earliestEvent.attribution.ttclid,
          countryIso2: args.identity.countryIso2,
          countryName: args.identity.countryName,
          ip: args.identity.ip,
          userAgent: args.identity.userAgent,
        },
      });
    }

    let acceptedEvents = 0;
    let duplicateEvents = 0;
    let pageViewDelta = 0;
    let engagedSecondsDelta = 0;
    let latestCreatedAt = session.lastSeenAt;
    let latestCreatedPath = session.lastPath;
    let latestSessionEndAt = session.endedAt;
    let sawPostEndActivity = false;

    for (const event of events) {
      try {
        await tx.websiteAnalyticsEvent.create({
          data: {
            brandId: args.brandId,
            websiteSessionId: session.id,
            eventId: event.eventId,
            eventType: event.eventType,
            path: event.path,
            url: event.url,
            occurredAt: event.occurredAt,
            sourceCategory: event.attribution.sourceCategory,
            sourcePlatform: event.attribution.sourcePlatform,
            sourceMedium: event.attribution.sourceMedium,
            referer: event.attribution.referer,
            referrerHost: event.attribution.referrerHost,
            countryIso2: args.identity.countryIso2,
            countryName: args.identity.countryName,
            ip: args.identity.ip,
            userAgent: args.identity.userAgent,
            metricName: event.metricName,
            metricValue: event.metricValue,
            engagedSeconds: event.engagedSeconds,
            raw: toJson(event.raw),
          },
        });

        acceptedEvents += 1;
        latestCreatedAt = maxDate(latestCreatedAt, event.occurredAt);
        if (event.path) latestCreatedPath = event.path;

        if (event.eventType === "PAGE_VIEW") pageViewDelta += 1;
        if (event.engagedSeconds) engagedSecondsDelta += event.engagedSeconds;
        if (event.eventType === "SESSION_END") {
          latestSessionEndAt = event.occurredAt;
        } else if (
          (latestSessionEndAt && event.occurredAt > latestSessionEndAt) ||
          (session.endedAt && event.occurredAt > session.endedAt)
        ) {
          sawPostEndActivity = true;
        }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          duplicateEvents += 1;
          continue;
        }

        throw error;
      }
    }

    if (acceptedEvents > 0) {
      const replaceLandingAttribution = earliestEvent.occurredAt < session.startedAt;
      const nextStartedAt = minDate(session.startedAt, earliestEvent.occurredAt);
      const nextPageViewCount = session.pageViewCount + pageViewDelta;
      const nextEngagedSeconds = session.engagedSeconds + engagedSecondsDelta;
      const nextConversionCount = session.conversionCount;
      const nextEngaged =
        nextPageViewCount >= 2 || nextEngagedSeconds >= 10 || nextConversionCount >= 1;
      const nextBounced = nextPageViewCount === 1 && !nextEngaged;
      const nextEndedAt =
        latestSessionEndAt && !sawPostEndActivity ? latestSessionEndAt : sawPostEndActivity ? null : session.endedAt;
      const nextSourceCategory =
        replaceLandingAttribution || session.sourceCategory === "UNKNOWN"
          ? earliestEvent.attribution.sourceCategory
          : session.sourceCategory;
      const nextSourcePlatform = replaceLandingAttribution
        ? earliestEvent.attribution.sourcePlatform
        : session.sourcePlatform ?? earliestEvent.attribution.sourcePlatform;
      const nextSourceMedium =
        replaceLandingAttribution || session.sourceMedium === "UNKNOWN"
          ? earliestEvent.attribution.sourceMedium
          : session.sourceMedium;
      const nextReferrerHost = replaceLandingAttribution
        ? earliestEvent.attribution.referrerHost
        : session.referrerHost ?? earliestEvent.attribution.referrerHost;
      const nextReferer = replaceLandingAttribution
        ? earliestEvent.attribution.referer
        : session.referer ?? earliestEvent.attribution.referer;
      const nextLandingUrl = replaceLandingAttribution
        ? earliestEvent.url
        : session.landingUrl ?? earliestEvent.url;
      const nextLandingPath = replaceLandingAttribution
        ? earliestEvent.path
        : session.landingPath ?? earliestEvent.path;
      const nextUtmSource = replaceLandingAttribution
        ? earliestEvent.attribution.utmSource
        : session.utmSource ?? earliestEvent.attribution.utmSource;
      const nextUtmMedium = replaceLandingAttribution
        ? earliestEvent.attribution.utmMedium
        : session.utmMedium ?? earliestEvent.attribution.utmMedium;
      const nextUtmCampaign = replaceLandingAttribution
        ? earliestEvent.attribution.utmCampaign
        : session.utmCampaign ?? earliestEvent.attribution.utmCampaign;
      const nextUtmTerm = replaceLandingAttribution
        ? earliestEvent.attribution.utmTerm
        : session.utmTerm ?? earliestEvent.attribution.utmTerm;
      const nextUtmContent = replaceLandingAttribution
        ? earliestEvent.attribution.utmContent
        : session.utmContent ?? earliestEvent.attribution.utmContent;
      const nextGclid = replaceLandingAttribution
        ? earliestEvent.attribution.gclid
        : session.gclid ?? earliestEvent.attribution.gclid;
      const nextFbclid = replaceLandingAttribution
        ? earliestEvent.attribution.fbclid
        : session.fbclid ?? earliestEvent.attribution.fbclid;
      const nextMsclkid = replaceLandingAttribution
        ? earliestEvent.attribution.msclkid
        : session.msclkid ?? earliestEvent.attribution.msclkid;
      const nextTtclid = replaceLandingAttribution
        ? earliestEvent.attribution.ttclid
        : session.ttclid ?? earliestEvent.attribution.ttclid;
      const sourceEnriched =
        nextSourceCategory !== session.sourceCategory ||
        nextSourcePlatform !== session.sourcePlatform ||
        nextSourceMedium !== session.sourceMedium ||
        nextReferrerHost !== session.referrerHost ||
        nextReferer !== session.referer;

      session = await tx.websiteSession.update({
        where: { id: session.id },
        data: {
          startedAt: nextStartedAt,
          lastSeenAt: latestCreatedAt,
          endedAt: nextEndedAt,
          lastPath: latestCreatedPath,
          pageViewCount: nextPageViewCount,
          engagedSeconds: nextEngagedSeconds,
          engaged: nextEngaged,
          bounced: nextBounced,
          converted: nextConversionCount > 0,
          conversionCount: nextConversionCount,
          landingUrl: nextLandingUrl,
          landingPath: nextLandingPath,
          sourceCategory: nextSourceCategory,
          sourcePlatform: nextSourcePlatform,
          sourceMedium: nextSourceMedium,
          referrerHost: nextReferrerHost,
          referer: nextReferer,
          utmSource: nextUtmSource,
          utmMedium: nextUtmMedium,
          utmCampaign: nextUtmCampaign,
          utmTerm: nextUtmTerm,
          utmContent: nextUtmContent,
          gclid: nextGclid,
          fbclid: nextFbclid,
          msclkid: nextMsclkid,
          ttclid: nextTtclid,
        },
      });

      if (sourceEnriched || replaceLandingAttribution) {
        await tx.websiteAnalyticsEvent.updateMany({
          where: {
            websiteSessionId: session.id,
            OR: [
              { sourceCategory: "UNKNOWN" },
              { eventType: "CONVERSION" },
            ],
          },
          data: {
            sourceCategory: nextSourceCategory,
            sourcePlatform: nextSourcePlatform,
            sourceMedium: nextSourceMedium,
            referrerHost: nextReferrerHost,
            referer: nextReferer,
          },
        });
      }
    }

    return {
      sessionId,
      acceptedEvents,
      duplicateEvents,
    };
  });
}
