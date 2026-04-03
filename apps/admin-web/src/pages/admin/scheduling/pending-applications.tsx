import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import { PartnerApplicationStatus, PartnerKind } from "@prisma/client";
import type { PartnerApplicationRecord } from "@command/core-partners";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  SchedulingListRow,
  TonePill,
  actionRowStyle,
  detailHeaderStyle,
  detailTitleStyle,
  errorStyle,
  fieldStyle,
  formatDateOnly,
  formatDateTime,
  inputStyle,
  labelStyle,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
  textAreaStyle,
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

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending only" },
  { value: "ALL", label: "All statuses" },
  { value: PartnerApplicationStatus.SUBMITTED, label: "Submitted" },
  { value: PartnerApplicationStatus.IN_REVIEW, label: "In Review" },
  { value: PartnerApplicationStatus.APPROVED, label: "Approved" },
  { value: PartnerApplicationStatus.REJECTED, label: "Rejected" },
  { value: PartnerApplicationStatus.WITHDRAWN, label: "Withdrawn" },
];

function applicationTone(status: PartnerApplicationStatus) {
  if (status === PartnerApplicationStatus.APPROVED) return "success" as const;
  if (status === PartnerApplicationStatus.REJECTED || status === PartnerApplicationStatus.WITHDRAWN) return "danger" as const;
  if (status === PartnerApplicationStatus.IN_REVIEW) return "warning" as const;
  return "slate" as const;
}

export default function PendingApplicationsPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [applications, setApplications] = useState<PartnerApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<"MARK_IN_REVIEW" | "APPROVE" | "REJECT" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(nextSelectedId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (brandFilter !== "ALL") params.set("brandId", brandFilter);
      if (eventFilter !== "ALL") params.set("eventSeriesId", eventFilter);
      if (kindFilter !== "ALL") params.set("kind", kindFilter);
      if (statusFilter === "PENDING") {
        params.set("pendingOnly", "true");
      } else if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (search.trim()) params.set("q", search.trim());

      const [brandsRes, eventsRes, appsRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch("/api/admin/scheduling/series"),
        fetch(`/api/admin/partners/applications?${params.toString()}`),
      ]);
      const [brandsPayload, eventsPayload, appsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        eventsRes.json().catch(() => null),
        appsRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!eventsRes.ok || !eventsPayload?.ok) throw new Error(eventsPayload?.error || "Failed to load events");
      if (!appsRes.ok || !appsPayload?.ok) throw new Error(appsPayload?.error || "Failed to load applications");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextEvents = Array.isArray(eventsPayload.serieses)
        ? (eventsPayload.serieses as Array<{ id: string; brandId: string; name: string }>).map((entry) => ({
            id: entry.id,
            brandId: entry.brandId,
            name: entry.name,
          }))
        : [];
      const nextApplications = Array.isArray(appsPayload.applications)
        ? (appsPayload.applications as PartnerApplicationRecord[])
        : [];

      setBrands(nextBrands);
      setEvents(nextEvents);
      setApplications(nextApplications);

      const nextSelected =
        (nextSelectedId && nextApplications.find((entry) => entry.id === nextSelectedId)) || nextApplications[0] || null;
      setSelectedId(nextSelected?.id || null);
      setReviewNotes("");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load partner applications");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [brandFilter, eventFilter, kindFilter, statusFilter]);

  const visibleEvents = useMemo(() => {
    return events.filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter));
  }, [brandFilter, events]);

  const filteredApplications = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return applications;
    return applications.filter((application) =>
      [
        application.partnerDisplayName,
        application.partnerEmail,
        application.partnerContactName,
        application.eventSeriesName,
        application.brandName,
        application.status,
        application.applicationKind,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [applications, search]);

  const selectedApplication = selectedId ? applications.find((entry) => entry.id === selectedId) || null : null;

  async function submitReview(decision: "MARK_IN_REVIEW" | "APPROVE" | "REJECT") {
    if (!selectedApplication) return;
    setReviewing(decision);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/applications/${selectedApplication.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          notes: reviewNotes,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to review partner application");
      await loadData(selectedApplication.id);
      setNotice(
        decision === "APPROVE"
          ? "Application approved."
          : decision === "REJECT"
            ? "Application rejected."
            : "Application moved into review."
      );
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to review partner application");
      setNotice("");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Event Mgmt / Pending Applications"
      sectionLabel="Event Mgmt / Pending Applications"
      loggedInAs={loggedInAs}
      active="scheduling"
      role={principalRole}
      brands={principalBrands}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={schedulingFilterCardStyle}>
          <div style={detailHeaderStyle}>
            <div>
              <div style={detailTitleStyle}>Pending Applications</div>
              <div style={subtleTextStyle}>Review partner applications by brand, event, and status. Approval enables scheduling eligibility only.</div>
            </div>
          </div>
          <div style={schedulingFilterGridStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span>Brand</span>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>Event</span>
              <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All events</option>
                {visibleEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>Kind</span>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All kinds</option>
                <option value={PartnerKind.PARTICIPANT}>Participant</option>
                <option value={PartnerKind.SPONSOR}>Sponsor</option>
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={schedulingFilterControlStyle}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} style={schedulingFilterControlStyle} placeholder="Partner, email, or event" />
            </label>
            <div style={{ ...schedulingFilterFieldStyle, justifyContent: "end" }}>
              <span>&nbsp;</span>
              <button type="button" onClick={() => void loadData(selectedId)} style={primaryButtonStyle}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}
        {notice ? <div style={successStyle}>{notice}</div> : null}

        <div style={splitLayoutStyle}>
          <div style={panelStyle}>
            <div style={{ display: "grid", gap: "12px" }}>
              {loading ? (
                <div style={subtleTextStyle}>Loading applications…</div>
              ) : filteredApplications.length === 0 ? (
                <div style={subtleTextStyle}>No applications match the current filters.</div>
              ) : (
                filteredApplications.map((application) => (
                  <SchedulingListRow
                    key={application.id}
                    selected={application.id === selectedId}
                    onClick={() => setSelectedId(application.id)}
                    topLeft={
                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong>{application.partnerDisplayName}</strong>
                        <span style={subtleTextStyle}>
                          {application.eventSeriesName} · {application.brandName}
                        </span>
                      </div>
                    }
                    topRight={<TonePill label={application.status.replaceAll("_", " ")} tone={applicationTone(application.status)} />}
                    bottomLeft={`${application.applicationKind} · ${application.partnerEmail}`}
                    bottomRight={application.submittedAt ? `Submitted ${formatDateOnly(application.submittedAt)}` : `Created ${formatDateOnly(application.createdAt)}`}
                  />
                ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "18px" }}>
            <AdminCard
              title={selectedApplication ? selectedApplication.partnerDisplayName : "Application Details"}
              description={selectedApplication ? `${selectedApplication.eventSeriesName} · ${selectedApplication.partnerEmail}` : "Select an application"}
            >
              {!selectedApplication ? (
                <div style={subtleTextStyle}>Select an application from the list to inspect and review it.</div>
              ) : (
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Kind / Status</span>
                      <div style={paragraphStyle}>{selectedApplication.applicationKind} · {selectedApplication.status}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Submitted</span>
                      <div style={paragraphStyle}>{selectedApplication.submittedAt ? formatDateTime(selectedApplication.submittedAt) : "Not submitted yet"}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Partner Contact</span>
                      <div style={paragraphStyle}>{selectedApplication.partnerContactName}</div>
                      <div style={subtleTextStyle}>{selectedApplication.partnerContactPhone}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Subtype</span>
                      <div style={paragraphStyle}>
                        {selectedApplication.participantType?.replaceAll("_", " ") ||
                          selectedApplication.sponsorProductServiceType ||
                          "Subtype not set"}
                      </div>
                      {selectedApplication.sponsorType ? <div style={subtleTextStyle}>Sponsor type: {selectedApplication.sponsorType}</div> : null}
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Reviewer Notes</span>
                    <textarea
                      value={reviewNotes}
                      onChange={(event) => setReviewNotes(event.target.value)}
                      style={textAreaStyle}
                      placeholder="Add reviewer notes for the status change"
                    />
                  </div>

                  <div style={actionRowStyle}>
                    <button type="button" onClick={() => void submitReview("MARK_IN_REVIEW")} style={primaryButtonStyle} disabled={reviewing !== null}>
                      {reviewing === "MARK_IN_REVIEW" ? "Saving…" : "Mark In Review"}
                    </button>
                    <button type="button" onClick={() => void submitReview("APPROVE")} style={primaryButtonStyle} disabled={reviewing !== null}>
                      {reviewing === "APPROVE" ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitReview("REJECT")}
                      style={{ ...primaryButtonStyle, background: "#991b1b" }}
                      disabled={reviewing !== null}
                    >
                      {reviewing === "REJECT" ? "Saving…" : "Reject"}
                    </button>
                  </div>
                </div>
              )}
            </AdminCard>

            <AdminCard title="Review History" description="Durable review decisions and notes">
              {!selectedApplication ? (
                <div style={subtleTextStyle}>Select an application to inspect review history.</div>
              ) : selectedApplication.reviews.length === 0 ? (
                <div style={subtleTextStyle}>No review history yet.</div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {selectedApplication.reviews.map((review) => (
                    <div key={review.id} style={panelStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                        <strong>{review.decision.replaceAll("_", " ")}</strong>
                        <span style={subtleTextStyle}>{formatDateTime(review.createdAt)}</span>
                      </div>
                      <div style={{ ...subtleTextStyle, marginTop: "6px" }}>{review.reviewerDisplayName || "System reviewer"}</div>
                      <div style={{ ...paragraphStyle, marginTop: "10px" }}>{review.notes || "No review notes recorded."}</div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>
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
