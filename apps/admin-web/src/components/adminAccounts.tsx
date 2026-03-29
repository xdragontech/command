import type { CSSProperties, ReactNode } from "react";

export const accountSplitLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
  alignItems: "start",
};

export const accountListPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "18px",
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
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateAreas: `"topLeft topRight" "bottomLeft bottomRight"`,
  columnGap: "12px",
  rowGap: "4px",
  alignItems: "center",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  color: "#0f172a",
  padding: "7px 14px",
  textAlign: "left",
  cursor: "pointer",
};

export const selectedAccountListCardStyle: CSSProperties = {
  background: "#fee2e2",
  border: "1px solid rgba(239,68,68,0.34)",
};

export const accountListCardHeaderStyle: CSSProperties = {
  display: "contents",
};

export const accountListCardIdentityStyle: CSSProperties = {
  gridArea: "topLeft",
  minWidth: 0,
  display: "grid",
  gap: "2px",
  alignSelf: "end",
};

export const accountListNameStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.92rem",
  lineHeight: 1.25,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const accountListSecondaryTextStyle: CSSProperties = {
  fontSize: "0.74rem",
  lineHeight: 1.2,
  color: "#64748b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const accountListFooterTextStyle: CSSProperties = {
  gridArea: "bottomLeft",
  alignSelf: "start",
  fontSize: "0.74rem",
  lineHeight: 1.2,
  color: "#64748b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const accountListBadgeColumnStyle: CSSProperties = {
  gridArea: "topRight",
  justifySelf: "end",
  alignSelf: "end",
};

export const accountListPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  padding: "2px 7px",
  minHeight: "17px",
  fontSize: "0.6rem",
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  maxWidth: "100%",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const accountListDensePillStyle: CSSProperties = {
  ...accountListPillStyle,
};

export const accountListBottomLeftStyle: CSSProperties = {
  gridArea: "bottomLeft",
  justifySelf: "start",
  alignSelf: "start",
};

export const accountListBottomRightStyle: CSSProperties = {
  gridArea: "bottomRight",
  justifySelf: "end",
  alignSelf: "start",
  textAlign: "right",
};

export function AccountListRow({
  selected,
  title,
  topRight,
  bottomLeft,
  bottomRight,
  onClick,
}: {
  selected: boolean;
  title: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...accountListCardStyle,
        ...(selected ? selectedAccountListCardStyle : {}),
      }}
    >
      <div style={accountListCardHeaderStyle}>
        <div style={accountListCardIdentityStyle}>
          <div style={accountListNameStyle}>{title}</div>
        </div>
        {topRight ? <div style={accountListBadgeColumnStyle}>{topRight}</div> : null}
        {bottomLeft ? <div style={accountListFooterTextStyle}>{bottomLeft}</div> : null}
        {bottomRight ? <div style={accountListBottomRightStyle}>{bottomRight}</div> : null}
      </div>
    </button>
  );
}

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
