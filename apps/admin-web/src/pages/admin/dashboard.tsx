import type { CSSProperties } from "react";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { loadDashboardMetrics, parseMetricsPeriod, type DashboardMetrics, type MetricsPeriod } from "@command/core-leads";
import { loadWebsiteDashboardSummary, type WebsiteDashboardSummary } from "@command/core-website-analytics";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { formatAdminDateRange } from "../../lib/adminDates";
import { requireBackofficePage } from "../../server/backofficeAuth";

type DashboardProps = {
  principal: string;
  role: string;
  brands: string[];
  initialMetrics: DashboardPageMetrics;
};

type DashboardPageMetrics = DashboardMetrics & {
  websiteSummary: WebsiteDashboardSummary;
};

type MetricsResponse = ({ ok: true } & DashboardPageMetrics) | { ok: false; error: string };
type CountryMetricMode = "signups" | "clientLogins" | "backofficeLogins";

const PERIOD_OPTIONS: Array<{ value: MetricsPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "month", label: "Month" },
];

const COUNTRY_METRIC_OPTIONS: Array<{ value: CountryMetricMode; label: string }> = [
  { value: "signups", label: "Signups" },
  { value: "clientLogins", label: "Client Logins" },
  { value: "backofficeLogins", label: "Backoffice Logins" },
];

const DashboardCountriesMap = dynamic(() => import("../../components/DashboardCountriesMap"), {
  loading: () => <div style={emptyStateStyle}>Loading map…</div>,
});

function buildLinePath(values: number[], maxValue: number, width: number, height: number, pad = 18) {
  if (!values.length) return "";

  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;

  const xFor = (index: number) =>
    pad + (values.length === 1 ? innerWidth / 2 : (innerWidth * index) / Math.max(values.length - 1, 1));
  const yFor = (value: number) => pad + innerHeight - (innerHeight * value) / maxValue;

  return values
    .map((value, index) => {
      const x = xFor(index);
      const y = yFor(value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function fallbackMetrics(period: MetricsPeriod = "7d"): DashboardPageMetrics {
  const now = new Date();
  const iso = now.toISOString();
  return {
    period,
    from: iso,
    to: iso,
    labels: [],
    signups: [],
    loginStreams: [],
    totals: { signups: 0, clientLogins: 0, backofficeLogins: 0, leads: 0, chatLeads: 0 },
    countryMetrics: {
      signups: [],
      clientLogins: [],
      backofficeLogins: [],
    },
    websiteSummary: {
      sessions: 0,
      engagedSessions: 0,
      convertedSessions: 0,
      conversionRate: 0,
      bounceRate: 0,
      averageEngagedSeconds: 0,
      topSources: [],
    },
  };
}

function isDashboardMetrics(value: unknown): value is DashboardPageMetrics {
  if (!value || typeof value !== "object") return false;
  const input = value as DashboardPageMetrics;
  return (
    (input.period === "today" || input.period === "7d" || input.period === "month") &&
    typeof input.from === "string" &&
    typeof input.to === "string" &&
    Array.isArray(input.labels) &&
    Array.isArray(input.signups) &&
    Array.isArray(input.loginStreams) &&
    !!input.countryMetrics &&
    Array.isArray(input.countryMetrics.signups) &&
    Array.isArray(input.countryMetrics.clientLogins) &&
    Array.isArray(input.countryMetrics.backofficeLogins) &&
    !!input.totals &&
    typeof input.totals.signups === "number" &&
    typeof input.totals.clientLogins === "number" &&
    typeof input.totals.backofficeLogins === "number" &&
    typeof input.totals.leads === "number" &&
    typeof input.totals.chatLeads === "number" &&
    !!input.websiteSummary &&
    typeof input.websiteSummary.sessions === "number" &&
    typeof input.websiteSummary.engagedSessions === "number" &&
    typeof input.websiteSummary.convertedSessions === "number" &&
    typeof input.websiteSummary.conversionRate === "number" &&
    typeof input.websiteSummary.bounceRate === "number" &&
    typeof input.websiteSummary.averageEngagedSeconds === "number" &&
    Array.isArray(input.websiteSummary.topSources)
  );
}

function PeriodButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: "12px",
        border: active ? "1px solid rgba(239,68,68,0.32)" : "1px solid var(--admin-border-strong)",
        background: active ? "var(--admin-pill-danger-bg)" : "var(--admin-surface-primary)",
        color: active ? "var(--admin-pill-danger-text)" : "var(--admin-text-secondary)",
        padding: "7px 12px",
        fontSize: "0.82rem",
        lineHeight: 1.1,
        fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled && !active ? 0.72 : 1,
      }}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "red" | "slate" | "amber" }) {
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

function MetricChart({ metrics }: { metrics: DashboardMetrics }) {
  const points = metrics.labels;
  const width = 860;
  const height = 240;
  const streamColors: Record<string, string> = {
    client: "var(--admin-text-primary)",
    backoffice: "#2563eb",
  };
  const maxValue = Math.max(
    1,
    ...metrics.signups,
    ...metrics.loginStreams.flatMap((stream) => stream.series)
  );
  const signupsPath = buildLinePath(metrics.signups, maxValue, width, height);
  const loginPaths = metrics.loginStreams.map((stream) => ({
    key: stream.key,
    label: stream.label,
    color: streamColors[stream.key] || "#475569",
    path: buildLinePath(stream.series, maxValue, width, height),
  }));

  if (!points.length) {
    return (
      <div style={emptyStateStyle}>
        Dashboard metrics will appear here once this install records signups and logins for the selected period.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", color: "var(--admin-text-secondary)", fontSize: "0.9rem" }}>
        <span style={legendStyle}>
          <span style={{ ...legendDotStyle, background: "#b91c1c" }} />
          Signups
        </span>
        {loginPaths.map((stream) => (
          <span key={stream.key} style={legendStyle}>
            <span style={{ ...legendDotStyle, background: stream.color }} />
            {stream.label} Logins
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
          style={{
            width: "100%",
            height: "240px",
            borderRadius: "12px",
            border: "1px solid var(--admin-border-subtle)",
            background:
              "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
          }}
      >
        {loginPaths.map((stream) => (
          <path
            key={stream.key}
            d={stream.path}
            fill="none"
            stroke={stream.color}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ))}
        <path d={signupsPath} fill="none" stroke="#b91c1c" strokeWidth="3.5" strokeLinecap="round" />
      </svg>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(points.length, 7)}, minmax(0, 1fr))`,
          gap: "8px",
          color: "var(--admin-text-muted)",
          fontSize: "0.78rem",
        }}
      >
          {points.slice(Math.max(points.length - 7, 0)).map((label) => (
            <div key={label} style={{ textAlign: "center" }}>
              {label}
            </div>
          ))}
      </div>
    </div>
  );
}

function LoginIpTable({ rows, emptyLabel }: { rows: DashboardMetrics["loginStreams"][number]["ipGroups"]; emptyLabel: string }) {
  const visibleRows = rows.slice(0, 12);

  if (!visibleRows.length) {
    return <div style={emptyStateStyle}>{emptyLabel}</div>;
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--admin-border-subtle)" }}>
      <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--admin-surface-secondary)", color: "var(--admin-text-secondary)" }}>
            <th style={tableHeaderStyle}>IP</th>
            <th style={tableHeaderStyle}>Country</th>
            <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Logins</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.ip} style={{ borderTop: "1px solid var(--admin-border-subtle)" }}>
              <td style={{ ...tableCellStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{row.ip}</td>
              <td style={tableCellStyle}>{row.country || row.countryIso2 || "Unknown"}</td>
              <td style={{ ...tableCellStyle, textAlign: "right", fontWeight: 700 }}>{formatCount(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardPage({
  principal,
  role,
  brands,
  initialMetrics,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const safeInitialMetrics = isDashboardMetrics(initialMetrics) ? initialMetrics : fallbackMetrics();
  const [metrics, setMetrics] = useState<DashboardPageMetrics>(safeInitialMetrics);
  const [selectedPeriod, setSelectedPeriod] = useState<MetricsPeriod>(safeInitialMetrics.period);
  const [selectedCountryMetric, setSelectedCountryMetric] = useState<CountryMetricMode>("signups");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isDashboardMetrics(initialMetrics) ? null : "Dashboard metrics were unavailable. Refresh the page to try again."
  );
  const clientLoginStream = metrics.loginStreams.find((stream) => stream.key === "client");
  const backofficeLoginStream = metrics.loginStreams.find((stream) => stream.key === "backoffice");
  const selectedCountryRows = metrics.countryMetrics[selectedCountryMetric] || [];

  async function loadPeriod(nextPeriod: MetricsPeriod) {
    if (nextPeriod === selectedPeriod && !error) return;

    const previousPeriod = selectedPeriod;
    setSelectedPeriod(nextPeriod);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/metrics?period=${encodeURIComponent(nextPeriod)}`);
      const payload = (await response.json()) as MetricsResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Request failed" : payload.error || "Request failed");
      }

      if (!isDashboardMetrics(payload)) {
        throw new Error("Dashboard metrics response was incomplete.");
      }

      setMetrics(payload);
    } catch (loadError: any) {
      setSelectedPeriod(previousPeriod);
      setError(typeof loadError?.message === "string" ? loadError.message : "Failed to load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Dashboard"
      sectionLabel="Dashboard"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="dashboard"
    >
      <AdminCard
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <span>Dashboard</span>
            <span
              style={{
                fontSize: "0.92rem",
                fontWeight: 600,
                color: "var(--admin-text-muted)",
                letterSpacing: "0.01em",
              }}
            >
              Global Operations
            </span>
          </span>
        }
        actions={
          <div style={{ display: "grid", justifyItems: "end", gap: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
              {PERIOD_OPTIONS.map((option) => (
                <PeriodButton
                  key={option.value}
                  label={option.label}
                  active={selectedPeriod === option.value}
                  disabled={loading}
                  onClick={() => loadPeriod(option.value)}
                />
              ))}
            </div>
            <div style={{ display: "grid", justifyItems: "end", gap: "4px" }}>
              <div style={{ color: "var(--admin-text-secondary)", fontSize: "0.88rem", textAlign: "right" }}>
                Viewing: <strong style={{ color: "var(--admin-text-primary)" }}>{formatAdminDateRange(metrics.from, metrics.to)}</strong>
              </div>
              {loading ? (
                <div style={{ color: "var(--admin-text-secondary)", fontSize: "0.82rem", textAlign: "right" }}>Refreshing metrics…</div>
              ) : null}
            </div>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          {error ? (
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid rgba(248,113,113,0.28)",
                background: "var(--admin-error-bg)",
                color: "var(--admin-error-text)",
                padding: "14px 16px",
                fontSize: "0.95rem",
              }}
            >
              {error}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            }}
          >
            <SummaryCard label="Signups" value={formatCount(metrics.totals.signups)} tone="red" />
            <SummaryCard label="Client Logins" value={formatCount(metrics.totals.clientLogins)} tone="slate" />
            <SummaryCard label="Backoffice Logins" value={formatCount(metrics.totals.backofficeLogins)} tone="slate" />
            <SummaryCard label="Leads" value={formatCount(metrics.totals.leads)} tone="amber" />
            <SummaryCard label="Chat Leads" value={formatCount(metrics.totals.chatLeads)} tone="amber" />
          </div>

          <section style={websiteSummaryPanelStyle}>
            <div style={websiteSummaryHeaderStyle}>
              <div style={websiteSummaryTitleStyle}>Website Analytics</div>
              <div style={websiteSummaryMetaStyle}>Consented sessions only</div>
            </div>
            <div
              style={{
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
              }}
            >
              <SummaryCard label="Sessions" value={formatCount(metrics.websiteSummary.sessions)} tone="slate" />
              <SummaryCard label="Converted" value={formatCount(metrics.websiteSummary.convertedSessions)} tone="red" />
              <SummaryCard label="Conv. Rate" value={formatPercent(metrics.websiteSummary.conversionRate)} tone="red" />
              <SummaryCard label="Bounce Rate" value={formatPercent(metrics.websiteSummary.bounceRate)} tone="amber" />
            </div>
            <div style={websiteSummaryFooterStyle}>
              <div style={websiteSummaryMetaRowStyle}>
                <span style={websiteSummaryMetaLabelStyle}>Avg engaged duration</span>
                <strong style={websiteSummaryMetaValueStyle}>{formatDuration(metrics.websiteSummary.averageEngagedSeconds)}</strong>
              </div>
              <div style={websiteSummarySourceListStyle}>
                <span style={websiteSummaryMetaLabelStyle}>Top source mix</span>
                <div style={websiteSummarySourceChipsStyle}>
                  {metrics.websiteSummary.topSources.length ? (
                    metrics.websiteSummary.topSources.map((source) => (
                      <span key={`${source.sourceCategory}:${source.sourcePlatform || ""}`} style={websiteSummarySourceChipStyle}>
                        {formatSourceLabel(source.sourceCategory, source.sourcePlatform)} · {formatPercent(source.share)}
                      </span>
                    ))
                  ) : (
                    <span style={websiteSummaryEmptyStyle}>No consented session data in this range yet.</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <MetricChart metrics={metrics} />
        </div>
      </AdminCard>

      <div
        style={{
          display: "grid",
          gap: "18px",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <AdminCard
          title="Countries"
          actions={
            <label style={{ display: "grid", gap: "6px", justifyItems: "end" }}>
              <span style={{ color: "var(--admin-text-muted)", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Metric
              </span>
              <select
                value={selectedCountryMetric}
                onChange={(event) => setSelectedCountryMetric(event.target.value as CountryMetricMode)}
                style={{
                  minWidth: "188px",
                  borderRadius: "12px",
                  border: "1px solid var(--admin-border-strong)",
                  background: "var(--admin-surface-primary)",
                  color: "var(--admin-text-primary)",
                  padding: "9px 12px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  outline: "none",
                }}
              >
                {COUNTRY_METRIC_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <DashboardCountriesMap rows={selectedCountryRows} mode={selectedCountryMetric} />
        </AdminCard>

        <AdminCard
          title="Client Login IPs"
          description="Client login IP aggregation uses stored event data only. Private/local addresses are excluded from the summary."
        >
          <LoginIpTable
            rows={clientLoginStream?.ipGroups || []}
            emptyLabel="No client login IP data is available for this period yet."
          />
        </AdminCard>

        <AdminCard
          title="Backoffice Login IPs"
          description="Backoffice login IP aggregation is tracked separately from client/public login activity."
        >
          <LoginIpTable
            rows={backofficeLoginStream?.ipGroups || []}
            emptyLabel="No backoffice login IP data is available for this period yet."
          />
        </AdminCard>
      </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx);
  if (!auth.ok) {
    return auth.response;
  }

  const period = parseMetricsPeriod(ctx.query.period);
  const initialMetrics = await loadDashboardMetrics({
    period,
    scope: {
      role: auth.principal.role,
      allowedBrandIds: auth.principal.allowedBrandIds,
    },
  });
  const websiteSummary = await loadWebsiteDashboardSummary({
    scope: {
      role: auth.principal.role,
      allowedBrandIds: auth.principal.allowedBrandIds,
    },
    from: new Date(initialMetrics.from),
    to: new Date(initialMetrics.to),
  });

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
      initialMetrics: {
        ...initialMetrics,
        websiteSummary,
      },
    },
  };
};

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

function formatSourceLabel(category: string, platform: string | null) {
  const categoryLabel = category
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (!platform) return categoryLabel;
  return `${platform} (${categoryLabel})`;
}

const summaryLabelStyle: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: "0.62rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const legendStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontWeight: 600,
};

const legendDotStyle: CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "12px",
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
  padding: "12px 14px",
  fontSize: "0.94rem",
  color: "var(--admin-text-primary)",
};

const emptyStateStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px dashed var(--admin-muted-border)",
  background: "var(--admin-muted-bg)",
  padding: "18px",
  color: "var(--admin-text-secondary)",
  fontSize: "0.95rem",
  lineHeight: 1.6,
};

const websiteSummaryPanelStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  borderRadius: "14px",
  border: "1px solid var(--admin-border-subtle)",
  background: "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
  padding: "14px",
};

const websiteSummaryHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const websiteSummaryTitleStyle: CSSProperties = {
  fontSize: "0.98rem",
  fontWeight: 800,
  color: "var(--admin-text-primary)",
};

const websiteSummaryMetaStyle: CSSProperties = {
  fontSize: "0.82rem",
  color: "var(--admin-text-muted)",
  fontWeight: 600,
};

const websiteSummaryFooterStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const websiteSummaryMetaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const websiteSummaryMetaLabelStyle: CSSProperties = {
  fontSize: "0.82rem",
  color: "var(--admin-text-secondary)",
  fontWeight: 700,
};

const websiteSummaryMetaValueStyle: CSSProperties = {
  fontSize: "0.92rem",
  color: "var(--admin-text-primary)",
};

const websiteSummarySourceListStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const websiteSummarySourceChipsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const websiteSummarySourceChipStyle: CSSProperties = {
  borderRadius: "999px",
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-primary)",
  color: "var(--admin-text-primary)",
  padding: "6px 10px",
  fontSize: "0.82rem",
  fontWeight: 700,
};

const websiteSummaryEmptyStyle: CSSProperties = {
  color: "var(--admin-text-muted)",
  fontSize: "0.84rem",
};
