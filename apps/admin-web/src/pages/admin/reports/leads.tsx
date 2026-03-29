import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  errorStyle as sharedErrorStyle,
  panelStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
} from "../../../components/adminScheduling";
import { formatAdminDateTime } from "../../../lib/adminDates";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type AnalyticsPayload = {
  ok: true;
  totals: {
    total: number;
    contact: number;
    chat: number;
  };
  timeline: Array<{
    date: string;
    label: string;
    total: number;
    contact: number;
    chat: number;
  }>;
  brandBreakdown: Array<{
    brandId: string | null;
    brandKey: string | null;
    brandName: string | null;
    total: number;
    contact: number;
    chat: number;
  }>;
  brandOptions: Array<{
    brandId: string;
    brandKey: string | null;
    brandName: string | null;
  }>;
  range: {
    from: string;
    to: string;
  };
  attribution: {
    totals: {
      total: number;
      contact: number;
      chat: number;
    };
    sourceBreakdown: Array<{
      sourceCategory: string;
      sourcePlatform: string | null;
      total: number;
      contact: number;
      chat: number;
    }>;
    landingPages: Array<{
      path: string;
      total: number;
      contact: number;
      chat: number;
    }>;
    referrerPlatforms: Array<{
      platform: string;
      total: number;
      contact: number;
      chat: number;
    }>;
  };
  attributionCoverage: number;
  updatedAt: string;
};

type ReportsLeadsProps = {
  principal: string;
  role: string;
  brands: string[];
};

type AnalyticsChartPoint = AnalyticsPayload["timeline"][number];
type AnalyticsMetricKey = "total" | "contact" | "chat";

const ALL_BRANDS = "ALL";

export default function ReportsLeadsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const defaultRange = useMemo(createDefaultRange, []);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(options?: {
    nextBrandFilter?: string;
    nextFrom?: string;
    nextTo?: string;
  }) {
    const nextBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const nextFrom = options?.nextFrom ?? from;
    const nextTo = options?.nextTo ?? to;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (nextBrandFilter !== ALL_BRANDS) params.set("brandId", nextBrandFilter);
      params.set("from", nextFrom);
      params.set("to", nextTo);

      const response = await fetch(`/api/admin/reports/leads?${params.toString()}`);
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
    void load({
      nextBrandFilter: ALL_BRANDS,
      nextFrom: defaultRange.from,
      nextTo: defaultRange.to,
    });
  }, [defaultRange.from, defaultRange.to]);

  function handleBrandChange(nextBrandFilter: string) {
    setBrandFilter(nextBrandFilter);
    void load({
      nextBrandFilter,
      nextFrom: from,
      nextTo: to,
    });
  }

  function handleFromChange(nextFrom: string) {
    const nextTo = nextFrom > to ? nextFrom : to;
    setFrom(nextFrom);
    setTo(nextTo);
    void load({
      nextBrandFilter: brandFilter,
      nextFrom,
      nextTo,
    });
  }

  function handleToChange(nextTo: string) {
    const nextFrom = nextTo < from ? nextTo : from;
    setFrom(nextFrom);
    setTo(nextTo);
    void load({
      nextBrandFilter: brandFilter,
      nextFrom,
      nextTo,
    });
  }

  const chartPoints = data?.timeline || [];

  return (
    <AdminLayout
      title="Command Admin — Reports / Leads"
      sectionLabel="Reports / Leads"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="reports"
    >
      <AdminCard
        title="Leads"
        actions={
          <div style={cardActionsStyle}>
            <button type="button" onClick={() => void load()} disabled={loading} style={primaryButtonStyle}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div style={analyticsFilterCardStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span style={filterLabelStyle}>Brand</span>
              <select value={brandFilter} onChange={(event) => handleBrandChange(event.target.value)} style={schedulingFilterControlStyle}>
                <option value={ALL_BRANDS}>All Brands</option>
                {(data?.brandOptions || []).map((brand) => (
                  <option key={brand.brandId} value={brand.brandId}>
                    {brand.brandName || brand.brandKey || "Unnamed Brand"}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={filterLabelStyle}>From</span>
              <input type="date" value={from} onChange={(event) => handleFromChange(event.target.value)} style={schedulingFilterControlStyle} />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={filterLabelStyle}>To</span>
              <input type="date" value={to} onChange={(event) => handleToChange(event.target.value)} style={schedulingFilterControlStyle} />
            </label>
          </div>

          {role !== "SUPERADMIN" ? (
            <div style={readOnlyNoticeStyle}>
              This view is read-only and automatically scoped to the brands assigned to this staff account.
            </div>
          ) : null}

          {error ? <div style={errorStyle}>{error}</div> : null}

          <section style={panelStyle}>
            <div style={{ display: "grid", gap: "18px" }}>
              <LeadTrendChart points={chartPoints} />
              <div style={lastUpdatedStyle}>Last updated: {data ? formatAdminDateTime(data.updatedAt) : "—"}</div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Brand Breakdown</div>
            <div style={{ overflowX: "auto", marginTop: "14px", borderRadius: "12px", border: "1px solid rgba(148,163,184,0.24)" }}>
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
                        No analytics data found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={sectionTitleStyle}>Website Attribution</div>
              <div style={attributionNoticeStyle}>
                Attribution below is consented-session analytics only. Operational lead totals above may be higher when visitors did not grant analytics consent.
              </div>
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                }}
              >
                <AttributionSummaryCard label="Operational Leads" value={formatCount(data?.totals.total || 0)} tone="slate" />
                <AttributionSummaryCard label="Attributed Leads" value={formatCount(data?.attribution.totals.total || 0)} tone="red" />
                <AttributionSummaryCard label="Coverage" value={formatPercent(data?.attributionCoverage || 0)} tone="amber" />
              </div>
            </div>

            <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
              <div>
                <div style={subsectionTitleStyle}>By Source</div>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
                        <th style={tableHeaderStyle}>Source</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Total</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Contact</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Chat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.attribution?.sourceBreakdown?.length ? (
                        data.attribution.sourceBreakdown.map((row) => (
                          <tr key={`${row.sourceCategory}:${row.sourcePlatform || ""}`} style={tableBodyRowStyle}>
                            <td style={tableCellStyle}>
                              <div style={{ fontWeight: 700, color: "#0f172a" }}>
                                {formatSourceLabel(row.sourceCategory, row.sourcePlatform)}
                              </div>
                              <div style={subTextStyle}>{row.sourceCategory}</div>
                            </td>
                            <td style={tableCellNumericStyle}>{formatCount(row.total)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.contact)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.chat)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={emptyTableCellStyle}>
                            No consent-attributed leads were found for the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={subsectionTitleStyle}>By Landing Page</div>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
                        <th style={tableHeaderStyle}>Landing Page</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Total</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Contact</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Chat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.attribution?.landingPages?.length ? (
                        data.attribution.landingPages.map((row) => (
                          <tr key={row.path} style={tableBodyRowStyle}>
                            <td style={tableCellStyle}>
                              <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{row.path}</div>
                            </td>
                            <td style={tableCellNumericStyle}>{formatCount(row.total)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.contact)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.chat)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={emptyTableCellStyle}>
                            No attributed landing-page data was found for the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={subsectionTitleStyle}>By Referrer Platform</div>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
                        <th style={tableHeaderStyle}>Platform</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Total</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Contact</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Chat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.attribution?.referrerPlatforms?.length ? (
                        data.attribution.referrerPlatforms.map((row) => (
                          <tr key={row.platform} style={tableBodyRowStyle}>
                            <td style={tableCellStyle}>
                              <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.platform}</div>
                            </td>
                            <td style={tableCellNumericStyle}>{formatCount(row.total)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.contact)}</td>
                            <td style={tableCellNumericStyle}>{formatCount(row.chat)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} style={emptyTableCellStyle}>
                            No attributed referrer-platform data was found for the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ReportsLeadsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/reports/leads",
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

function LeadTrendChart({ points }: { points: AnalyticsChartPoint[] }) {
  const width = 920;
  const height = 260;
  const totalPath = buildLinePath(points, "total", width, height);
  const contactPath = buildLinePath(points, "contact", width, height);
  const chatPath = buildLinePath(points, "chat", width, height);
  const axisLabels = buildAxisLabels(points);

  if (!points.length || points.every((point) => point.total === 0 && point.contact === 0 && point.chat === 0)) {
    return <div style={emptyStateStyle}>No lead activity was found for the selected filters.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={legendRowStyle}>
        <Legend label="Total Leads" color="#b91c1c" />
        <Legend label="Contact Leads" color="var(--admin-text-primary)" />
        <Legend label="Chat Leads" color="var(--admin-success-text)" />
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          height: "260px",
          borderRadius: "12px",
          border: "1px solid var(--admin-border-subtle)",
          background: "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
        }}
      >
        <path d={contactPath} fill="none" stroke="var(--admin-text-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d={chatPath} fill="none" stroke="var(--admin-success-text)" strokeWidth="3" strokeLinecap="round" />
        <path d={totalPath} fill="none" stroke="#b91c1c" strokeWidth="3.5" strokeLinecap="round" />
      </svg>

      <div style={axisLabelRowStyle}>
        {axisLabels.map((point) => (
          <div key={point.date} style={{ textAlign: "center" }}>
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span style={legendStyle}>
      <span style={{ ...legendDotStyle, background: color }} />
      {label}
    </span>
  );
}

function buildLinePath(points: AnalyticsChartPoint[], key: AnalyticsMetricKey, width: number, height: number, pad = 18) {
  if (!points.length) return "";

  const maxValue = Math.max(1, ...points.map((point) => point.total), ...points.map((point) => point.contact), ...points.map((point) => point.chat));
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;

  const xFor = (index: number) => pad + (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / Math.max(points.length - 1, 1));
  const yFor = (value: number) => pad + innerHeight - (innerHeight * value) / maxValue;

  return points
    .map((point, index) => {
      const x = xFor(index);
      const y = yFor(point[key]);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAxisLabels(points: AnalyticsChartPoint[]) {
  if (points.length <= 7) return points;

  const lastIndex = points.length - 1;
  const indexes = new Set<number>();
  for (let step = 0; step < 7; step += 1) {
    indexes.add(Math.round((lastIndex * step) / 6));
  }

  return points.filter((_, index) => indexes.has(index));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSourceLabel(category: string, platform: string | null) {
  const categoryLabel = category
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (!platform) return categoryLabel;
  return `${platform} (${categoryLabel})`;
}

function createDefaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    from: start.toISOString().slice(0, 10),
    to,
  };
}

function AttributionSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "slate" | "amber";
}) {
  const palette =
    tone === "amber"
      ? { bg: "var(--admin-warning-bg)", border: "var(--admin-warning-border)", value: "var(--admin-warning-text)" }
      : tone === "slate"
        ? { bg: "var(--admin-surface-secondary)", border: "var(--admin-border-subtle)", value: "var(--admin-text-primary)" }
        : { bg: "var(--admin-error-bg)", border: "var(--admin-error-border)", value: "#b91c1c" };

  return (
    <div
      style={{
        borderRadius: "12px",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        padding: "10px 12px",
      }}
    >
      <div style={summaryLabelStyle}>{label}</div>
      <div style={{ marginTop: "4px", fontSize: "1.15rem", fontWeight: 800, color: palette.value }}>{value}</div>
    </div>
  );
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

const cardActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const analyticsFilterCardStyle: CSSProperties = {
  ...schedulingFilterCardStyle,
  gap: "12px",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

const filterLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: "var(--admin-text-secondary)",
  fontSize: "0.82rem",
};

const legendRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "14px",
  color: "var(--admin-text-secondary)",
  fontSize: "0.9rem",
};

const legendStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

const legendDotStyle: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "999px",
};

const axisLabelRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: "8px",
  color: "var(--admin-text-muted)",
  fontSize: "0.78rem",
};

const lastUpdatedStyle: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: "0.84rem",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 800,
  color: "var(--admin-text-primary)",
};

const subsectionTitleStyle: CSSProperties = {
  fontSize: "0.94rem",
  fontWeight: 800,
  color: "var(--admin-text-primary)",
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

const tableCellNumericStyle: CSSProperties = {
  ...tableCellStyle,
  textAlign: "right",
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  marginTop: "14px",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "760px",
  borderCollapse: "collapse",
};

const tableBodyRowStyle: CSSProperties = {
  borderTop: "1px solid rgba(226,232,240,0.95)",
};

const errorStyle: CSSProperties = sharedErrorStyle;

const readOnlyNoticeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  color: "#334155",
  padding: "14px 16px",
  fontSize: "0.94rem",
};

const summaryLabelStyle: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: "0.62rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const emptyStateStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px dashed var(--admin-muted-border)",
  background: "var(--admin-muted-bg)",
  color: "var(--admin-muted-text)",
  padding: "24px 18px",
  fontSize: "0.94rem",
  textAlign: "center",
};

const emptyTableCellStyle: CSSProperties = {
  padding: "28px 18px",
  textAlign: "center",
  color: "#64748b",
};

const subTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.82rem",
};

const attributionNoticeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  color: "#334155",
  padding: "14px 16px",
  fontSize: "0.94rem",
  lineHeight: 1.6,
};
