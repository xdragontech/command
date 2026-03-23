import type { CSSProperties } from "react";
import { useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { loadDashboardMetrics, parseMetricsPeriod, type DashboardMetrics, type MetricsPeriod } from "@command/core-leads";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { requireBackofficePage } from "../../server/backofficeAuth";

type DashboardProps = {
  principal: string;
  role: string;
  brands: string[];
  initialMetrics: DashboardMetrics;
};

type MetricsResponse = ({ ok: true } & DashboardMetrics) | { ok: false; error: string };

type MetricPoint = {
  label: string;
  signups: number;
  logins: number;
};

const PERIOD_OPTIONS: Array<{ value: MetricsPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "month", label: "Month" },
];

function buildMetricPoints(metrics: DashboardMetrics): MetricPoint[] {
  return metrics.labels.map((label, index) => ({
    label,
    signups: Number(metrics.signups[index] || 0),
    logins: Number(metrics.logins[index] || 0),
  }));
}

function buildLinePath(points: MetricPoint[], key: "signups" | "logins", width: number, height: number, pad = 18) {
  if (!points.length) return "";

  const maxValue = Math.max(1, ...points.map((point) => point.signups), ...points.map((point) => point.logins));
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;

  const xFor = (index: number) =>
    pad + (points.length === 1 ? innerWidth / 2 : (innerWidth * index) / Math.max(points.length - 1, 1));
  const yFor = (value: number) => pad + innerHeight - (innerHeight * value) / maxValue;

  return points
    .map((point, index) => {
      const x = xFor(index);
      const y = yFor(point[key]);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatDateRange(metrics: DashboardMetrics) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(new Date(metrics.from))} — ${formatter.format(new Date(metrics.to))}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
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
        borderRadius: "999px",
        border: active ? "1px solid rgba(239,68,68,0.32)" : "1px solid rgba(148,163,184,0.34)",
        background: active ? "#fee2e2" : "rgba(255,255,255,0.92)",
        color: active ? "#991b1b" : "#334155",
        padding: "10px 14px",
        fontSize: "0.92rem",
        fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled && !active ? 0.72 : 1,
      }}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "blue" | "slate" | "amber" }) {
  const palette =
    tone === "amber"
      ? { bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.22)", value: "#92400e" }
      : tone === "slate"
        ? { bg: "rgba(15, 23, 42, 0.05)", border: "rgba(148, 163, 184, 0.24)", value: "#0f172a" }
        : { bg: "rgba(37, 99, 235, 0.08)", border: "rgba(37, 99, 235, 0.2)", value: "#1d4ed8" };

  return (
    <div
      style={{
        borderRadius: "20px",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        padding: "18px",
      }}
    >
      <div style={summaryLabelStyle}>{label}</div>
      <div style={{ marginTop: "8px", fontSize: "1.9rem", fontWeight: 800, color: palette.value }}>{value}</div>
    </div>
  );
}

function MetricChart({ metrics }: { metrics: DashboardMetrics }) {
  const points = buildMetricPoints(metrics);
  const width = 860;
  const height = 240;
  const signupsPath = buildLinePath(points, "signups", width, height);
  const loginsPath = buildLinePath(points, "logins", width, height);

  if (!points.length) {
    return (
      <div style={emptyStateStyle}>
        Dashboard metrics will appear here once this install records signups and logins for the selected period.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", color: "#475569", fontSize: "0.9rem" }}>
        <span style={legendStyle}>
          <span style={{ ...legendDotStyle, background: "#2563eb" }} />
          Signups
        </span>
        <span style={legendStyle}>
          <span style={{ ...legendDotStyle, background: "#0f172a" }} />
          Logins
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: "100%",
          height: "240px",
          borderRadius: "20px",
          border: "1px solid rgba(148,163,184,0.24)",
          background:
            "linear-gradient(180deg, rgba(248,250,252,0.94) 0%, rgba(226,232,240,0.82) 100%)",
        }}
      >
        <path d={loginsPath} fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />
        <path d={signupsPath} fill="none" stroke="#2563eb" strokeWidth="3.5" strokeLinecap="round" />
      </svg>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(points.length, 7)}, minmax(0, 1fr))`,
          gap: "8px",
          color: "#64748b",
          fontSize: "0.78rem",
        }}
      >
        {points.slice(Math.max(points.length - 7, 0)).map((point) => (
          <div key={point.label} style={{ textAlign: "center" }}>
            {point.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCountryList({ metrics }: { metrics: DashboardMetrics }) {
  const rows = metrics.signupCountries.slice(0, 8);

  if (!rows.length) {
    return <div style={emptyStateStyle}>No signup country data is available for this period yet.</div>;
  }

  const maxValue = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {rows.map((row) => (
        <div key={`${row.country || "Unknown"}-${row.count}`} style={{ display: "grid", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.92rem" }}>
            <span style={{ color: "#0f172a", fontWeight: 700 }}>{row.country || "Unknown"}</span>
            <span style={{ color: "#475569" }}>{formatCount(row.count)}</span>
          </div>
          <div
            style={{
              borderRadius: "999px",
              background: "#e2e8f0",
              overflow: "hidden",
              height: "10px",
            }}
          >
            <div
              style={{
                width: `${Math.max(8, (row.count / maxValue) * 100)}%`,
                height: "100%",
                borderRadius: "999px",
                background: "linear-gradient(90deg, #2563eb 0%, #0f172a 100%)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoginIpTable({ metrics }: { metrics: DashboardMetrics }) {
  const rows = metrics.ipGroups.slice(0, 12);

  if (!rows.length) {
    return <div style={emptyStateStyle}>No login IP data is available for this period yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto", borderRadius: "20px", border: "1px solid rgba(148,163,184,0.24)" }}>
      <table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
            <th style={tableHeaderStyle}>IP</th>
            <th style={tableHeaderStyle}>Country</th>
            <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Logins</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ip} style={{ borderTop: "1px solid rgba(226,232,240,0.95)" }}>
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
  const [metrics, setMetrics] = useState(initialMetrics);
  const [selectedPeriod, setSelectedPeriod] = useState<MetricsPeriod>(initialMetrics.period);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        title="Dashboard"
        description={
          role === "SUPERADMIN"
            ? "Global operational view across the current command install."
            : "Brand-scoped operational view limited to the brands assigned to this staff account."
        }
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" }}>
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
        }
      >
        <div style={{ display: "grid", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ color: "#475569", fontSize: "0.95rem" }}>
              Viewing <strong style={{ color: "#0f172a" }}>{formatDateRange(metrics)}</strong>
            </div>
            {loading ? <div style={{ color: "#475569", fontSize: "0.92rem" }}>Refreshing metrics…</div> : null}
          </div>

          {error ? (
            <div
              style={{
                borderRadius: "18px",
                border: "1px solid rgba(248,113,113,0.28)",
                background: "rgba(254,242,242,0.94)",
                color: "#991b1b",
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
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <SummaryCard label="Signups" value={formatCount(metrics.totals.signups)} />
            <SummaryCard label="Logins" value={formatCount(metrics.totals.logins)} tone="slate" />
            <SummaryCard label="Tracked Login IPs" value={formatCount(metrics.ipGroups.length)} tone="amber" />
          </div>

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
          title="Signup Countries"
          description="Country distribution is derived from the earliest stored login geography for each signup in the selected period."
        >
          <TopCountryList metrics={metrics} />
        </AdminCard>

        <AdminCard
          title="Top Login IPs"
          description="Login IP aggregation uses stored event data only. Private/local addresses are excluded from the summary."
        >
          <LoginIpTable metrics={metrics} />
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

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
      initialMetrics,
    },
  };
};

const summaryLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.76rem",
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
  borderRadius: "999px",
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
  color: "#0f172a",
};

const emptyStateStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px dashed rgba(148,163,184,0.38)",
  background: "rgba(248,250,252,0.9)",
  padding: "18px",
  color: "#475569",
  fontSize: "0.95rem",
  lineHeight: 1.6,
};
