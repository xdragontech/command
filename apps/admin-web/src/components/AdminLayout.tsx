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
          background:
            "radial-gradient(circle at top, rgba(37,99,235,0.12), transparent 34%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            margin: "0 auto",
            maxWidth: "1320px",
            padding: "40px 20px 72px",
          }}
        >
          <section
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "18px",
              marginBottom: "24px",
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
                  fontSize: "2.15rem",
                  lineHeight: 1.05,
                  letterSpacing: "-0.04em",
                }}
              >
                Command Admin
              </h1>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: "1rem",
                  lineHeight: 1.65,
                  color: "#475569",
                  maxWidth: "72ch",
                }}
              >
                This repo now owns backoffice authentication and the early admin shell. The remaining screens will land in
                controlled extraction waves.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gap: "14px",
                minWidth: "280px",
                maxWidth: "360px",
                width: "100%",
              }}
            >
              <div
                style={{
                  borderRadius: "22px",
                  border: "1px solid rgba(148,163,184,0.24)",
                  background: "rgba(255,255,255,0.92)",
                  padding: "18px",
                  boxShadow: "0 18px 48px rgba(15,23,42,0.06)",
                }}
              >
                <div style={eyebrowStyle}>Signed In As</div>
                <div style={valueStyle}>{loggedInAs || "Unknown"}</div>
                <div style={{ ...eyebrowStyle, marginTop: "16px" }}>Role</div>
                <div style={valueStyle}>{role}</div>
                <div style={{ ...eyebrowStyle, marginTop: "16px" }}>Brand Scope</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                  {brands.length ? (
                    brands.map((brand) => (
                      <span key={brand} style={brandChipStyle}>
                        {brand}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#64748b", fontSize: "0.92rem" }}>No brands assigned</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <AdminSignOutButton />
              </div>
            </div>
          </section>

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
  marginTop: "6px",
  fontSize: "0.98rem",
  fontWeight: 700,
  color: "#0f172a",
};

const brandChipStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.82rem",
  fontWeight: 700,
};
