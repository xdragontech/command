import { ParticipantRequirementType, ScheduleParticipantType } from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { PartnerDiscrepancyRecord } from "@command/core-partners";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  errorStyle,
  mutedPanelStyle,
  primaryButtonStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
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

const STATE_OPTIONS = ["ALL", "MISSING", "PENDING_REVIEW", "REJECTED", "EXPIRED"] as const;

export default function PartnerDiscrepanciesPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [discrepancies, setDiscrepancies] = useState<PartnerDiscrepancyRecord[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [participantTypeFilter, setParticipantTypeFilter] = useState("ALL");
  const [requirementTypeFilter, setRequirementTypeFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (brandFilter !== "ALL") params.set("brandId", brandFilter);
      if (eventFilter !== "ALL") params.set("eventSeriesId", eventFilter);
      if (participantTypeFilter !== "ALL") params.set("participantType", participantTypeFilter);
      if (requirementTypeFilter !== "ALL") params.set("requirementType", requirementTypeFilter);
      if (stateFilter !== "ALL") params.set("state", stateFilter);
      if (search.trim()) params.set("q", search.trim());

      const [brandsRes, eventsRes, discrepanciesRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch("/api/admin/scheduling/series"),
        fetch(`/api/admin/partners/discrepancies?${params.toString()}`),
      ]);
      const [brandsPayload, eventsPayload, discrepanciesPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        eventsRes.json().catch(() => null),
        discrepanciesRes.json().catch(() => null),
      ]);
      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!eventsRes.ok || !eventsPayload?.ok) throw new Error(eventsPayload?.error || "Failed to load events");
      if (!discrepanciesRes.ok || !discrepanciesPayload?.ok) {
        throw new Error(discrepanciesPayload?.error || "Failed to load discrepancies");
      }

      setBrands(Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : []);
      setEvents(
        Array.isArray(eventsPayload.serieses)
          ? (eventsPayload.serieses as Array<{ id: string; brandId: string; name: string }>).map((entry) => ({
              id: entry.id,
              brandId: entry.brandId,
              name: entry.name,
            }))
          : []
      );
      setDiscrepancies(Array.isArray(discrepanciesPayload.discrepancies) ? (discrepanciesPayload.discrepancies as PartnerDiscrepancyRecord[]) : []);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load discrepancies");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [brandFilter, eventFilter, participantTypeFilter, requirementTypeFilter, stateFilter]);

  const visibleEvents = useMemo(() => {
    return events.filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter));
  }, [brandFilter, events]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return discrepancies;
    return discrepancies.filter((entry) =>
      [
        entry.partnerDisplayName,
        entry.partnerEmail,
        entry.brandName,
        entry.participantType,
        entry.requirementType,
        entry.state,
        entry.eventSeriesNames.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [discrepancies, search]);

  return (
    <AdminLayout
      title="Command Admin — Event Mgmt / Discrepancies"
      sectionLabel="Event Mgmt / Discrepancies"
      loggedInAs={loggedInAs}
      active="scheduling"
      role={principalRole}
      brands={principalBrands}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={mutedPanelStyle}>
          Entertainment partners do not have defined post-approval document requirements in v1. The discrepancy engine is structured so those requirements can be added later without changing the report surface.
        </div>

        <div style={schedulingFilterCardStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ fontSize: "1rem", color: "var(--admin-text-primary)" }}>Outstanding Requirements</strong>
            <span style={subtleTextStyle}>Missing, unreviewed, rejected, or expired participant requirements across approved applications.</span>
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
              <span>Participant Type</span>
              <select value={participantTypeFilter} onChange={(event) => setParticipantTypeFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All participant types</option>
                <option value={ScheduleParticipantType.ENTERTAINMENT}>Entertainment</option>
                <option value={ScheduleParticipantType.FOOD_VENDOR}>Food Vendor</option>
                <option value={ScheduleParticipantType.MARKET_VENDOR}>Market Vendor</option>
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>Requirement</span>
              <select value={requirementTypeFilter} onChange={(event) => setRequirementTypeFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All requirements</option>
                {Object.values(ParticipantRequirementType).map((requirementType) => (
                  <option key={requirementType} value={requirementType}>
                    {requirementType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label style={schedulingFilterFieldStyle}>
              <span>State</span>
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} style={schedulingFilterControlStyle}>
                {STATE_OPTIONS.map((state) => (
                  <option key={state} value={state}>
                    {state.replaceAll("_", " ")}
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
              <button type="button" onClick={() => void loadData()} style={primaryButtonStyle}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}
        {notice ? <div style={successStyle}>{notice}</div> : null}

        <AdminCard title="Discrepancy Report" description={loading ? "Loading…" : `${filteredRows.length} outstanding discrepancy${filteredRows.length === 1 ? "" : "ies"}`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
              <thead>
                <tr>
                  {["Partner", "Type", "Requirement", "State", "File", "Expires", "Events"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "12px 10px",
                        borderBottom: "1px solid var(--admin-border-subtle)",
                        color: "var(--admin-text-secondary)",
                        fontSize: "0.78rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "20px 10px", color: "var(--admin-text-muted)" }}>
                      No outstanding discrepancies match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={`${row.partnerProfileId}:${row.requirementType}`}>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-primary)" }}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <strong>{row.partnerDisplayName}</strong>
                          <span style={{ color: "var(--admin-text-muted)" }}>{row.partnerEmail}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-secondary)" }}>
                        {row.participantType.replaceAll("_", " ")}
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-primary)" }}>
                        {row.requirementType.replaceAll("_", " ")}
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-primary)" }}>
                        {row.state.replaceAll("_", " ")}
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-secondary)" }}>
                        {row.assetFileName || "No file uploaded"}
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-secondary)" }}>
                        {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "No expiry"}
                      </td>
                      <td style={{ padding: "14px 10px", borderBottom: "1px solid var(--admin-border-subtle)", color: "var(--admin-text-secondary)" }}>
                        {row.eventSeriesNames.join(", ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
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
