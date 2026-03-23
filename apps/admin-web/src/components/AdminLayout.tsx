import Head from "next/head";
import type { CSSProperties, ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminSignOutButton } from "./AdminSignOutButton";

type AdminLayoutProps = {
  title: string;
  sectionLabel: string;
  active: "dashboard" | "accounts" | "library" | "leads" | "analytics" | "settings";
  loggedInAs: string | null;
  role: string;
  brands: string[];
  children: ReactNode;
};

export function AdminLayout({ title, sectionLabel, active, loggedInAs, role, brands, children }: AdminLayoutProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <header
          style={{
            width: "100%",
            background: "#ffffff",
            borderBottom: "1px solid rgba(148,163,184,0.18)",
            boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
          }}
        >
          <div
            style={{
              margin: "0 auto",
              maxWidth: "1320px",
              padding: "16px 20px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px 20px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#475569",
                  marginBottom: "10px",
                }}
              >
                {sectionLabel}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.9rem",
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                }}
              >
                Command Admin
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "14px 18px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={metaRowStyle}>
                  <span style={eyebrowStyle}>Signed In As</span>
                  <span style={valueStyle}>{loggedInAs || "Unknown"}</span>
                </div>
                <div style={metaRowStyle}>
                  <span style={eyebrowStyle}>Role</span>
                  <span style={valueStyle}>{role}</span>
                </div>
                <div style={metaRowStyle}>
                  <span style={eyebrowStyle}>Brand Scope</span>
                  {brands.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                      {brands.map((brand) => (
                        <span key={brand} style={brandChipStyle}>
                          {brand}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "#64748b", fontSize: "0.92rem" }}>No brands assigned</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <AdminSignOutButton />
              </div>
            </div>
          </div>
        </header>

        <main
          style={{
            margin: "0 auto",
            maxWidth: "1320px",
            padding: "24px 20px 72px",
          }}
        >
          <section
            style={{
              display: "grid",
              gap: "18px",
              gridTemplateColumns: "minmax(250px, 290px) minmax(0, 1fr)",
            }}
          >
            <AdminSidebar active={active} />

            <div style={{ display: "grid", gap: "18px" }}>{children}</div>
          </section>
        </main>
      </div>
    </>
  );
}

const eyebrowStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.78rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const valueStyle: CSSProperties = {
  fontSize: "0.94rem",
  fontWeight: 700,
  color: "#0f172a",
  textAlign: "right",
};

const brandChipStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.82rem",
  fontWeight: 700,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px 12px",
};
