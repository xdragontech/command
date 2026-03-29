import type { CSSProperties } from "react";
import { useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { loadDashboardMetrics, parseMetricsPeriod, type DashboardMetrics, type MetricsPeriod } from "@command/core-leads";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { formatAdminDateRange } from "../../lib/adminDates";
import { requireBackofficePage } from "../../server/backofficeAuth";

type DashboardProps = {
  principal: string;
  role: string;
  brands: string[];
  initialMetrics: DashboardMetrics;
};

type MetricsResponse = ({ ok: true } & DashboardMetrics) | { ok: false; error: string };
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

const COUNTRY_POINT_POSITIONS: Record<string, { x: number; y: number }> = {
  AR: { x: 302, y: 432 },
  AT: { x: 551, y: 151 },
  AU: { x: 836, y: 404 },
  BE: { x: 510, y: 141 },
  BR: { x: 318, y: 346 },
  CA: { x: 184, y: 126 },
  CH: { x: 525, y: 154 },
  CL: { x: 262, y: 390 },
  CN: { x: 782, y: 189 },
  CO: { x: 277, y: 283 },
  CZ: { x: 553, y: 142 },
  DE: { x: 533, y: 133 },
  DK: { x: 530, y: 114 },
  DZ: { x: 505, y: 223 },
  EG: { x: 575, y: 216 },
  ES: { x: 482, y: 165 },
  ET: { x: 595, y: 296 },
  FI: { x: 571, y: 83 },
  FR: { x: 501, y: 151 },
  GB: { x: 456, y: 120 },
  GR: { x: 577, y: 185 },
  HK: { x: 812, y: 210 },
  HU: { x: 561, y: 153 },
  ID: { x: 817, y: 324 },
  IE: { x: 442, y: 124 },
  IL: { x: 600, y: 214 },
  IN: { x: 701, y: 255 },
  IR: { x: 648, y: 206 },
  IT: { x: 545, y: 170 },
  JP: { x: 875, y: 190 },
  KE: { x: 584, y: 316 },
  KR: { x: 848, y: 181 },
  KZ: { x: 697, y: 154 },
  MA: { x: 467, y: 209 },
  MX: { x: 150, y: 221 },
  MY: { x: 776, y: 289 },
  NG: { x: 510, y: 286 },
  NL: { x: 514, y: 133 },
  NO: { x: 530, y: 78 },
  NZ: { x: 917, y: 450 },
  PE: { x: 270, y: 332 },
  PH: { x: 821, y: 246 },
  PK: { x: 674, y: 231 },
  PL: { x: 561, y: 130 },
  PT: { x: 458, y: 164 },
  QA: { x: 648, y: 240 },
  RO: { x: 584, y: 160 },
  RU: { x: 691, y: 96 },
  SA: { x: 632, y: 240 },
  SE: { x: 548, y: 86 },
  SG: { x: 784, y: 300 },
  TH: { x: 760, y: 255 },
  TR: { x: 611, y: 180 },
  TW: { x: 833, y: 214 },
  UA: { x: 596, y: 136 },
  US: { x: 192, y: 171 },
  VN: { x: 791, y: 256 },
  ZA: { x: 563, y: 422 },
};

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

function fallbackMetrics(period: MetricsPeriod = "7d"): DashboardMetrics {
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
  };
}

function isDashboardMetrics(value: unknown): value is DashboardMetrics {
  if (!value || typeof value !== "object") return false;
  const input = value as DashboardMetrics;
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
    typeof input.totals.chatLeads === "number"
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

function CountriesMap({
  rows,
  mode,
}: {
  rows: DashboardMetrics["countryMetrics"][CountryMetricMode];
  mode: CountryMetricMode;
}) {
  const positionedRows = rows
    .map((row) => ({
      ...row,
      point: row.countryIso2 ? COUNTRY_POINT_POSITIONS[row.countryIso2] : undefined,
    }))
    .filter((row): row is (typeof rows)[number] & { point: { x: number; y: number } } => Boolean(row.point));

  const palette =
    mode === "signups"
      ? { glow: "rgba(185,28,28,0.26)", dot: "#b91c1c" }
      : mode === "clientLogins"
        ? { glow: "rgba(15,23,42,0.22)", dot: "#0f172a" }
        : { glow: "rgba(37,99,235,0.24)", dot: "#2563eb" };

  const maxCount = Math.max(...positionedRows.map((row) => row.count), 1);
  const visibleRows = positionedRows.slice(0, 24);
  const emptyLabel =
    mode === "signups"
      ? "No signup country data is available for this period yet."
      : mode === "clientLogins"
        ? "No client login country data is available for this period yet."
        : "No backoffice login country data is available for this period yet.";

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <svg
        viewBox="0 0 960 520"
        style={{
          width: "100%",
          height: "320px",
          borderRadius: "12px",
          border: "1px solid var(--admin-border-subtle)",
          background: "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
        }}
        role="img"
        aria-label="Country activity heat map"
      >
        <defs>
          <filter id="country-heat-blur">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <filter id="country-heat-soft">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <rect x="0" y="0" width="960" height="520" fill="transparent" />

        <g fill="#dbe4ef" stroke="rgba(148,163,184,0.35)" strokeWidth="2">
          <path d="M94 126 C120 78 190 60 242 91 C267 106 290 132 285 160 C279 194 257 224 220 230 C192 234 166 225 150 210 C132 194 118 188 104 164 C92 144 86 140 94 126 Z" />
          <path d="M238 246 C263 250 281 268 287 295 C291 322 282 344 269 367 C257 388 247 410 237 438 C227 414 220 392 214 362 C208 334 200 304 205 282 C210 264 221 250 238 246 Z" />
          <path d="M418 108 C445 88 488 82 520 92 C550 88 575 84 604 90 C650 98 693 118 728 140 C754 157 790 175 822 176 C840 176 858 187 867 205 C854 219 830 226 811 222 C780 217 760 231 740 245 C716 228 690 224 666 215 C638 213 624 226 602 236 C580 244 552 238 530 225 C504 210 480 198 454 190 C430 181 408 160 404 138 C402 126 407 116 418 108 Z" />
          <path d="M498 228 C526 230 550 246 565 270 C575 290 579 319 569 345 C560 370 545 390 523 408 C507 389 494 370 486 344 C478 320 477 294 481 269 C485 250 490 236 498 228 Z" />
          <path d="M756 345 C778 338 802 344 818 358 C829 371 829 390 817 403 C800 413 776 416 758 406 C741 396 735 377 742 360 C746 353 750 348 756 345 Z" />
          <path d="M430 80 C445 67 467 67 482 79 C470 92 448 96 430 80 Z" />
        </g>

        <g opacity="0.92">
          {visibleRows.map((row) => {
            const intensity = row.count / maxCount;
            const radius = 18 + intensity * 44;
            return (
              <g key={`${mode}-${row.countryIso2 || row.country}-${row.count}`}>
                <circle
                  cx={row.point.x}
                  cy={row.point.y}
                  r={radius}
                  fill={palette.glow}
                  filter="url(#country-heat-blur)"
                />
                <circle
                  cx={row.point.x}
                  cy={row.point.y}
                  r={Math.max(10, radius * 0.58)}
                  fill={palette.glow}
                  filter="url(#country-heat-soft)"
                />
                <circle cx={row.point.x} cy={row.point.y} r={Math.max(4, radius * 0.16)} fill={palette.dot} />
              </g>
            );
          })}
        </g>

        {!visibleRows.length ? (
          <g>
            <rect x="300" y="226" width="360" height="68" rx="14" fill="rgba(255,255,255,0.88)" />
            <text
              x="480"
              y="265"
              textAnchor="middle"
              fill="#475569"
              fontSize="21"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            >
              No country activity in this range
            </text>
          </g>
        ) : null}
      </svg>

      {!visibleRows.length ? (
        <div style={{ color: "var(--admin-text-secondary)", fontSize: "0.88rem" }}>{emptyLabel}</div>
      ) : null}
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
  const [metrics, setMetrics] = useState<DashboardMetrics>(safeInitialMetrics);
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
          <CountriesMap rows={selectedCountryRows} mode={selectedCountryMetric} />
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
