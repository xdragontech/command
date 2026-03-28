import type { ScheduleConflictRecord } from "@command/core-scheduling";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  TonePill,
  actionRowStyle,
  errorStyle,
  fieldStyle,
  formatDateOnly,
  inputStyle,
  mutedPanelStyle,
  panelStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
  secondaryButtonStyle,
  subtleTextStyle,
  successStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableStyle,
  tableWrapStyle,
  threeColumnStyle,
  twoColumnStyle,
  warningStyle,
} from "../../../components/adminScheduling";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

export default function SchedulingConflictsPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [conflicts, setConflicts] = useState<ScheduleConflictRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(options?: {
    nextBrandFilter?: string;
    nextFrom?: string;
    nextTo?: string;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedFrom = options?.nextFrom ?? from;
    const resolvedTo = options?.nextTo ?? to;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") params.set("brandId", resolvedBrandFilter);
      if (resolvedFrom) params.set("from", resolvedFrom);
      if (resolvedTo) params.set("to", resolvedTo);

      const [brandsRes, conflictsRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/scheduling/conflicts?${params.toString()}`),
      ]);

      const [brandsPayload, conflictsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        conflictsRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!conflictsRes.ok || !conflictsPayload?.ok) {
        throw new Error(conflictsPayload?.error || "Failed to load conflicts");
      }

      setBrands(Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : []);
      setConflicts(Array.isArray(conflictsPayload.conflicts) ? (conflictsPayload.conflicts as ScheduleConflictRecord[]) : []);
      setNotice("");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load conflicts");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredConflicts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conflicts;
    return conflicts.filter((conflict) =>
      [
        conflict.type,
        conflict.occursOn,
        conflict.seriesName,
        conflict.resourceNames.join(" "),
        conflict.participantNames.join(" "),
        conflict.message,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [conflicts, search]);

  const resourceConflictCount = filteredConflicts.filter((conflict) => conflict.type === "RESOURCE_DOUBLE_BOOKED").length;
  const participantConflictCount = filteredConflicts.filter((conflict) => conflict.type === "PARTICIPANT_DOUBLE_BOOKED").length;

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Conflicts"
      sectionLabel="Scheduling / Conflicts"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Schedule Conflicts"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData()} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      >
        <div style={schedulingFilterCardStyle}>
          <div style={schedulingFilterGridStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conflict details..."
                style={schedulingFilterControlStyle}
              />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand Filter</span>
              <select
                value={brandFilter}
                onChange={(event) => setBrandFilter(event.target.value)}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={schedulingFilterControlStyle} />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} style={schedulingFilterControlStyle} />
            </label>
          </div>
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}

        <div style={{ ...threeColumnStyle, marginTop: "18px" }}>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Visible Conflicts</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "var(--admin-text-primary)" }}>{filteredConflicts.length}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Resource Double-Bookings</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "#991b1b" }}>{resourceConflictCount}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Participant Double-Bookings</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "#991b1b" }}>{participantConflictCount}</div>
          </div>
        </div>

        <div style={{ ...tableWrapStyle, marginTop: "18px" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={tableHeadCellStyle}>Date</th>
                <th style={tableHeadCellStyle}>Type</th>
                <th style={tableHeadCellStyle}>Series</th>
                <th style={tableHeadCellStyle}>Resources</th>
                <th style={tableHeadCellStyle}>Participants</th>
                <th style={tableHeadCellStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={tableCellStyle}>
                    Loading conflict report...
                  </td>
                </tr>
              ) : filteredConflicts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={tableCellStyle}>
                    <div style={mutedPanelStyle}>No conflicts matched the current filter.</div>
                  </td>
                </tr>
              ) : (
                filteredConflicts.map((conflict) => (
                  <tr key={`${conflict.type}:${conflict.assignmentIds.join(":")}`}>
                    <td style={tableCellStyle}>{formatDateOnly(conflict.occursOn)}</td>
                    <td style={tableCellStyle}>
                      <TonePill
                        label={conflict.type === "RESOURCE_DOUBLE_BOOKED" ? "Resource" : "Participant"}
                        tone="danger"
                      />
                    </td>
                    <td style={tableCellStyle}>{conflict.seriesName}</td>
                    <td style={tableCellStyle}>{conflict.resourceNames.join(", ")}</td>
                    <td style={tableCellStyle}>{conflict.participantNames.join(", ")}</td>
                    <td style={tableCellStyle}>{conflict.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ ...warningStyle, marginTop: "18px" }}>
          This report exists because overlaps must be identified before the calendar UI arrives. The backend remains the source of truth for schedule integrity either way.
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/conflicts" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
