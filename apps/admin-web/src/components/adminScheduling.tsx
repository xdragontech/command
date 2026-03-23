import type { CSSProperties, ReactNode } from "react";

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function minutesToTimeInput(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatMinuteRange(start: number, end: number) {
  return `${renderTime(start)} - ${renderTime(end)}`;
}

function renderTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function EntityListButton({
  selected,
  title,
  subtitle,
  meta,
  onClick,
}: {
  selected: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...entityCardStyle,
        ...(selected ? selectedEntityCardStyle : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {subtitle ? (
            <div style={{ marginTop: "6px", fontSize: "0.84rem", color: selected ? "#cbd5e1" : "#64748b" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {meta ? <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>{meta}</div> : null}
      </div>
    </button>
  );
}

export function TonePill({
  label,
  tone = "subtle",
}: {
  label: ReactNode;
  tone?: "success" | "warning" | "danger" | "subtle" | "slate";
}) {
  const toneStyle =
    tone === "success"
      ? toneStyles.success
      : tone === "warning"
        ? toneStyles.warning
        : tone === "danger"
          ? toneStyles.danger
          : tone === "slate"
            ? toneStyles.slate
            : toneStyles.subtle;

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

export const infoPanelStyle: CSSProperties = {
  borderRadius: "12px",
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.22)",
  color: "#475569",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  background: "#f8fafc",
  border: "1px dashed rgba(148,163,184,0.4)",
  color: "#64748b",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const errorStyle: CSSProperties = {
  borderRadius: "12px",
  background: "#fef2f2",
  border: "1px solid rgba(239,68,68,0.2)",
  color: "#991b1b",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const successStyle: CSSProperties = {
  borderRadius: "12px",
  background: "#f0fdf4",
  border: "1px solid rgba(34,197,94,0.2)",
  color: "#166534",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const warningStyle: CSSProperties = {
  borderRadius: "12px",
  background: "#fff7ed",
  border: "1px solid rgba(249,115,22,0.18)",
  color: "#9a3412",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const splitLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
};

export const panelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  padding: "18px",
  background: "#ffffff",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.34)",
  background: "#ffffff",
  padding: "12px 14px",
  fontSize: "0.95rem",
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};

export const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "120px",
  resize: "vertical",
  fontFamily: "inherit",
};

export const labelStyle: CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
  fontSize: "0.86rem",
};

export const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

export const twoColumnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

export const threeColumnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

export const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
};

export const primaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.3)",
  background: "#dc2626",
  color: "#ffffff",
  borderRadius: "12px",
  padding: "12px 16px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.34)",
  background: "#ffffff",
  color: "#334155",
  borderRadius: "12px",
  padding: "12px 16px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

export const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.2)",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: "12px",
  padding: "12px 16px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

export const subtleTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.85rem",
};

export const detailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  marginBottom: "20px",
};

export const detailTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  lineHeight: 1.2,
};

export const paragraphStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
};

export const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "720px",
  borderCollapse: "collapse",
};

export const tableHeadCellStyle: CSSProperties = {
  textAlign: "left",
  fontSize: "0.74rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
  fontWeight: 700,
  padding: "12px 14px",
  background: "#f8fafc",
  borderBottom: "1px solid rgba(148,163,184,0.24)",
};

export const tableCellStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid rgba(226,232,240,0.9)",
  fontSize: "0.92rem",
  verticalAlign: "top",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  borderRadius: "12px",
  padding: "6px 10px",
  fontSize: "0.74rem",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const entityCardStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.2)",
  background: "#ffffff",
  padding: "14px",
  textAlign: "left",
  cursor: "pointer",
};

const selectedEntityCardStyle: CSSProperties = {
  background: "#0f172a",
  borderColor: "rgba(15,23,42,0.86)",
  color: "#ffffff",
};

const toneStyles: Record<string, CSSProperties> = {
  success: { background: "#dcfce7", color: "#166534" },
  warning: { background: "#fef3c7", color: "#92400e" },
  danger: { background: "#fee2e2", color: "#991b1b" },
  subtle: { background: "#e2e8f0", color: "#475569" },
  slate: { background: "#e2e8f0", color: "#0f172a" },
};
