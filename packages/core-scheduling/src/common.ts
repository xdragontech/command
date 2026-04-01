import {
  ScheduleAssignmentKind,
  ScheduleAssignmentStatus,
  ScheduleEventSeriesStatus,
  ScheduleParticipantType,
  ScheduleParticipantStatus,
  ScheduleRecurrencePattern,
  SchedulePublicFeedOrderBy,
  ScheduleResourceType,
  ScheduleWeekday,
} from "@prisma/client";
import { prisma } from "@command/core-db";
import type { SchedulingScope } from "./types";

export const SCHEDULING_ASSIGNMENT_STATUSES = Object.values(ScheduleAssignmentStatus);
export const SCHEDULING_ASSIGNMENT_KINDS = Object.values(ScheduleAssignmentKind);
export const SCHEDULING_SERIES_STATUSES = Object.values(ScheduleEventSeriesStatus);
export const SCHEDULING_PARTICIPANT_TYPES = Object.values(ScheduleParticipantType);
export const SCHEDULING_PARTICIPANT_STATUSES = Object.values(ScheduleParticipantStatus);
export const SCHEDULING_RECURRENCE_PATTERNS = Object.values(ScheduleRecurrencePattern);
export const SCHEDULING_PUBLIC_FEED_ORDER_BY = Object.values(SchedulePublicFeedOrderBy);
export const SCHEDULING_RESOURCE_TYPES = Object.values(ScheduleResourceType);
export const SCHEDULING_WEEKDAYS = Object.values(ScheduleWeekday);
export const DEFAULT_SCHEDULE_EVENT_COLOR = "#ef4444";

export function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export function normalizeNullableText(value: unknown) {
  if (value === null) return null;
  const normalized = normalizeText(value);
  return normalized || null;
}

export function parseScheduleEventColor(value: unknown, fallback = DEFAULT_SCHEDULE_EVENT_COLOR) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new Error("Event color must use #RRGGBB format");
  }
  return normalized;
}

export function normalizeNullableId(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

export function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ensureRequired(value: string, label: string) {
  if (!value) throw new Error(`${label} is required`);
}

export function parseIsoDateOnly(value: unknown, label: string) {
  const normalized = normalizeText(value);
  if (!normalized) throw new Error(`${label} is required`);

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`${label} must use YYYY-MM-DD format`);

  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date;
}

export function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function validateTimezone(value: unknown) {
  const timezone = normalizeText(value);
  ensureRequired(timezone, "Timezone");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error("Timezone is invalid");
  }
}

export function parsePositiveInt(value: unknown, label: string, fallback?: number) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label} is required`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function parseMinuteOfDay(value: unknown, label: string, fallback?: number) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label} is required`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1440) {
    throw new Error(`${label} must be an integer between 0 and 1440`);
  }
  return parsed;
}

export function normalizeWeekdays(value: unknown): ScheduleWeekday[] {
  const entries = Array.isArray(value) ? value : [];
  const normalized = Array.from(
    new Set(
      entries
        .map((entry) => normalizeText(entry).toUpperCase())
        .filter((entry): entry is ScheduleWeekday => SCHEDULING_WEEKDAYS.includes(entry as ScheduleWeekday))
    )
  );
  return normalized;
}

export function parseRecurrencePattern(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleRecurrencePattern;
  return SCHEDULING_RECURRENCE_PATTERNS.includes(normalized) ? normalized : ScheduleRecurrencePattern.NONE;
}

export function parseSeriesStatus(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleEventSeriesStatus;
  return SCHEDULING_SERIES_STATUSES.includes(normalized) ? normalized : ScheduleEventSeriesStatus.DRAFT;
}

export function parseParticipantStatus(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleParticipantStatus;
  return SCHEDULING_PARTICIPANT_STATUSES.includes(normalized) ? normalized : ScheduleParticipantStatus.ACTIVE;
}

export function parseParticipantType(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleParticipantType;
  if (!SCHEDULING_PARTICIPANT_TYPES.includes(normalized)) {
    throw new Error("Participant type is invalid");
  }
  return normalized;
}

export function parseAssignmentStatus(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleAssignmentStatus;
  return SCHEDULING_ASSIGNMENT_STATUSES.includes(normalized) ? normalized : ScheduleAssignmentStatus.DRAFT;
}

export function parseAssignmentKind(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleAssignmentKind;
  if (!SCHEDULING_ASSIGNMENT_KINDS.includes(normalized)) {
    throw new Error("Assignment kind is invalid");
  }
  return normalized;
}

export function parseResourceType(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as ScheduleResourceType;
  if (!SCHEDULING_RESOURCE_TYPES.includes(normalized)) {
    throw new Error("Resource type is invalid");
  }
  return normalized;
}

export function parsePublicFeedOrderBy(value: unknown) {
  const normalized = normalizeText(value).toUpperCase() as SchedulePublicFeedOrderBy;
  if (!SCHEDULING_PUBLIC_FEED_ORDER_BY.includes(normalized)) {
    throw new Error("Feed order is invalid");
  }
  return normalized;
}

export function normalizeUrl(value: unknown) {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error("Public URL must be a valid http/https URL");
  }
}

export function assertBrandAccess(scope: SchedulingScope, brandId: string) {
  if (scope.role === "SUPERADMIN") return;
  if (!scope.allowedBrandIds.includes(brandId)) {
    throw new Error("Forbidden brand scope");
  }
}

export function resolveReadableBrandIds(scope: SchedulingScope, requestedBrandId: string | null) {
  if (scope.role === "SUPERADMIN") {
    return requestedBrandId ? [requestedBrandId] : null;
  }

  if (scope.allowedBrandIds.length === 0) return [];
  if (!requestedBrandId) return scope.allowedBrandIds;
  assertBrandAccess(scope, requestedBrandId);
  return [requestedBrandId];
}

export function resolveWriteBrandId(
  scope: SchedulingScope,
  rawBrandId: unknown,
  options?: { allowSingleBrandFallback?: boolean }
) {
  const requestedBrandId = normalizeNullableId(rawBrandId);
  const allowSingleBrandFallback = options?.allowSingleBrandFallback !== false;

  if (scope.role === "SUPERADMIN") {
    if (requestedBrandId) return requestedBrandId;
    throw new Error("Brand selection is required");
  }

  if (scope.allowedBrandIds.length === 0) throw new Error("No writable brands available");
  if (requestedBrandId) {
    assertBrandAccess(scope, requestedBrandId);
    return requestedBrandId;
  }
  if (allowSingleBrandFallback && scope.allowedBrandIds.length === 1) {
    return scope.allowedBrandIds[0];
  }
  throw new Error("Brand selection is required");
}

export async function ensureBrand(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, brandKey: true, name: true },
  });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

export function weekdayForDate(date: Date): ScheduleWeekday {
  return SCHEDULING_WEEKDAYS[date.getUTCDay()];
}

export function addDays(date: Date, days: number) {
  const next = new Date(date.toISOString());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function weeksBetween(start: Date, current: Date) {
  const diffDays = Math.floor((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7);
}

export function formatConflictTimeRange(startsAtMinutes: number, endsAtMinutes: number) {
  function render(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const suffix = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${mins.toString().padStart(2, "0")} ${suffix}`;
  }

  return `${render(startsAtMinutes)} - ${render(endsAtMinutes)}`;
}

export class SchedulingConflictError extends Error {
  conflicts: unknown[];

  constructor(message: string, conflicts: unknown[]) {
    super(message);
    this.name = "SchedulingConflictError";
    this.conflicts = conflicts;
  }
}
