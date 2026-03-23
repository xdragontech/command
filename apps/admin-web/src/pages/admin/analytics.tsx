import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { requireBackofficePage } from "../../server/backofficeAuth";

type AnalyticsPayload = {
  ok: true;
  totals: {
    total: number;
    contact: number;
    chat: number;
  };
  last7d: {
    total: number;
    contact: number;
    chat: number;
  };
  brandBreakdown: Array<{
    brandId: string | null;
    brandKey: string | null;
    brandName: string | null;
    total: number;
    contact: number;
    chat: number;
  }>;
  updatedAt: string;
};

type AnalyticsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function AnalyticsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/analytics");
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to load analytics");
      }
      setData(payload as AnalyticsPayload);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminLayout
      title="Command Admin — Analytics"
      sectionLabel="Analytics"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="analytics"
    >
      <AdminCard
        title="Analytics"
        description="High-level lead analytics based on the same lead-event stream used by dashboard and leads."
        actions={
          <button type="button" onClick={load} disabled={loading} style={primaryButtonStyle}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          {role !== "SUPERADMIN" ? (
            <div style={readOnlyNoticeStyle}>
              This view is read-only and automatically scoped to the brands assigned to this staff account.
            </div>
          ) : null}

          {error ? <div style={errorStyle}>{error}</div> : null}

          <div
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            }}
          >
            <StatCard
              label="Total Leads"
              value={data ? formatCount(data.totals.total) : "—"}
              hint="Distinct lead contacts across all recorded events in scope."
            />
            <StatCard
              label="Contact Leads"
              value={data ? formatCount(data.totals.contact) : "—"}
              hint="Distinct website contact submissions."
            />
            <StatCard
              label="Chat Leads"
              value={data ? formatCount(data.totals.chat) : "—"}
              hint="Distinct chat conversations."
            />
            <StatCard
              label="Last 7 Days"
              value={data ? formatCount(data.last7d.total) : "—"}
              hint={
                data
                  ? `Contact: ${formatCount(data.last7d.contact)} • Chat: ${formatCount(data.last7d.chat)}`
                  : "Distinct contacts created in the last 7 days."
              }
            />
          </div>

          <div style={notesPanelStyle}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Notes</div>
            <ul style={notesListStyle}>
              <li>Counts use deduped lead contacts, not raw event totals.</li>
              <li>Brand boundaries are part of the dedupe key, so the same email on different brands stays distinct.</li>
              <li>Last updated: {data ? new Date(data.updatedAt).toLocaleString() : "—"}</li>
            </ul>
          </div>
        </div>
      </AdminCard>

      <AdminCard
        title="Brand Breakdown"
        description="Lead totals grouped by brand using the same deduped contact rules as the headline cards."
      >
        <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid rgba(148,163,184,0.24)" }}>
          <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
                <th style={tableHeaderStyle}>Brand</th>
                <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Total</th>
                <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Contact</th>
                <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Chat</th>
              </tr>
            </thead>
            <tbody>
              {data?.brandBreakdown?.length ? (
                data.brandBreakdown.map((row) => (
                  <tr key={row.brandId || row.brandKey || "unscoped"} style={{ borderTop: "1px solid rgba(226,232,240,0.95)" }}>
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.brandName || "Unscoped"}</div>
                      <div style={{ color: "#64748b", fontSize: "0.82rem" }}>{row.brandKey || "No brand key"}</div>
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 700 }}>{formatCount(row.total)}</td>
                    <td style={{ ...tableCellStyle, textAlign: "right" }}>{formatCount(row.contact)}</td>
                    <td style={{ ...tableCellStyle, textAlign: "right" }}>{formatCount(row.chat)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: "28px 18px", textAlign: "center", color: "#64748b" }}>
                    No analytics data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<AnalyticsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/analytics",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.24)",
        background: "rgba(255,255,255,0.95)",
        padding: "18px",
      }}
    >
      <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" }}>{label}</div>
      <div style={{ marginTop: "10px", fontSize: "2rem", lineHeight: 1, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      {hint ? <div style={{ marginTop: "10px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.55 }}>{hint}</div> : null}
    </div>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

const primaryButtonStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
  padding: "10px 14px",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};

const tableHeaderStyle: CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const tableCellStyle: CSSProperties = {
  padding: "13px 14px",
  fontSize: "0.94rem",
  color: "#0f172a",
  verticalAlign: "top",
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(254,242,242,0.94)",
  color: "#991b1b",
  padding: "14px 16px",
  fontSize: "0.95rem",
};

const readOnlyNoticeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  color: "#334155",
  padding: "14px 16px",
  fontSize: "0.94rem",
};

const notesPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  padding: "16px 18px",
};

const notesListStyle: CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: "18px",
  color: "#475569",
  lineHeight: 1.7,
  fontSize: "0.92rem",
};
