import type { ReactNode } from "react";

type AdminCardProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminCard({ title, description, actions, children }: AdminCardProps) {
  return (
    <section
      style={{
        borderRadius: "12px",
        border: "1px solid var(--admin-border-subtle)",
        background: "var(--admin-surface-primary)",
        padding: "24px",
        boxShadow: "var(--admin-shadow-card)",
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
                color: "var(--admin-text-secondary)",
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
