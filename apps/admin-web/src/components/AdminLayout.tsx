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
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
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
              padding: "20px 20px 18px",
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "22px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  flexShrink: 0,
                }}
              >
                <img src="/logo.png" alt="X Dragon logo" style={{ height: "58px", width: "auto", display: "block" }} />
                <div
                  style={{
                    marginTop: "6px",
                    fontFamily: "Orbitron, ui-sans-serif, system-ui",
                    fontSize: "1.75rem",
                    fontWeight: 600,
                    lineHeight: 1,
                    color: "#111827",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Command
                </div>
              </div>

              <div
                style={{
                  minHeight: "58px",
                  display: "flex",
                  alignItems: "center",
                  color: "#4b5563",
                  fontSize: "0.98rem",
                  fontWeight: 500,
                }}
              >
                {sectionLabel}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                gap: "10px",
                flexShrink: 0,
              }}
            >
              <AdminSignOutButton />
              {loggedInAs ? <div style={loggedInStyle}>Logged in as: {loggedInAs}</div> : null}
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

const loggedInStyle: CSSProperties = {
  color: "#52525b",
  fontSize: "0.95rem",
  fontWeight: 500,
};
