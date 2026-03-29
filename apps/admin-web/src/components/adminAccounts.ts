import type { CSSProperties } from "react";

export const accountListHeaderStackStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

export const accountListRowsStyle: CSSProperties = {
  display: "grid",
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
