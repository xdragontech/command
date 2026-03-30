import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type TrafficPayload = {
  ok: true;
  totals: {
    sessions: number;
    engagedSessions: number;
    bouncedSessions: number;
    convertedSessions: number;
    conversionRate: number;
    bounceRate: number;
    averageEngagedSeconds: number;
  };
  timeline: Array<{
    date: string;
    label: string;
    sessions: number;
    engagedSessions: number;
    convertedSessions: number;
  }>;
  sourceBreakdown: Array<{
    sourceCategory: string;
    sourcePlatform: string | null;
    sessions: number;
    engagedSessions: number;
    convertedSessions: number;
    conversionRate: number;
    share: number;
  }>;
  landingPages: Array<{
    path: string;
    sessions: number;
    engagedSessions: number;
    convertedSessions: number;
    conversionRate: number;
    averageEngagedSeconds: number;
  }>;
  performanceMetrics: Array<{
    metricName: string;
    metricSource: "BROWSER" | "PUBLIC_WEBSITE" | "PUBLIC_API";
    routeKey: string | null;
    routeLabel: string | null;
    label: string;
    sampleCount: number;
    averageValue: number;
    p75Value: number;
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
  updatedAt: string;
};

type ReportsTrafficProps = {
  principal: string;
  role: string;
  brands: string[];
};

type TrafficChartPoint = TrafficPayload["timeline"][number];
type TrafficMetricKey = "sessions" | "engagedSessions" | "convertedSessions";

const ALL_BRANDS = "ALL";

export default function ReportsTrafficPage({
  principal,
  role,
  brands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const defaultRange = useMemo(createDefaultRange, []);
  const [data, setData] = useState<TrafficPayload | null>(null);
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

      const response = await fetch(`/api/admin/reports/traffic?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to load traffic report");
      }
      setData(payload as TrafficPayload);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load traffic report");
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
      title="Command Admin — Reports / Traffic"
      sectionLabel="Reports / Traffic"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="reports"
    >
      <AdminCard
        title="Traffic"
        actions={
          <div style={cardActionsStyle}>
            <button type="button" onClick={() => void load()} disabled={loading} style={primaryButtonStyle}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div style={trafficFilterCardStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span style={filterLabelStyle}>Brand</span>
              <select
                value={brandFilter}
                onChange={(event) => handleBrandChange(event.target.value)}
                style={schedulingFilterControlStyle}
              >
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
              <input
                type="date"
                value={from}
                onChange={(event) => handleFromChange(event.target.value)}
                style={schedulingFilterControlStyle}
              />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={filterLabelStyle}>To</span>
              <input
                type="date"
                value={to}
                onChange={(event) => handleToChange(event.target.value)}
                style={schedulingFilterControlStyle}
              />
            </label>
          </div>

          <div style={consentNoticeStyle}>
            Traffic metrics, attribution, bounce rate, engagement, and conversion rate are consented-session analytics only. Operational business events may exist outside this dataset when consent was not granted.
          </div>

          {role !== "SUPERADMIN" ? (
            <div style={readOnlyNoticeStyle}>
              This view is read-only and automatically scoped to the brands assigned to this staff account.
            </div>
          ) : null}

          {error ? <div style={errorStyle}>{error}</div> : null}

          <section style={panelStyle}>
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
                }}
              >
                <TrafficSummaryCard label="Sessions" value={formatCount(data?.totals.sessions || 0)} tone="slate" />
                <TrafficSummaryCard label="Engaged" value={formatCount(data?.totals.engagedSessions || 0)} tone="slate" />
                <TrafficSummaryCard label="Converted" value={formatCount(data?.totals.convertedSessions || 0)} tone="red" />
                <TrafficSummaryCard label="Conv. Rate" value={formatPercent(data?.totals.conversionRate || 0)} tone="red" />
                <TrafficSummaryCard label="Bounce Rate" value={formatPercent(data?.totals.bounceRate || 0)} tone="amber" />
                <TrafficSummaryCard label="Avg Duration" value={formatDuration(data?.totals.averageEngagedSeconds || 0)} tone="amber" />
              </div>

              <TrafficTrendChart points={chartPoints} />
              <div style={lastUpdatedStyle}>Last updated: {data ? formatAdminDateTime(data.updatedAt) : "—"}</div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Source Breakdown</div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeadRowStyle}>
                    <th style={tableHeaderStyle}>Source</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sessions</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Engaged</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Converted</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Conv. Rate</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.sourceBreakdown?.length ? (
                    data.sourceBreakdown.map((row) => (
                      <tr key={`${row.sourceCategory}:${row.sourcePlatform || ""}`} style={tableBodyRowStyle}>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>
                            {formatSourceLabel(row.sourceCategory, row.sourcePlatform)}
                          </div>
                          <div style={subTextStyle}>{row.sourceCategory}</div>
                        </td>
                        <td style={tableCellNumericStyle}>{formatCount(row.sessions)}</td>
                        <td style={tableCellNumericStyle}>{formatCount(row.engagedSessions)}</td>
                        <td style={tableCellNumericStyle}>{formatCount(row.convertedSessions)}</td>
                        <td style={tableCellNumericStyle}>{formatPercent(row.conversionRate)}</td>
                        <td style={tableCellNumericStyle}>{formatPercent(row.share)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={emptyTableCellStyle}>
                        No consented traffic sessions were found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Landing Pages</div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeadRowStyle}>
                    <th style={tableHeaderStyle}>Landing Page</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Sessions</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Engaged</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Converted</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Conv. Rate</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.landingPages?.length ? (
                    data.landingPages.map((row) => (
                      <tr key={row.path} style={tableBodyRowStyle}>
                        <td style={tableCellStyle}>
                          <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{row.path}</div>
                        </td>
                        <td style={tableCellNumericStyle}>{formatCount(row.sessions)}</td>
                        <td style={tableCellNumericStyle}>{formatCount(row.engagedSessions)}</td>
                        <td style={tableCellNumericStyle}>{formatCount(row.convertedSessions)}</td>
                        <td style={tableCellNumericStyle}>{formatPercent(row.conversionRate)}</td>
                        <td style={tableCellNumericStyle}>{formatDuration(row.averageEngagedSeconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={emptyTableCellStyle}>
                        No landing-page analytics were found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={sectionTitleStyle}>Performance</div>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeadRowStyle}>
                    <th style={tableHeaderStyle}>Metric</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Samples</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Average</th>
                    <th style={{ ...tableHeaderStyle, textAlign: "right" }}>P75</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.performanceMetrics?.length ? (
                    data.performanceMetrics.map((row) => (
                      <tr key={`${row.metricSource}:${row.metricName}:${row.routeKey || ""}`} style={tableBodyRowStyle}>
                        <td style={tableCellStyle}>
                          <PerformanceMetricLabel metric={row} />
                        </td>
                        <td style={tableCellNumericStyle}>{formatCount(row.sampleCount)}</td>
                        <td style={tableCellNumericStyle}>{formatMetricValue(row.metricName, row.averageValue)}</td>
                        <td style={tableCellNumericStyle}>{formatMetricValue(row.metricName, row.p75Value)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={emptyTableCellStyle}>
                        No performance samples were found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ReportsTrafficProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/reports/traffic",
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

function TrafficTrendChart({ points }: { points: TrafficChartPoint[] }) {
  const width = 920;
  const height = 260;
  const sessionsPath = buildLinePath(points, "sessions", width, height);
  const engagedPath = buildLinePath(points, "engagedSessions", width, height);
  const convertedPath = buildLinePath(points, "convertedSessions", width, height);
  const axisLabels = buildAxisLabels(points);

  if (
    !points.length ||
    points.every(
      (point) =>
        point.sessions === 0 &&
        point.engagedSessions === 0 &&
        point.convertedSessions === 0
    )
  ) {
    return <div style={emptyStateStyle}>No consented traffic activity was found for the selected filters.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={legendRowStyle}>
        <Legend label="Sessions" color="var(--admin-text-primary)" />
        <Legend label="Engaged Sessions" color="#2563eb" />
        <Legend label="Converted Sessions" color="#b91c1c" />
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          height: "260px",
          borderRadius: "12px",
          border: "1px solid var(--admin-border-subtle)",
          background:
            "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
        }}
      >
        <path d={sessionsPath} fill="none" stroke="var(--admin-text-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d={engagedPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
        <path d={convertedPath} fill="none" stroke="#b91c1c" strokeWidth="3.5" strokeLinecap="round" />
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

function TrafficSummaryCard({
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

function PerformanceMetricLabel({
  metric,
}: {
  metric: TrafficPayload["performanceMetrics"][number];
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const tooltip = getPerformanceTooltip(metric);
  const tooltipId = `performance-tooltip-${metric.metricSource.toLowerCase()}-${metric.metricName.trim().toLowerCase()}-${metric.routeKey || "global"}`;

  function syncAnchorPosition() {
    if (buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
  }

  useEffect(() => {
    if (!open) return;

    syncAnchorPosition();

    function handleViewportChange() {
      syncAnchorPosition();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  if (!tooltip) {
    return <div style={{ fontWeight: 700, color: "#0f172a" }}>{metric.label}</div>;
  }

  return (
    <div
      style={metricNameWrapStyle}
      onMouseEnter={() => {
        syncAnchorPosition();
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        syncAnchorPosition();
        setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <div style={metricNameRowStyle}>
        <span style={{ fontWeight: 700, color: "#0f172a" }}>{metric.label}</span>
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${metric.label}: ${tooltip}`}
          aria-describedby={tooltipId}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            syncAnchorPosition();
            setOpen(true);
          }}
          style={metricTooltipButtonStyle}
        >
          ?
        </button>
      </div>

      {open && anchorRect ? (
        <div id={tooltipId} role="tooltip" style={buildMetricTooltipPopoverStyle(anchorRect)}>
          {tooltip}
        </div>
      ) : null}
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

function buildLinePath(
  points: TrafficChartPoint[],
  key: TrafficMetricKey,
  width: number,
  height: number,
  pad = 18
) {
  if (!points.length) return "";

  const maxValue = Math.max(
    1,
    ...points.map((point) => point.sessions),
    ...points.map((point) => point.engagedSessions),
    ...points.map((point) => point.convertedSessions)
  );
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;

  const xFor = (index: number) =>
    pad +
    (points.length === 1
      ? innerWidth / 2
      : (innerWidth * index) / Math.max(points.length - 1, 1));
  const yFor = (value: number) => pad + innerHeight - (innerHeight * value) / maxValue;

  return points
    .map((point, index) => {
      const x = xFor(index);
      const y = yFor(point[key]);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAxisLabels(points: TrafficChartPoint[]) {
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

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function formatMetricValue(metricName: string, value: number) {
  if (/cls/i.test(metricName)) return value.toFixed(3);
  if (/db_query_count/i.test(metricName)) return formatCount(Math.round(value));
  if (/lcp|inp|fid|fcp|ttfb|request_ms|server_ms|db_query_ms/i.test(metricName)) return `${Math.round(value)} ms`;
  return value.toFixed(2);
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

function getPerformanceTooltip(metric: TrafficPayload["performanceMetrics"][number]) {
  const normalized = metric.metricName.trim().toUpperCase();

  if (metric.metricSource === "PUBLIC_WEBSITE" && normalized === "REQUEST_MS") {
    return `Public Website ${metric.routeLabel || "request"} request time: total time spent inside the branded website route before it returned the response. Lower is better.`;
  }

  if (metric.metricSource === "PUBLIC_API" && normalized === "REQUEST_MS") {
    return `Public API ${metric.routeLabel || "request"} round-trip time: end-to-end time from the branded website to command/public-api and back. Lower is better.`;
  }

  if (metric.metricSource === "PUBLIC_API" && normalized === "SERVER_MS") {
    return `Public API ${metric.routeLabel || "request"} server time: time spent inside command/public-api handling the request. Lower is better.`;
  }

  if (metric.metricSource === "PUBLIC_API" && normalized === "DB_QUERY_MS") {
    return `Public API ${metric.routeLabel || "request"} DB query time: total Prisma database query time accumulated while handling the request. Lower is better.`;
  }

  if (metric.metricSource === "PUBLIC_API" && normalized === "DB_QUERY_COUNT") {
    return `Public API ${metric.routeLabel || "request"} DB query count: number of Prisma database queries executed while handling the request. Lower is generally better if the response behavior stays correct.`;
  }

  switch (normalized) {
    case "LCP":
      return "Largest Contentful Paint: how long it takes for the main visible page content to render. Lower is better.";
    case "CLS":
      return "Cumulative Layout Shift: how much the page layout moves unexpectedly while loading. Lower is better.";
    case "INP":
      return "Interaction to Next Paint: how quickly the page responds visually after a user interaction. Lower is better.";
    case "FCP":
      return "First Contentful Paint: when the browser first paints visible content on the page. Lower is better.";
    case "TTFB":
      return "Time to First Byte: how quickly the browser receives the first byte from the server. Lower is better.";
    case "FID":
      return "First Input Delay: how long the page waits before it begins handling the first user input. Lower is better.";
    default:
      return null;
  }
}

function buildMetricTooltipPopoverStyle(anchorRect: DOMRect): CSSProperties {
  const popoverWidth = 260;
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const left = Math.min(Math.max(12, anchorRect.left - 6), viewportWidth - popoverWidth - 12);
  const estimatedHeight = 140;
  const shouldRenderAbove =
    anchorRect.bottom + estimatedHeight > viewportHeight && anchorRect.top > estimatedHeight;

  return {
    ...metricTooltipPopoverStyle,
    left,
    top: shouldRenderAbove ? anchorRect.top - 10 : anchorRect.bottom + 10,
    transform: shouldRenderAbove ? "translateY(-100%)" : "none",
  };
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

const trafficFilterCardStyle: CSSProperties = {
  ...schedulingFilterCardStyle,
  gap: "12px",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

const filterLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: "var(--admin-text-secondary)",
  fontSize: "0.82rem",
};

const consentNoticeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  color: "#334155",
  padding: "14px 16px",
  fontSize: "0.94rem",
  lineHeight: 1.6,
};

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

const tableHeadRowStyle: CSSProperties = {
  background: "rgba(248,250,252,0.9)",
  color: "#475569",
};

const tableHeaderStyle: CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const tableBodyRowStyle: CSSProperties = {
  borderTop: "1px solid rgba(226,232,240,0.95)",
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

const emptyTableCellStyle: CSSProperties = {
  padding: "28px 18px",
  textAlign: "center",
  color: "#64748b",
};

const subTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.82rem",
};

const metricNameWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
};

const metricNameRowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
};

const metricTooltipButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  borderRadius: "999px",
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(248,250,252,0.95)",
  color: "#64748b",
  fontSize: "0.72rem",
  fontWeight: 700,
  cursor: "help",
  userSelect: "none",
  padding: 0,
};

const metricTooltipPopoverStyle: CSSProperties = {
  position: "fixed",
  zIndex: 1200,
  width: "260px",
  maxWidth: "min(260px, 42vw)",
  borderRadius: "10px",
  border: "1px solid rgba(148,163,184,0.32)",
  background: "#ffffff",
  boxShadow: "0 18px 42px rgba(15,23,42,0.16)",
  color: "#334155",
  fontSize: "0.82rem",
  lineHeight: 1.55,
  padding: "10px 12px",
};

const errorStyle: CSSProperties = sharedErrorStyle;

const emptyStateStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px dashed var(--admin-muted-border)",
  background: "var(--admin-muted-bg)",
  color: "var(--admin-muted-text)",
  padding: "24px 18px",
  fontSize: "0.94rem",
  textAlign: "center",
};
