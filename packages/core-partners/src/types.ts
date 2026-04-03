import type {
  PartnerApplicationReviewDecision,
  PartnerApplicationStatus,
  PartnerKind,
  PartnerSponsorType,
  PartnerUserStatus,
  ParticipantRequirementReviewerState,
  ParticipantRequirementType,
  ScheduleParticipantSource,
  ScheduleParticipantStatus,
  ScheduleParticipantType,
} from "@prisma/client";

export type PartnerAdminScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

export type PartnerApplicationCounts = {
  draft: number;
  submitted: number;
  inReview: number;
  approved: number;
  rejected: number;
  withdrawn: number;
};

export type PartnerAccountRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  partnerUserId: string;
  kind: PartnerKind;
  email: string;
  userStatus: PartnerUserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  displayName: string;
  slug: string;
  contactName: string;
  contactPhone: string;
  summary: string | null;
  description: string | null;
  mainWebsiteUrl: string | null;
  participantType: ScheduleParticipantType | null;
  sponsorProductServiceType: string | null;
  sponsorType: PartnerSponsorType | null;
  linkedScheduleParticipant:
    | {
        id: string;
        status: ScheduleParticipantStatus;
        source: ScheduleParticipantSource;
      }
    | null;
  applicationCounts: PartnerApplicationCounts;
  approvedEventNames: string[];
  sponsorAssignments: Array<{
    id: string;
    eventSeriesId: string;
    eventName: string;
    sponsorTierId: string | null;
    sponsorTierName: string | null;
  }>;
};

export type PartnerApplicationReviewRecord = {
  id: string;
  decision: PartnerApplicationReviewDecision;
  notes: string | null;
  reviewerUserId: string | null;
  reviewerDisplayName: string | null;
  createdAt: string;
};

export type PartnerApplicationRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  partnerProfileId: string;
  partnerUserId: string;
  applicationKind: PartnerKind;
  status: PartnerApplicationStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  eventSeriesId: string;
  eventSeriesName: string;
  partnerEmail: string;
  partnerDisplayName: string;
  partnerContactName: string;
  partnerContactPhone: string;
  participantType: ScheduleParticipantType | null;
  sponsorProductServiceType: string | null;
  sponsorType: PartnerSponsorType | null;
  submittedProfileSnapshot: unknown;
  reviews: PartnerApplicationReviewRecord[];
};

export type PartnerDiscrepancyState = "MISSING" | "PENDING_REVIEW" | "REJECTED" | "EXPIRED";

export type PartnerDiscrepancyRecord = {
  partnerProfileId: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  partnerDisplayName: string;
  partnerEmail: string;
  participantType: ScheduleParticipantType;
  requirementType: ParticipantRequirementType;
  state: PartnerDiscrepancyState;
  reviewerState: ParticipantRequirementReviewerState | null;
  expiresAt: string | null;
  assetId: string | null;
  assetFileName: string | null;
  eventSeriesIds: string[];
  eventSeriesNames: string[];
};

export type SponsorTierRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  assignmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SponsorEventAssignmentRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  sponsorPartnerProfileId: string;
  partnerProfileId: string;
  sponsorDisplayName: string;
  sponsorEmail: string;
  scheduleEventSeriesId: string;
  eventSeriesName: string;
  sponsorTierId: string | null;
  sponsorTierName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
