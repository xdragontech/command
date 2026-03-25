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
            <div style={{ marginTop: "6px", fontSize: "0.84rem", color: selected ? "var(--admin-text-secondary)" : "var(--admin-text-muted)" }}>
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
  background: "var(--admin-info-bg)",
  border: "1px solid var(--admin-info-border)",
  color: "var(--admin-info-text)",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--admin-muted-bg)",
  border: "1px dashed var(--admin-muted-border)",
  color: "var(--admin-muted-text)",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const errorStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--admin-error-bg)",
  border: "1px solid var(--admin-error-border)",
  color: "var(--admin-error-text)",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const successStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--admin-success-bg)",
  border: "1px solid var(--admin-success-border)",
  color: "var(--admin-success-text)",
  padding: "14px 16px",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const warningStyle: CSSProperties = {
  borderRadius: "12px",
  background: "var(--admin-warning-bg)",
  border: "1px solid var(--admin-warning-border)",
  color: "var(--admin-warning-text)",
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
  border: "1px solid var(--admin-border-subtle)",
  padding: "18px",
  background: "var(--admin-surface-primary)",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid var(--admin-border-strong)",
  background: "var(--admin-input-bg)",
  padding: "12px 14px",
  fontSize: "0.95rem",
  color: "var(--admin-text-primary)",
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
  color: "var(--admin-text-primary)",
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
  border: "1px solid rgba(239,68,68,0.32)",
  background: "#dc2626",
  color: "#ffffff",
  borderRadius: "12px",
  padding: "12px 16px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--admin-border-strong)",
  background: "var(--admin-surface-primary)",
  color: "var(--admin-text-secondary)",
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
  color: "var(--admin-text-muted)",
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
  color: "var(--admin-text-muted)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

export const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
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
  color: "var(--admin-text-muted)",
  fontWeight: 700,
  padding: "12px 14px",
  background: "var(--admin-surface-secondary)",
  borderBottom: "1px solid var(--admin-border-subtle)",
};

export const tableCellStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--admin-border-subtle)",
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
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-primary)",
  padding: "14px",
  textAlign: "left",
  cursor: "pointer",
};

const selectedEntityCardStyle: CSSProperties = {
  background: "var(--admin-nav-active-bg)",
  borderColor: "var(--admin-nav-active-bg)",
  color: "var(--admin-nav-active-text)",
};

const toneStyles: Record<string, CSSProperties> = {
  success: { background: "var(--admin-pill-success-bg)", color: "var(--admin-pill-success-text)" },
  warning: { background: "var(--admin-pill-warning-bg)", color: "var(--admin-pill-warning-text)" },
  danger: { background: "var(--admin-pill-danger-bg)", color: "var(--admin-pill-danger-text)" },
  subtle: { background: "var(--admin-pill-subtle-bg)", color: "var(--admin-pill-subtle-text)" },
  slate: { background: "var(--admin-pill-slate-bg)", color: "var(--admin-pill-slate-text)" },
};
