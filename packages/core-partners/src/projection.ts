import type { Prisma } from "@prisma/client";
import { ScheduleParticipantSource } from "@prisma/client";
import type { ScheduleParticipantRecord } from "@command/core-scheduling";
import * as coreScheduling from "@command/core-scheduling";

type ProjectionClient = Prisma.TransactionClient;
type CoreSchedulingCompat = typeof coreScheduling & {
  listScheduleParticipantAdoptionCandidates?: (params: {
    db?: ProjectionClient;
    brandId: string;
    type: ScheduleParticipantRecord["type"];
    displayName: string;
    slug?: string | null;
  }) => Promise<
    Array<{
      id: string;
      displayName: string;
      slug: string;
      status: ScheduleParticipantRecord["status"];
      source: ScheduleParticipantSource;
      assignmentCount: number;
      exactSlugMatch: boolean;
      exactDisplayNameMatch: boolean;
    }>
  >;
  upsertApprovedPartnerScheduleParticipant: (params: {
    db?: ProjectionClient;
    brandId: string;
    partnerProfileId: string;
    scheduleParticipantId?: string | null;
    displayName: string;
    slug?: string | null;
    type: ScheduleParticipantRecord["type"];
    status: ScheduleParticipantRecord["status"];
    summary?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) => Promise<ScheduleParticipantRecord>;
};

const schedulingCompat = coreScheduling as CoreSchedulingCompat;

export async function upsertPartnerScheduleParticipantProjection(params: {
  db?: ProjectionClient;
  brandId: string;
  partnerProfileId: string;
  scheduleParticipantId?: string | null;
  displayName: string;
  slug?: string | null;
  type: ScheduleParticipantRecord["type"];
  status: ScheduleParticipantRecord["status"];
  summary?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return schedulingCompat.upsertApprovedPartnerScheduleParticipant(params);
}

export async function listPartnerScheduleParticipantAdoptionCandidates(params: {
  db?: ProjectionClient;
  brandId: string;
  type: ScheduleParticipantRecord["type"];
  displayName: string;
  slug?: string | null;
}) {
  if (!schedulingCompat.listScheduleParticipantAdoptionCandidates) {
    throw new Error("Scheduling adoption candidate helper is not available from the current core-scheduling build");
  }
  return schedulingCompat.listScheduleParticipantAdoptionCandidates(params);
}
