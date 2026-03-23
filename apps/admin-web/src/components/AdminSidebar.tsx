import Link from "next/link";
import { useRouter } from "next/router";
import type { CSSProperties, ReactNode } from "react";

type AdminSidebarProps = {
  active: "dashboard" | "accounts" | "library" | "leads" | "analytics" | "settings";
};

export function AdminSidebar({ active }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = router.pathname;
  const onAccounts = pathname === "/admin/accounts" || pathname.startsWith("/admin/accounts/");
  const onLibrary = pathname === "/admin/library" || pathname.startsWith("/admin/library/");
  const onSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  return (
    <aside
      style={{
        display: "grid",
        gap: "14px",
        alignSelf: "start",
      }}
    >
      <nav
        style={{
          display: "grid",
          gap: "10px",
          padding: "18px",
          borderRadius: "24px",
          border: "1px solid rgba(148,163,184,0.24)",
          background: "rgba(255,255,255,0.92)",
          boxShadow: "0 18px 48px rgba(15,23,42,0.06)",
        }}
      >
        <NavItem href="/admin/dashboard" active={active === "dashboard"}>
          Dashboard
        </NavItem>

        <div style={{ display: "grid", gap: "10px" }}>
          <NavItem href="/admin/accounts/staff" active={active === "accounts"}>
            Accounts
          </NavItem>
          {onAccounts || active === "accounts" ? (
            <div style={{ display: "grid", gap: "8px", paddingLeft: "12px" }}>
              <SubNavItem href="/admin/accounts/staff" active={pathname === "/admin/accounts/staff" || pathname === "/admin/accounts"}>
                Staff Accts
              </SubNavItem>
              <SubNavItem href="/admin/accounts/clients" active={pathname === "/admin/accounts/clients"}>
                Client Accts
              </SubNavItem>
              <span style={disabledSubNavStyle}>Partner Accts</span>
            </div>
          ) : null}
        </div>

        <NavItem href="/admin/leads" active={active === "leads"}>
          Leads
        </NavItem>

        <NavItem href="/admin/analytics" active={active === "analytics"}>
          Analytics
        </NavItem>

        <div style={{ display: "grid", gap: "10px" }}>
          <NavItem href="/admin/library/prompts" active={active === "library"}>
            Library
          </NavItem>
          {onLibrary || active === "library" ? (
            <div style={{ display: "grid", gap: "8px", paddingLeft: "12px" }}>
              <SubNavItem href="/admin/library/prompts" active={pathname === "/admin/library/prompts" || pathname === "/admin/library"}>
                Prompts
              </SubNavItem>
              <SubNavItem href="/admin/library/guides" active={pathname === "/admin/library/guides"}>
                Guides
              </SubNavItem>
              <SubNavItem href="/admin/library/articles" active={pathname === "/admin/library/articles"}>
                Articles
              </SubNavItem>
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <NavItem href="/admin/settings/security" active={active === "settings"}>
            Settings
          </NavItem>
          {onSettings || active === "settings" ? (
            <div style={{ display: "grid", gap: "8px", paddingLeft: "12px" }}>
              <SubNavItem href="/admin/settings/brands" active={pathname === "/admin/settings/brands"}>
                Brands
              </SubNavItem>
              <SubNavItem href="/admin/settings/configs" active={pathname === "/admin/settings/configs" || pathname === "/admin/settings"}>
                Configs
              </SubNavItem>
              <SubNavItem href="/admin/settings/security" active={pathname === "/admin/settings/security"}>
                Security
              </SubNavItem>
            </div>
          ) : null}
        </div>
      </nav>
    </aside>
  );
}

function NavItem({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        borderRadius: "16px",
        padding: "12px 14px",
        background: active ? "#0f172a" : "#e2e8f0",
        color: active ? "#fff" : "#0f172a",
        fontWeight: 700,
        fontSize: "0.95rem",
      }}
    >
      {children}
    </Link>
  );
}

function SubNavItem({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        borderRadius: "14px",
        padding: "10px 12px",
        background: active ? "#dc2626" : "#f1f5f9",
        color: active ? "#fff" : "#334155",
        fontWeight: 700,
        fontSize: "0.82rem",
      }}
    >
      {children}
    </Link>
  );
}

const disabledSubNavStyle: CSSProperties = {
  display: "block",
  borderRadius: "14px",
  padding: "10px 12px",
  background: "#e2e8f0",
  color: "#64748b",
  fontWeight: 700,
  fontSize: "0.82rem",
  opacity: 0.8,
};
