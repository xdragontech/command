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

type BackofficeThemePreference = "light" | "dark";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "command-admin-sidebar-collapsed";
const THEME_STORAGE_KEY = "command-admin-theme";

export function AdminLayout({ title, sectionLabel, active, loggedInAs, role, brands, children }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<BackofficeThemePreference>("light");
  const [themeSaving, setThemeSaving] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") {
        setTheme(stored);
      }
    } catch {
      // Ignore browser storage failures and rely on the stored user preference.
    }

    void (async () => {
      try {
        const response = await fetch("/api/admin/preferences/theme");
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) return;
        const nextTheme = payload.theme === "dark" ? "dark" : "light";
        if (!cancelled) {
          setTheme(nextTheme);
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
          } catch {
            // Ignore browser storage failures.
          }
        }
      } catch {
        // Ignore theme bootstrap failures and keep the local/default theme.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore browser storage failures.
    }
  }, [theme]);

  async function toggleTheme() {
    const nextTheme: BackofficeThemePreference = theme === "dark" ? "light" : "dark";
    const previousTheme = theme;
    setTheme(nextTheme);
    setThemeSaving(true);

    try {
      const response = await fetch("/api/admin/preferences/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to save theme preference");
      }
      const savedTheme = payload.theme === "dark" ? "dark" : "light";
      setTheme(savedTheme);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, savedTheme);
      } catch {
        // Ignore browser storage failures.
      }
    } catch {
      setTheme(previousTheme);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, previousTheme);
      } catch {
        // Ignore browser storage failures.
      }
    } finally {
      setThemeSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style jsx global>{`
        .command-admin-shell[data-theme="dark"] {
          color-scheme: dark;
        }

        .command-admin-shell[data-theme="dark"] input,
        .command-admin-shell[data-theme="dark"] select,
        .command-admin-shell[data-theme="dark"] textarea {
          background: var(--admin-input-bg) !important;
          color: var(--admin-text-primary) !important;
          border-color: var(--admin-border-strong) !important;
        }

        .command-admin-shell[data-theme="dark"] input::placeholder,
        .command-admin-shell[data-theme="dark"] textarea::placeholder {
          color: var(--admin-text-muted) !important;
        }

        .command-admin-shell[data-theme="dark"] table {
          background: transparent !important;
          color: var(--admin-text-primary) !important;
        }

        .command-admin-shell[data-theme="dark"] th,
        .command-admin-shell[data-theme="dark"] td {
          border-color: var(--admin-border-subtle) !important;
          color: var(--admin-text-primary) !important;
        }

        .command-admin-shell[data-theme="dark"] thead tr {
          background: var(--admin-surface-secondary) !important;
          color: var(--admin-text-secondary) !important;
        }

        .command-admin-shell[data-theme="dark"] code {
          background: var(--admin-surface-secondary) !important;
          color: var(--admin-text-primary) !important;
        }

        .command-admin-shell[data-theme="dark"] button:disabled,
        .command-admin-shell[data-theme="dark"] input:disabled,
        .command-admin-shell[data-theme="dark"] select:disabled,
        .command-admin-shell[data-theme="dark"] textarea:disabled {
          opacity: 0.72;
        }
      `}</style>

      <div
        className="command-admin-shell"
        data-theme={theme}
        style={{
          ...themeVariables(theme),
          minHeight: "100vh",
          background: "var(--admin-page-bg)",
          color: "var(--admin-text-primary)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <header
          style={{
            width: "100%",
            background: "var(--admin-header-bg)",
            borderBottom: "1px solid var(--admin-header-border)",
            boxShadow: "var(--admin-header-shadow)",
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
                <div
                  style={{
                    background: theme === "dark" ? "#ffffff" : "transparent",
                    borderRadius: theme === "dark" ? "10px" : 0,
                    padding: theme === "dark" ? "6px 8px" : 0,
                  }}
                >
                  <img src="/logo.png" alt="X Dragon logo" style={{ height: "49px", width: "auto", display: "block" }} />
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontFamily: "Orbitron, ui-sans-serif, system-ui",
                    fontSize: "1.5rem",
                    fontWeight: 600,
                    lineHeight: 1,
                    color: "var(--admin-text-primary)",
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
                  color: "var(--admin-text-secondary)",
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
              <button
                type="button"
                onClick={() => void toggleTheme()}
                disabled={themeSaving}
                style={themeToggleStyle(theme)}
              >
                <ThemeIcon theme={theme} />
                <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </button>
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
  color: "var(--admin-text-secondary)",
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
  border: "0.75px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-primary)",
  color: "var(--admin-text-primary)",
  cursor: "pointer",
  boxShadow: "var(--admin-floating-shadow)",
};

function themeToggleStyle(theme: BackofficeThemePreference): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "12px",
    border: "1px solid var(--admin-border-subtle)",
    background: theme === "dark" ? "var(--admin-surface-secondary)" : "var(--admin-surface-primary)",
    color: "var(--admin-text-primary)",
    padding: "8px 12px",
    fontSize: "0.84rem",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function themeVariables(theme: BackofficeThemePreference): CSSProperties {
  const dark = theme === "dark";

  return {
    "--admin-page-bg": dark ? "#020617" : "#f8fafc",
    "--admin-header-bg": dark ? "#111827" : "#ffffff",
    "--admin-header-border": dark ? "rgba(51,65,85,0.72)" : "rgba(148,163,184,0.18)",
    "--admin-header-shadow": dark ? "0 1px 0 rgba(15,23,42,0.24)" : "0 1px 0 rgba(15,23,42,0.02)",
    "--admin-surface-primary": dark ? "#111827" : "#ffffff",
    "--admin-surface-secondary": dark ? "#1f2937" : "#f8fafc",
    "--admin-surface-tertiary": dark ? "#0f172a" : "#e2e8f0",
    "--admin-input-bg": dark ? "#0f172a" : "#ffffff",
    "--admin-text-primary": dark ? "#e5e7eb" : "#0f172a",
    "--admin-text-secondary": dark ? "#cbd5e1" : "#475569",
    "--admin-text-muted": dark ? "#94a3b8" : "#64748b",
    "--admin-border-subtle": dark ? "rgba(71,85,105,0.74)" : "rgba(148,163,184,0.24)",
    "--admin-border-strong": dark ? "rgba(100,116,139,0.85)" : "rgba(148,163,184,0.34)",
    "--admin-shadow-card": dark ? "0 20px 48px rgba(2,6,23,0.45)" : "0 24px 60px rgba(15,23,42,0.08)",
    "--admin-floating-shadow": dark ? "0 12px 28px rgba(2,6,23,0.48)" : "0 10px 28px rgba(15,23,42,0.05)",
    "--admin-nav-bg": dark ? "#111827" : "#e2e8f0",
    "--admin-nav-text": dark ? "#e5e7eb" : "#0f172a",
    "--admin-nav-active-bg": dark ? "#dc2626" : "#0f172a",
    "--admin-nav-active-text": "#ffffff",
    "--admin-nav-subtle-bg": dark ? "#1f2937" : "#f1f5f9",
    "--admin-nav-sub-text": dark ? "#dbe4ef" : "#334155",
    "--admin-nav-sub-active-bg": "#dc2626",
    "--admin-nav-sub-active-text": "#ffffff",
    "--admin-nav-pinned-bg": dark ? "#334155" : "#cbd5e1",
    "--admin-nav-disabled-bg": dark ? "#1e293b" : "#e2e8f0",
    "--admin-nav-disabled-text": dark ? "#94a3b8" : "#64748b",
    "--admin-flyout-bg": dark ? "#0f172a" : "#ffffff",
    "--admin-button-strong-bg": dark ? "#dc2626" : "#0f172a",
    "--admin-button-strong-text": "#ffffff",
    "--admin-button-strong-border": dark ? "rgba(239,68,68,0.32)" : "rgba(15,23,42,0.18)",
    "--admin-muted-bg": dark ? "#111827" : "#f8fafc",
    "--admin-muted-border": dark ? "rgba(100,116,139,0.7)" : "rgba(148,163,184,0.4)",
    "--admin-muted-text": dark ? "#94a3b8" : "#64748b",
    "--admin-info-bg": dark ? "#0f172a" : "#f8fafc",
    "--admin-info-border": dark ? "rgba(59,130,246,0.24)" : "rgba(148,163,184,0.22)",
    "--admin-info-text": dark ? "#cbd5e1" : "#475569",
    "--admin-error-bg": dark ? "#331517" : "#fef2f2",
    "--admin-error-border": dark ? "rgba(248,113,113,0.28)" : "rgba(239,68,68,0.2)",
    "--admin-error-text": dark ? "#fecaca" : "#991b1b",
    "--admin-success-bg": dark ? "#12251a" : "#f0fdf4",
    "--admin-success-border": dark ? "rgba(34,197,94,0.28)" : "rgba(34,197,94,0.2)",
    "--admin-success-text": dark ? "#bbf7d0" : "#166534",
    "--admin-warning-bg": dark ? "#2b1b10" : "#fff7ed",
    "--admin-warning-border": dark ? "rgba(249,115,22,0.3)" : "rgba(249,115,22,0.18)",
    "--admin-warning-text": dark ? "#fed7aa" : "#9a3412",
    "--admin-pill-success-bg": dark ? "#123223" : "#dcfce7",
    "--admin-pill-success-text": dark ? "#bbf7d0" : "#166534",
    "--admin-pill-warning-bg": dark ? "#3a2812" : "#fef3c7",
    "--admin-pill-warning-text": dark ? "#fed7aa" : "#92400e",
    "--admin-pill-danger-bg": dark ? "#3f1d20" : "#fee2e2",
    "--admin-pill-danger-text": dark ? "#fecaca" : "#991b1b",
    "--admin-pill-subtle-bg": dark ? "#334155" : "#e2e8f0",
    "--admin-pill-subtle-text": dark ? "#e2e8f0" : "#475569",
    "--admin-pill-slate-bg": dark ? "#1f2937" : "#e2e8f0",
    "--admin-pill-slate-text": dark ? "#f8fafc" : "#0f172a",
  } as CSSProperties;
}

function ThemeIcon({ theme }: { theme: BackofficeThemePreference }) {
  if (theme === "dark") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2" />
        <path d="M12 19.3v2.2" />
        <path d="m4.9 4.9 1.6 1.6" />
        <path d="m17.5 17.5 1.6 1.6" />
        <path d="M2.5 12h2.2" />
        <path d="M19.3 12h2.2" />
        <path d="m4.9 19.1 1.6-1.6" />
        <path d="m17.5 6.5 1.6-1.6" />
      </svg>
    );
  }

  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

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
