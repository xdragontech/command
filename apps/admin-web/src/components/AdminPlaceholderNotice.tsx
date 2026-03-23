type AdminPlaceholderNoticeProps = {
  title: string;
  body: string;
};

export function AdminPlaceholderNotice({ title, body }: AdminPlaceholderNoticeProps) {
  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.22)",
        background: "#f8fafc",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontSize: "0.82rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#64748b",
          marginBottom: "8px",
        }}
      >
        Migration Status
      </div>
      <div
        style={{
          fontSize: "1.05rem",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: "10px 0 0",
          color: "#475569",
          lineHeight: 1.7,
          fontSize: "0.98rem",
        }}
      >
        {body}
      </p>
    </div>
  );
}
