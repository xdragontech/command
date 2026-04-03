import { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";
import { ensureBrand, normalizeNullableId, normalizeNullableText, normalizeText, resolveReadableBrandIds, resolveWriteBrandId } from "./common";
import type { PartnerAdminScope, SponsorEventAssignmentRecord, SponsorTierRecord } from "./types";

type SponsorTierWithBrand = Prisma.SponsorTierGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    _count: {
      select: {
        eventAssignments: true;
      };
    };
  };
}>;

type SponsorAssignmentWithRelations = Prisma.SponsorEventAssignmentGetPayload<{
  include: {
    brand: {
      select: {
        id: true;
        brandKey: true;
        name: true;
      };
    };
    sponsorProfile: {
      include: {
        profile: {
          include: {
            user: {
              select: {
                email: true;
              };
            };
          };
        };
      };
    };
    eventSeries: {
      select: {
        id: true;
        name: true;
      };
    };
    tier: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

function toSponsorTierRecord(tier: SponsorTierWithBrand): SponsorTierRecord {
  return {
    id: tier.id,
    brandId: tier.brandId,
    brandKey: tier.brand.brandKey,
    brandName: tier.brand.name,
    name: tier.name,
    description: tier.description,
    sortOrder: tier.sortOrder,
    isActive: tier.isActive,
    assignmentCount: tier._count.eventAssignments,
    createdAt: tier.createdAt.toISOString(),
    updatedAt: tier.updatedAt.toISOString(),
  };
}

function toSponsorEventAssignmentRecord(assignment: SponsorAssignmentWithRelations): SponsorEventAssignmentRecord {
  return {
    id: assignment.id,
    brandId: assignment.brandId,
    brandKey: assignment.brand.brandKey,
    brandName: assignment.brand.name,
    sponsorPartnerProfileId: assignment.sponsorPartnerProfileId,
    partnerProfileId: assignment.sponsorPartnerProfileId,
    sponsorDisplayName: assignment.sponsorProfile.profile.displayName,
    sponsorEmail: assignment.sponsorProfile.profile.user.email,
    scheduleEventSeriesId: assignment.scheduleEventSeriesId,
    eventSeriesName: assignment.eventSeries.name,
    sponsorTierId: assignment.sponsorTierId,
    sponsorTierName: assignment.tier?.name || null,
    notes: assignment.notes,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

export async function listSponsorTiers(params: {
  scope: PartnerAdminScope;
  brandId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as SponsorTierRecord[];

  const rows = await prisma.sponsorTier.findMany({
    where: brandIds === null ? undefined : { brandId: { in: brandIds } },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          eventAssignments: true,
        },
      },
    },
    orderBy: [{ brand: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => toSponsorTierRecord(row as SponsorTierWithBrand));
}

export async function createSponsorTier(params: {
  scope: PartnerAdminScope;
  input: {
    brandId?: string | null;
    name: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };
}) {
  const brandId = resolveWriteBrandId(params.scope, params.input.brandId, { allowSingleBrandFallback: true });
  await ensureBrand(brandId);

  const name = normalizeText(params.input.name);
  if (!name) throw new Error("Tier name is required");

  const tier = await prisma.sponsorTier.create({
    data: {
      brandId,
      name,
      description: normalizeNullableText(params.input.description),
      sortOrder: Number.isFinite(params.input.sortOrder) ? Number(params.input.sortOrder) : 0,
      isActive: params.input.isActive !== false,
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          eventAssignments: true,
        },
      },
    },
  });

  return toSponsorTierRecord(tier as SponsorTierWithBrand);
}

export async function updateSponsorTier(params: {
  scope: PartnerAdminScope;
  id: string;
  input: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  };
}) {
  const existing = await prisma.sponsorTier.findUnique({
    where: { id: params.id },
    select: { id: true, brandId: true },
  });
  if (!existing) throw new Error("Sponsor tier not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Sponsor tier is not available for this backoffice user");
  }

  const updated = await prisma.sponsorTier.update({
    where: { id: existing.id },
    data: {
      ...(params.input.name !== undefined
        ? (() => {
            const nextName = normalizeText(params.input.name);
            if (!nextName) throw new Error("Tier name is required");
            return { name: nextName };
          })()
        : {}),
      ...(params.input.description !== undefined ? { description: normalizeNullableText(params.input.description) } : {}),
      ...(params.input.sortOrder !== undefined ? { sortOrder: Number(params.input.sortOrder) || 0 } : {}),
      ...(params.input.isActive !== undefined ? { isActive: Boolean(params.input.isActive) } : {}),
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      _count: {
        select: {
          eventAssignments: true,
        },
      },
    },
  });

  return toSponsorTierRecord(updated as SponsorTierWithBrand);
}

export async function deleteSponsorTier(params: {
  scope: PartnerAdminScope;
  id: string;
}) {
  const existing = await prisma.sponsorTier.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: {
          eventAssignments: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Sponsor tier not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Sponsor tier is not available for this backoffice user");
  }

  if (existing._count.eventAssignments > 0) {
    throw new Error("Cannot delete a sponsor tier that still has event assignments");
  }

  await prisma.sponsorTier.delete({
    where: { id: existing.id },
  });
}

export async function listSponsorEventAssignments(params: {
  scope: PartnerAdminScope;
  brandId?: string | null;
  eventSeriesId?: string | null;
}) {
  const brandIds = resolveReadableBrandIds(params.scope, normalizeNullableId(params.brandId));
  if (Array.isArray(brandIds) && brandIds.length === 0) return [] as SponsorEventAssignmentRecord[];

  const eventSeriesId = normalizeNullableId(params.eventSeriesId);

  const rows = await prisma.sponsorEventAssignment.findMany({
    where: {
      ...(brandIds === null ? {} : { brandId: { in: brandIds } }),
      ...(eventSeriesId ? { scheduleEventSeriesId: eventSeriesId } : {}),
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      sponsorProfile: {
        include: {
          profile: {
            include: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
      eventSeries: {
        select: {
          id: true,
          name: true,
        },
      },
      tier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ eventSeries: { name: "asc" } }, { sponsorProfile: { profile: { displayName: "asc" } } }],
  });

  return rows.map((row) => toSponsorEventAssignmentRecord(row as SponsorAssignmentWithRelations));
}

export async function createSponsorEventAssignment(params: {
  scope: PartnerAdminScope;
  input: {
    sponsorPartnerProfileId: string;
    scheduleEventSeriesId: string;
    sponsorTierId?: string | null;
    notes?: string | null;
  };
}) {
  const sponsorProfile = await prisma.sponsorPartnerProfile.findUnique({
    where: { partnerProfileId: params.input.sponsorPartnerProfileId },
    include: {
      profile: {
        select: {
          brandId: true,
        },
      },
    },
  });
  if (!sponsorProfile) throw new Error("Sponsor profile not found");

  const eventSeries = await prisma.scheduleEventSeries.findUnique({
    where: { id: params.input.scheduleEventSeriesId },
    select: {
      id: true,
      brandId: true,
    },
  });
  if (!eventSeries) throw new Error("Event not found");

  if (sponsorProfile.profile.brandId !== eventSeries.brandId) {
    throw new Error("Sponsor and event must belong to the same brand");
  }

  const brandId = resolveWriteBrandId(params.scope, eventSeries.brandId, { allowSingleBrandFallback: false });

  if (params.input.sponsorTierId) {
    const tier = await prisma.sponsorTier.findUnique({
      where: { id: params.input.sponsorTierId },
      select: { id: true, brandId: true },
    });
    if (!tier) throw new Error("Sponsor tier not found");
    if (tier.brandId !== brandId) throw new Error("Sponsor tier must belong to the same brand as the event");
  }

  const assignment = await prisma.sponsorEventAssignment.create({
    data: {
      brandId,
      sponsorPartnerProfileId: params.input.sponsorPartnerProfileId,
      scheduleEventSeriesId: params.input.scheduleEventSeriesId,
      sponsorTierId: normalizeNullableId(params.input.sponsorTierId),
      notes: normalizeNullableText(params.input.notes),
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      sponsorProfile: {
        include: {
          profile: {
            include: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
      eventSeries: {
        select: {
          id: true,
          name: true,
        },
      },
      tier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return toSponsorEventAssignmentRecord(assignment as SponsorAssignmentWithRelations);
}

export async function updateSponsorEventAssignment(params: {
  scope: PartnerAdminScope;
  id: string;
  input: {
    sponsorTierId?: string | null;
    notes?: string | null;
  };
}) {
  const existing = await prisma.sponsorEventAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      brandId: true,
    },
  });
  if (!existing) throw new Error("Sponsor event assignment not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Sponsor event assignment is not available for this backoffice user");
  }

  if (params.input.sponsorTierId) {
    const tier = await prisma.sponsorTier.findUnique({
      where: { id: params.input.sponsorTierId },
      select: { id: true, brandId: true },
    });
    if (!tier) throw new Error("Sponsor tier not found");
    if (tier.brandId !== existing.brandId) throw new Error("Sponsor tier must belong to the same brand as the event");
  }

  const updated = await prisma.sponsorEventAssignment.update({
    where: { id: existing.id },
    data: {
      ...(params.input.sponsorTierId !== undefined ? { sponsorTierId: normalizeNullableId(params.input.sponsorTierId) } : {}),
      ...(params.input.notes !== undefined ? { notes: normalizeNullableText(params.input.notes) } : {}),
    },
    include: {
      brand: {
        select: {
          id: true,
          brandKey: true,
          name: true,
        },
      },
      sponsorProfile: {
        include: {
          profile: {
            include: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
      eventSeries: {
        select: {
          id: true,
          name: true,
        },
      },
      tier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return toSponsorEventAssignmentRecord(updated as SponsorAssignmentWithRelations);
}

export async function deleteSponsorEventAssignment(params: {
  scope: PartnerAdminScope;
  id: string;
}) {
  const existing = await prisma.sponsorEventAssignment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      brandId: true,
    },
  });
  if (!existing) throw new Error("Sponsor event assignment not found");

  const brandIds = resolveReadableBrandIds(params.scope, existing.brandId);
  if (Array.isArray(brandIds) && brandIds.length === 0) {
    throw new Error("Sponsor event assignment is not available for this backoffice user");
  }

  await prisma.sponsorEventAssignment.delete({
    where: { id: existing.id },
  });
}
