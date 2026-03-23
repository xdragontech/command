import type {
  Prisma,
  ScheduleAssignmentKind,
  ScheduleAssignmentStatus,
  ScheduleEventOccurrenceStatus,
  ScheduleEventSeriesStatus,
  ScheduleParticipantStatus,
  ScheduleParticipantType,
  ScheduleRecurrencePattern,
  ScheduleResourceType,
  ScheduleWeekday,
} from "@prisma/client";

export type SchedulingScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export type ScheduleEventSeriesRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  status: ScheduleEventSeriesStatus;
  recurrencePattern: ScheduleRecurrencePattern;
  recurrenceInterval: number;
  recurrenceDays: ScheduleWeekday[];
  seasonStartsOn: string;
  seasonEndsOn: string;
  occurrenceDayStartsAtMinutes: number;
  occurrenceDayEndsAtMinutes: number;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleResourceRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  name: string;
  slug: string;
  type: ScheduleResourceType;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleParticipantRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  displayName: string;
  slug: string;
  type: ScheduleParticipantType;
  status: ScheduleParticipantStatus;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleEventOccurrenceRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  seriesId: string;
  seriesName: string;
  name: string | null;
  occursOn: string;
  dayStartsAtMinutes: number;
  dayEndsAtMinutes: number;
  status: ScheduleEventOccurrenceStatus;
  assignmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleAssignmentRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  occurrenceId: string;
  occursOn: string;
  occurrenceName: string | null;
  seriesId: string;
  seriesName: string;
  resourceId: string;
  resourceName: string;
  resourceType: ScheduleResourceType;
  participantId: string;
  participantName: string;
  participantType: ScheduleParticipantType;
  kind: ScheduleAssignmentKind;
  status: ScheduleAssignmentStatus;
  startsAtMinutes: number;
  endsAtMinutes: number;
  publicTitle: string | null;
  publicSubtitle: string | null;
  publicDescription: string | null;
  publicLocationLabel: string | null;
  publicUrl: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleConflictRecord = {
  type: "RESOURCE_DOUBLE_BOOKED" | "PARTICIPANT_DOUBLE_BOOKED";
  brandId: string;
  occursOn: string;
  occurrenceId: string;
  seriesId: string;
  seriesName: string;
  resourceIds: string[];
  resourceNames: string[];
  participantIds: string[];
  participantNames: string[];
  assignmentIds: string[];
  message: string;
};

export type CreateScheduleEventSeriesInput = {
  brandId?: string | null;
  name: string;
  slug?: string;
  description?: string | null;
  timezone: string;
  status?: ScheduleEventSeriesStatus;
  recurrencePattern?: ScheduleRecurrencePattern;
  recurrenceInterval?: number;
  recurrenceDays?: ScheduleWeekday[] | string[];
  seasonStartsOn: string;
  seasonEndsOn: string;
  occurrenceDayStartsAtMinutes?: number;
  occurrenceDayEndsAtMinutes?: number;
  metadata?: Prisma.InputJsonValue;
};

export type UpdateScheduleEventSeriesInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  timezone?: string;
  status?: ScheduleEventSeriesStatus;
  recurrencePattern?: ScheduleRecurrencePattern;
  recurrenceInterval?: number;
  recurrenceDays?: ScheduleWeekday[] | string[];
  seasonStartsOn?: string;
  seasonEndsOn?: string;
  occurrenceDayStartsAtMinutes?: number;
  occurrenceDayEndsAtMinutes?: number;
  metadata?: Prisma.InputJsonValue;
};

export type CreateScheduleResourceInput = {
  brandId?: string | null;
  name: string;
  slug?: string;
  type: ScheduleResourceType;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Prisma.InputJsonValue;
};

export type UpdateScheduleResourceInput = {
  name?: string;
  slug?: string;
  type?: ScheduleResourceType;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Prisma.InputJsonValue;
};

export type CreateScheduleParticipantInput = {
  brandId?: string | null;
  displayName: string;
  slug?: string;
  type: ScheduleParticipantType;
  status?: ScheduleParticipantStatus;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type UpdateScheduleParticipantInput = {
  displayName?: string;
  slug?: string;
  type?: ScheduleParticipantType;
  status?: ScheduleParticipantStatus;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type CreateScheduleAssignmentInput = {
  brandId?: string | null;
  occurrenceId: string;
  resourceId: string;
  participantId: string;
  kind: ScheduleAssignmentKind;
  status?: ScheduleAssignmentStatus;
  startsAtMinutes?: number | null;
  endsAtMinutes?: number | null;
  publicTitle?: string | null;
  publicSubtitle?: string | null;
  publicDescription?: string | null;
  publicLocationLabel?: string | null;
  publicUrl?: string | null;
  internalNotes?: string | null;
  metadata?: Prisma.InputJsonValue;
  allowConflicts?: boolean;
};

export type UpdateScheduleAssignmentInput = {
  occurrenceId?: string;
  resourceId?: string;
  participantId?: string;
  kind?: ScheduleAssignmentKind;
  status?: ScheduleAssignmentStatus;
  startsAtMinutes?: number | null;
  endsAtMinutes?: number | null;
  publicTitle?: string | null;
  publicSubtitle?: string | null;
  publicDescription?: string | null;
  publicLocationLabel?: string | null;
  publicUrl?: string | null;
  internalNotes?: string | null;
  metadata?: Prisma.InputJsonValue;
  allowConflicts?: boolean;
};
