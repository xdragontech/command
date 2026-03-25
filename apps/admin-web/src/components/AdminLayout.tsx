import Head from "next/head";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminSignOutButton } from "./AdminSignOutButton";

type AdminLayoutProps = {
  title: string;
  sectionLabel: string;
  active: "dashboard" | "accounts" | "library" | "leads" | "analytics" | "settings" | "scheduling";
  loggedInAs: string | null;
  role: string;
  brands: string[];
  children: ReactNode;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "command-admin-sidebar-collapsed";

export function AdminLayout({ title, sectionLabel, active, loggedInAs, role, brands, children }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored === "true") {
        setSidebarCollapsed(true);
      }
    } catch {
      // Ignore browser storage failures and fall back to expanded.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
    } catch {
      // Ignore browser storage failures.
    }
  }, [sidebarCollapsed]);

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
              width: "100%",
              boxSizing: "border-box",
              padding: "17px 20px 15px",
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "18px",
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
                <img src="/logo.png" alt="X Dragon logo" style={{ height: "49px", width: "auto", display: "block" }} />
                <div
                  style={{
                    marginTop: "5px",
                    fontFamily: "Orbitron, ui-sans-serif, system-ui",
                    fontSize: "1.5rem",
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
                  minHeight: "49px",
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
                gap: "8px",
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
            width: "100%",
            boxSizing: "border-box",
            padding: "24px 20px 72px",
          }}
        >
          <section
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: sidebarCollapsed ? "72px minmax(0, 1fr)" : "220px minmax(0, 1fr)",
              alignItems: "start",
              position: "relative",
            }}
          >
            <div style={{ position: "relative", minWidth: 0 }}>
              <AdminSidebar active={active} collapsed={sidebarCollapsed} />
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                style={{
                  ...dividerToggleStyle,
                  right: "-24px",
                }}
              >
                <CollapseIcon collapsed={sidebarCollapsed} />
              </button>
            </div>

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

const dividerToggleStyle: CSSProperties = {
  position: "absolute",
  top: "10px",
  zIndex: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "29px",
  height: "29px",
  borderRadius: "9px",
  border: "0.75px solid rgba(148,163,184,0.24)",
  background: "#ffffff",
  color: "#0f172a",
  cursor: "pointer",
  boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
};

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={collapsed ? ({ transform: "scaleX(-1)" } as CSSProperties) : undefined}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
