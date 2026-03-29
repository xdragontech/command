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
