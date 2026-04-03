import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { PartnerAccountRecord, SponsorEventAssignmentRecord, SponsorTierRecord } from "@command/core-partners";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  SchedulingListRow,
  actionRowStyle,
  errorStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
} from "../../../components/adminScheduling";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type EventOption = {
  id: string;
  brandId: string;
  name: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

type TierForm = {
  brandId: string;
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type AssignmentForm = {
  sponsorPartnerProfileId: string;
  scheduleEventSeriesId: string;
  sponsorTierId: string;
  notes: string;
};

const NEW_TIER_ID = "__new_tier__";
const NEW_ASSIGNMENT_ID = "__new_assignment__";

function blankTierForm(brands: BrandOption[], brandFilter: string): TierForm {
  return {
    brandId: brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "",
    name: "",
    description: "",
    sortOrder: "0",
    isActive: true,
  };
}

function tierFormFromRecord(tier: SponsorTierRecord): TierForm {
  return {
    brandId: tier.brandId,
    name: tier.name,
    description: tier.description || "",
    sortOrder: String(tier.sortOrder),
    isActive: tier.isActive,
  };
}

function blankAssignmentForm(): AssignmentForm {
  return {
    sponsorPartnerProfileId: "",
    scheduleEventSeriesId: "",
    sponsorTierId: "",
    notes: "",
  };
}

function assignmentFormFromRecord(assignment: SponsorEventAssignmentRecord): AssignmentForm {
  return {
    sponsorPartnerProfileId: assignment.sponsorPartnerProfileId,
    scheduleEventSeriesId: assignment.scheduleEventSeriesId,
    sponsorTierId: assignment.sponsorTierId || "",
    notes: assignment.notes || "",
  };
}

export default function SponsorsManagementPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sponsors, setSponsors] = useState<PartnerAccountRecord[]>([]);
  const [tiers, setTiers] = useState<SponsorTierRecord[]>([]);
  const [assignments, setAssignments] = useState<SponsorEventAssignmentRecord[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [selectedTierId, setSelectedTierId] = useState<string | null>(NEW_TIER_ID);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(NEW_ASSIGNMENT_ID);
  const [tierForm, setTierForm] = useState<TierForm>(blankTierForm([], "ALL"));
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(blankAssignmentForm());
  const [loading, setLoading] = useState(false);
  const [savingTier, setSavingTier] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(options?: { nextSelectedTierId?: string | null; nextSelectedAssignmentId?: string | null; nextBrandFilter?: string; nextEventFilter?: string }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedEventFilter = options?.nextEventFilter ?? eventFilter;
    setLoading(true);
    setError("");
    try {
      const tierParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") tierParams.set("brandId", resolvedBrandFilter);

      const assignmentParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") assignmentParams.set("brandId", resolvedBrandFilter);
      if (resolvedEventFilter !== "ALL") assignmentParams.set("eventSeriesId", resolvedEventFilter);

      const sponsorParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") sponsorParams.set("brandId", resolvedBrandFilter);

      const [brandsRes, eventsRes, sponsorsRes, tiersRes, assignmentsRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch("/api/admin/scheduling/series"),
        fetch(`/api/admin/partners/sponsor-accounts?${sponsorParams.toString()}`),
        fetch(`/api/admin/partners/sponsor-tiers?${tierParams.toString()}`),
        fetch(`/api/admin/partners/sponsor-assignments?${assignmentParams.toString()}`),
      ]);
      const [brandsPayload, eventsPayload, sponsorsPayload, tiersPayload, assignmentsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        eventsRes.json().catch(() => null),
        sponsorsRes.json().catch(() => null),
        tiersRes.json().catch(() => null),
        assignmentsRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!eventsRes.ok || !eventsPayload?.ok) throw new Error(eventsPayload?.error || "Failed to load events");
      if (!sponsorsRes.ok || !sponsorsPayload?.ok) throw new Error(sponsorsPayload?.error || "Failed to load sponsors");
      if (!tiersRes.ok || !tiersPayload?.ok) throw new Error(tiersPayload?.error || "Failed to load sponsor tiers");
      if (!assignmentsRes.ok || !assignmentsPayload?.ok) throw new Error(assignmentsPayload?.error || "Failed to load sponsor assignments");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextEvents = Array.isArray(eventsPayload.serieses)
        ? (eventsPayload.serieses as Array<{ id: string; brandId: string; name: string }>).map((entry) => ({
            id: entry.id,
            brandId: entry.brandId,
            name: entry.name,
          }))
        : [];
      const nextSponsors = Array.isArray(sponsorsPayload.accounts) ? (sponsorsPayload.accounts as PartnerAccountRecord[]) : [];
      const nextTiers = Array.isArray(tiersPayload.tiers) ? (tiersPayload.tiers as SponsorTierRecord[]) : [];
      const nextAssignments = Array.isArray(assignmentsPayload.assignments)
        ? (assignmentsPayload.assignments as SponsorEventAssignmentRecord[])
        : [];

      setBrands(nextBrands);
      setEvents(nextEvents);
      setSponsors(nextSponsors);
      setTiers(nextTiers);
      setAssignments(nextAssignments);

      const nextSelectedTier =
        (options?.nextSelectedTierId && nextTiers.find((entry) => entry.id === options.nextSelectedTierId)) ||
        nextTiers[0] ||
        null;
      if (options?.nextSelectedTierId === NEW_TIER_ID || (!nextSelectedTier && nextTiers.length === 0)) {
        setSelectedTierId(NEW_TIER_ID);
        setTierForm(blankTierForm(nextBrands, resolvedBrandFilter));
      } else if (nextSelectedTier) {
        setSelectedTierId(nextSelectedTier.id);
        setTierForm(tierFormFromRecord(nextSelectedTier));
      }

      const nextSelectedAssignment =
        (options?.nextSelectedAssignmentId && nextAssignments.find((entry) => entry.id === options.nextSelectedAssignmentId)) ||
        nextAssignments[0] ||
        null;
      if (options?.nextSelectedAssignmentId === NEW_ASSIGNMENT_ID || (!nextSelectedAssignment && nextAssignments.length === 0)) {
        setSelectedAssignmentId(NEW_ASSIGNMENT_ID);
        setAssignmentForm(blankAssignmentForm());
      } else if (nextSelectedAssignment) {
        setSelectedAssignmentId(nextSelectedAssignment.id);
        setAssignmentForm(assignmentFormFromRecord(nextSelectedAssignment));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load sponsor management data");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData({ nextSelectedTierId: NEW_TIER_ID, nextSelectedAssignmentId: NEW_ASSIGNMENT_ID });
  }, []);

  useEffect(() => {
    void loadData({ nextSelectedTierId: selectedTierId, nextSelectedAssignmentId: selectedAssignmentId });
  }, [brandFilter, eventFilter]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => (brandFilter === "ALL" ? true : event.brandId === brandFilter));
  }, [brandFilter, events]);

  const visibleSponsors = useMemo(() => {
    return sponsors.filter((sponsor) => (brandFilter === "ALL" ? true : sponsor.brandId === brandFilter));
  }, [brandFilter, sponsors]);

  const visibleTiers = useMemo(() => {
    return tiers.filter((tier) => (brandFilter === "ALL" ? true : tier.brandId === brandFilter));
  }, [brandFilter, tiers]);

  const visibleAssignments = useMemo(() => {
    return assignments.filter((assignment) => (eventFilter === "ALL" ? true : assignment.scheduleEventSeriesId === eventFilter));
  }, [assignments, eventFilter]);

  const selectedTier = selectedTierId && selectedTierId !== NEW_TIER_ID ? tiers.find((tier) => tier.id === selectedTierId) || null : null;
  const selectedAssignment =
    selectedAssignmentId && selectedAssignmentId !== NEW_ASSIGNMENT_ID
      ? assignments.find((assignment) => assignment.id === selectedAssignmentId) || null
      : null;

  async function saveTier() {
    setSavingTier(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        brandId: tierForm.brandId,
        name: tierForm.name,
        description: tierForm.description,
        sortOrder: Number(tierForm.sortOrder) || 0,
        isActive: tierForm.isActive,
      };
      const res = await fetch(
        selectedTier ? `/api/admin/partners/sponsor-tiers/${selectedTier.id}` : "/api/admin/partners/sponsor-tiers",
        {
          method: selectedTier ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const response = await res.json().catch(() => null);
      if (!res.ok || !response?.ok) throw new Error(response?.error || "Failed to save sponsor tier");
      const savedTier = response.tier as SponsorTierRecord;
      await loadData({ nextSelectedTierId: savedTier.id, nextSelectedAssignmentId: selectedAssignmentId });
      setNotice(selectedTier ? "Sponsor tier updated." : "Sponsor tier created.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save sponsor tier");
      setNotice("");
    } finally {
      setSavingTier(false);
    }
  }

  async function deleteTier() {
    if (!selectedTier) return;
    const ok = window.confirm(`Delete sponsor tier "${selectedTier.name}"?`);
    if (!ok) return;
    setSavingTier(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/sponsor-tiers/${selectedTier.id}`, { method: "DELETE" });
      const response = await res.json().catch(() => null);
      if (!res.ok || !response?.ok) throw new Error(response?.error || "Failed to delete sponsor tier");
      await loadData({ nextSelectedTierId: NEW_TIER_ID, nextSelectedAssignmentId: selectedAssignmentId });
      setNotice("Sponsor tier deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete sponsor tier");
      setNotice("");
    } finally {
      setSavingTier(false);
    }
  }

  async function saveAssignment() {
    setSavingAssignment(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        sponsorPartnerProfileId: assignmentForm.sponsorPartnerProfileId,
        scheduleEventSeriesId: assignmentForm.scheduleEventSeriesId,
        sponsorTierId: assignmentForm.sponsorTierId || null,
        notes: assignmentForm.notes,
      };
      const res = await fetch(
        selectedAssignment ? `/api/admin/partners/sponsor-assignments/${selectedAssignment.id}` : "/api/admin/partners/sponsor-assignments",
        {
          method: selectedAssignment ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const response = await res.json().catch(() => null);
      if (!res.ok || !response?.ok) throw new Error(response?.error || "Failed to save sponsor assignment");
      const savedAssignment = response.assignment as SponsorEventAssignmentRecord;
      await loadData({ nextSelectedTierId: selectedTierId, nextSelectedAssignmentId: savedAssignment.id });
      setNotice(selectedAssignment ? "Sponsor assignment updated." : "Sponsor assignment created.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save sponsor assignment");
      setNotice("");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function deleteAssignment() {
    if (!selectedAssignment) return;
    const ok = window.confirm(`Delete sponsor assignment for "${selectedAssignment.sponsorDisplayName}" on "${selectedAssignment.eventSeriesName}"?`);
    if (!ok) return;
    setSavingAssignment(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/sponsor-assignments/${selectedAssignment.id}`, { method: "DELETE" });
      const response = await res.json().catch(() => null);
      if (!res.ok || !response?.ok) throw new Error(response?.error || "Failed to delete sponsor assignment");
      await loadData({ nextSelectedTierId: selectedTierId, nextSelectedAssignmentId: NEW_ASSIGNMENT_ID });
      setNotice("Sponsor assignment deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete sponsor assignment");
      setNotice("");
    } finally {
      setSavingAssignment(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Event Mgmt / Sponsors Mgmt"
      sectionLabel="Event Mgmt / Sponsors Mgmt"
      loggedInAs={loggedInAs}
      active="scheduling"
      role={principalRole}
      brands={principalBrands}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={mutedPanelStyle}>
          Sponsors are event-level in v1. They do not have scheduling/resource/timeslot assignments, but they do need tier management and event linkage.
        </div>
        {error ? <div style={errorStyle}>{error}</div> : null}
        {notice ? <div style={successStyle}>{notice}</div> : null}

        <AdminCard title="Management Filters" description={loading ? "Loading…" : "Scope sponsor tiers and event assignments by brand and event"}>
          <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Brand</span>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} style={inputStyle}>
                <option value="ALL">All brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Event</span>
              <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} style={inputStyle}>
                <option value="ALL">All events</option>
                {visibleEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ ...fieldStyle, justifyContent: "end" }}>
              <span style={labelStyle}>&nbsp;</span>
              <button type="button" onClick={() => void loadData({ nextSelectedTierId: selectedTierId, nextSelectedAssignmentId: selectedAssignmentId })} style={primaryButtonStyle}>
                Refresh
              </button>
            </div>
          </div>
        </AdminCard>

        <div style={splitLayoutStyle}>
          <AdminCard title="Sponsor Tiers" description="Configure assignable sponsorship tiers per brand">
            <div style={splitLayoutStyle}>
              <div style={panelStyle}>
                <div style={{ display: "grid", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTierId(NEW_TIER_ID);
                      setTierForm(blankTierForm(brands, brandFilter));
                    }}
                    style={secondaryButtonStyle}
                  >
                    New Tier
                  </button>
                  {visibleTiers.length === 0 ? (
                    <div style={subtleTextStyle}>No sponsor tiers found for the current brand filter.</div>
                  ) : (
                    visibleTiers.map((tier) => (
                      <SchedulingListRow
                        key={tier.id}
                        selected={tier.id === selectedTierId}
                        onClick={() => {
                          setSelectedTierId(tier.id);
                          setTierForm(tierFormFromRecord(tier));
                        }}
                        topLeft={<strong>{tier.name}</strong>}
                        topRight={<span style={subtleTextStyle}>{tier.assignmentCount} assigned</span>}
                        bottomLeft={tier.brandName}
                        bottomRight={tier.isActive ? "ACTIVE" : "INACTIVE"}
                      />
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Brand</span>
                  <select value={tierForm.brandId} onChange={(event) => setTierForm((current) => ({ ...current, brandId: event.target.value }))} style={inputStyle}>
                    <option value="">Select a brand</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Tier Name</span>
                  <input value={tierForm.name} onChange={(event) => setTierForm((current) => ({ ...current, name: event.target.value }))} style={inputStyle} />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Description</span>
                  <textarea value={tierForm.description} onChange={(event) => setTierForm((current) => ({ ...current, description: event.target.value }))} style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} />
                </label>
                <div style={{ display: "grid", gap: "14px", gridTemplateColumns: "minmax(0, 140px) minmax(0, 1fr)" }}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Sort Order</span>
                    <input value={tierForm.sortOrder} onChange={(event) => setTierForm((current) => ({ ...current, sortOrder: event.target.value }))} style={inputStyle} />
                  </label>
                  <label style={{ ...fieldStyle, alignContent: "end" }}>
                    <span style={labelStyle}>Active</span>
                    <input type="checkbox" checked={tierForm.isActive} onChange={(event) => setTierForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  </label>
                </div>
                <div style={actionRowStyle}>
                  <button type="button" onClick={() => void saveTier()} style={primaryButtonStyle} disabled={savingTier}>
                    {savingTier ? "Saving…" : selectedTier ? "Update Tier" : "Create Tier"}
                  </button>
                  {selectedTier ? (
                    <button type="button" onClick={() => void deleteTier()} style={secondaryButtonStyle} disabled={savingTier}>
                      Delete Tier
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </AdminCard>

          <AdminCard title="Sponsor Event Assignments" description="Assign approved sponsor profiles to events and tiers">
            <div style={splitLayoutStyle}>
              <div style={panelStyle}>
                <div style={{ display: "grid", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(NEW_ASSIGNMENT_ID);
                      setAssignmentForm(blankAssignmentForm());
                    }}
                    style={secondaryButtonStyle}
                  >
                    New Assignment
                  </button>
                  {visibleAssignments.length === 0 ? (
                    <div style={subtleTextStyle}>No sponsor event assignments found for the current filters.</div>
                  ) : (
                    visibleAssignments.map((assignment) => (
                      <SchedulingListRow
                        key={assignment.id}
                        selected={assignment.id === selectedAssignmentId}
                        onClick={() => {
                          setSelectedAssignmentId(assignment.id);
                          setAssignmentForm(assignmentFormFromRecord(assignment));
                        }}
                        topLeft={<strong>{assignment.sponsorDisplayName}</strong>}
                        topRight={<span style={subtleTextStyle}>{assignment.sponsorTierName || "No tier"}</span>}
                        bottomLeft={assignment.eventSeriesName}
                        bottomRight={assignment.brandName}
                      />
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Sponsor</span>
                  <select
                    value={assignmentForm.sponsorPartnerProfileId}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, sponsorPartnerProfileId: event.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select a sponsor</option>
                    {visibleSponsors.map((sponsor) => (
                      <option key={sponsor.id} value={sponsor.id}>
                        {sponsor.displayName} · {sponsor.brandName}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Event</span>
                  <select
                    value={assignmentForm.scheduleEventSeriesId}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, scheduleEventSeriesId: event.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select an event</option>
                    {visibleEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Tier</span>
                  <select
                    value={assignmentForm.sponsorTierId}
                    onChange={(event) => setAssignmentForm((current) => ({ ...current, sponsorTierId: event.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">No tier</option>
                    {visibleTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Notes</span>
                  <textarea value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }} />
                </label>
                <div style={actionRowStyle}>
                  <button type="button" onClick={() => void saveAssignment()} style={primaryButtonStyle} disabled={savingAssignment}>
                    {savingAssignment ? "Saving…" : selectedAssignment ? "Update Assignment" : "Create Assignment"}
                  </button>
                  {selectedAssignment ? (
                    <button type="button" onClick={() => void deleteAssignment()} style={secondaryButtonStyle} disabled={savingAssignment}>
                      Delete Assignment
                    </button>
                  ) : null}
                </div>
                {!selectedAssignment ? (
                  <div style={subtleTextStyle}>
                    Sponsor assignments are event-level only in v1. Timeslot/location scheduling for sponsors is intentionally not part of this model.
                  </div>
                ) : (
                  <div style={paragraphStyle}>
                    Editing assignment for <strong>{selectedAssignment.sponsorDisplayName}</strong> on <strong>{selectedAssignment.eventSeriesName}</strong>.
                  </div>
                )}
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx);
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
