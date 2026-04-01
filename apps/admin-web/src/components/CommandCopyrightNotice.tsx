import type { CSSProperties } from "react";

type CommandCopyrightNoticeProps = {
  color: string;
};

export function CommandCopyrightNotice({ color }: CommandCopyrightNoticeProps) {
  return (
    <div
      style={{
        fontSize: "0.75rem",
        lineHeight: 1.5,
        color,
        textAlign: "center",
      }}
    >
      Copyright 2026 X Dragon Technologies Ltd.
    </div>
  );
}

export const commandShellFooterStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0 20px 18px",
  display: "flex",
  justifyContent: "center",
};
