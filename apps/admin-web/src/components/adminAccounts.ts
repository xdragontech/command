import type { CSSProperties } from "react";

export const accountSplitLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.35fr)",
  alignItems: "start",
};

export const accountListPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  alignSelf: "start",
};

export const accountListHeaderStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

export const accountListRowsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  marginTop: "8px",
};

export const accountListCardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  color: "#0f172a",
  padding: "10px 14px",
  cursor: "pointer",
};

export const selectedAccountListCardStyle: CSSProperties = {
  background: "#fee2e2",
  border: "1px solid rgba(239,68,68,0.34)",
};

export const accountListCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
};

export const accountListCardIdentityStyle: CSSProperties = {
  minWidth: 0,
  flex: "1 1 auto",
};

export const accountListNameStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.86rem",
  lineHeight: 1.25,
  color: "#0f172a",
};

export const accountListSecondaryTextStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "0.8rem",
  lineHeight: 1.3,
  color: "#64748b",
};

export const accountListFooterTextStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "0.74rem",
  lineHeight: 1.25,
  color: "#64748b",
};

export const accountListBadgeColumnStyle: CSSProperties = {
  display: "grid",
  gap: "5px",
  justifyItems: "end",
  alignContent: "start",
  flex: "0 0 auto",
};

export const accountListPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  padding: "4px 8px",
  minHeight: "18px",
  fontSize: "0.64rem",
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

export const accountListDensePillStyle: CSSProperties = {
  ...accountListPillStyle,
  padding: "3px 7px",
  minHeight: "16px",
  fontSize: "0.58rem",
};

export function createAccountSearchInputStyle(base: CSSProperties): CSSProperties {
  return {
    ...base,
    boxSizing: "border-box",
    height: "30px",
    minHeight: "30px",
    padding: "0 10px",
    fontSize: "0.86rem",
    lineHeight: 1.1,
  };
}
