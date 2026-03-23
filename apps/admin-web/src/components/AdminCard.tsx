import type { ReactNode } from "react";

type AdminCardProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminCard({ title, description, actions, children }: AdminCardProps) {
  return (
    <section
      style={{
        borderRadius: "24px",
        border: "1px solid rgba(148,163,184,0.24)",
        background: "rgba(255,255,255,0.95)",
        padding: "24px",
        boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "1.35rem",
              lineHeight: 1.15,
            }}
          >
            {title}
          </h2>
          {description ? (
            <div
              style={{
                marginTop: "10px",
                fontSize: "0.96rem",
                lineHeight: 1.7,
                color: "#475569",
                maxWidth: "72ch",
              }}
            >
              {description}
            </div>
          ) : null}
        </div>

        {actions ? <div>{actions}</div> : null}
      </div>

      {children}
    </section>
  );
}
