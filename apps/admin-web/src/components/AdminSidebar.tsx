import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type AdminSidebarProps = {
  active: "dashboard" | "accounts" | "library" | "leads" | "analytics" | "settings" | "scheduling";
  collapsed: boolean;
};

type NavSection = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  active: boolean;
  children: NavChild[];
};

type NavChild = {
  label: string;
  href?: string;
  active?: boolean;
  disabled?: boolean;
};

type IconName =
  | "dashboard"
  | "accounts"
  | "leads"
  | "analytics"
  | "scheduling"
  | "library"
  | "settings";

export function AdminSidebar({ active, collapsed }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = router.pathname;
  const asideRef = useRef<HTMLElement | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [pinnedSectionId, setPinnedSectionId] = useState<string | null>(null);

  const sections = useMemo<NavSection[]>(() => {
    return [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: "dashboard",
        active: active === "dashboard",
        children: [],
      },
      {
        id: "accounts",
        label: "Accounts",
        href: "/admin/accounts/staff",
        icon: "accounts",
        active: active === "accounts",
        children: [
          {
            label: "Staff Accts",
            href: "/admin/accounts/staff",
            active: pathname === "/admin/accounts/staff" || pathname === "/admin/accounts",
          },
          {
            label: "Client Accts",
            href: "/admin/accounts/clients",
            active: pathname === "/admin/accounts/clients",
          },
          {
            label: "Vendors",
            disabled: true,
          },
          {
            label: "Entertainment",
            disabled: true,
          },
          {
            label: "Sponsors",
            disabled: true,
          },
        ],
      },
      {
        id: "leads",
        label: "Leads",
        href: "/admin/leads",
        icon: "leads",
        active: active === "leads",
        children: [],
      },
      {
        id: "analytics",
        label: "Analytics",
        href: "/admin/analytics",
        icon: "analytics",
        active: active === "analytics",
        children: [],
      },
      {
        id: "scheduling",
        label: "Event Mgmt",
        href: "/admin/scheduling/calendar",
        icon: "scheduling",
        active: active === "scheduling",
        children: [
          {
            label: "Calendar",
            href: "/admin/scheduling/calendar",
            active: pathname === "/admin/scheduling/calendar" || pathname === "/admin/scheduling",
          },
          {
            label: "Events",
            href: "/admin/scheduling/series",
            active: pathname === "/admin/scheduling/series",
          },
          {
            label: "Resources",
            href: "/admin/scheduling/resources",
            active: pathname === "/admin/scheduling/resources",
          },
          {
            label: "Participants",
            href: "/admin/scheduling/participants",
            active: pathname === "/admin/scheduling/participants",
          },
          {
            label: "Planner",
            href: "/admin/scheduling/planner",
            active: pathname === "/admin/scheduling/planner",
          },
          {
            label: "Assignments",
            href: "/admin/scheduling/assignments",
            active: pathname === "/admin/scheduling/assignments",
          },
          {
            label: "Conflicts",
            href: "/admin/scheduling/conflicts",
            active: pathname === "/admin/scheduling/conflicts",
          },
        ],
      },
      {
        id: "library",
        label: "Library",
        href: "/admin/library/prompts",
        icon: "library",
        active: active === "library",
        children: [
          {
            label: "Prompts",
            href: "/admin/library/prompts",
            active: pathname === "/admin/library/prompts" || pathname === "/admin/library",
          },
          {
            label: "Guides",
            href: "/admin/library/guides",
            active: pathname === "/admin/library/guides",
          },
          {
            label: "Articles",
            href: "/admin/library/articles",
            active: pathname === "/admin/library/articles",
          },
        ],
      },
      {
        id: "settings",
        label: "Settings",
        href: "/admin/settings/security",
        icon: "settings",
        active: active === "settings",
        children: [
          {
            label: "Brands",
            href: "/admin/settings/brands",
            active: pathname === "/admin/settings/brands",
          },
          {
            label: "Configs",
            href: "/admin/settings/configs",
            active: pathname === "/admin/settings/configs" || pathname === "/admin/settings",
          },
          {
            label: "Security",
            href: "/admin/settings/security",
            active: pathname === "/admin/settings/security",
          },
        ],
      },
    ];
  }, [active, pathname]);

  useEffect(() => {
    setHoveredSectionId(null);
    if (!collapsed) {
      setPinnedSectionId(null);
    }
  }, [collapsed, pathname]);

  useEffect(() => {
    if (!pinnedSectionId) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!asideRef.current?.contains(event.target as Node)) {
        setPinnedSectionId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [pinnedSectionId]);

  return (
    <aside
      ref={asideRef}
      style={{
        display: "grid",
        alignSelf: "start",
        minWidth: 0,
      }}
    >
      {collapsed ? (
        <nav
          style={{
            display: "grid",
            gap: "8px",
            justifyItems: "center",
          }}
        >
          {sections.map((section) => {
            const isPanelOpen = (pinnedSectionId || hoveredSectionId) === section.id;

            return (
              <div
                key={section.id}
                style={{ position: "relative" }}
                onMouseEnter={() => {
                  if (!pinnedSectionId) {
                    setHoveredSectionId(section.id);
                  }
                }}
                onMouseLeave={() => {
                  if (!pinnedSectionId) {
                    setHoveredSectionId((current) => (current === section.id ? null : current));
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPinnedSectionId((current) => (current === section.id ? null : section.id));
                    setHoveredSectionId(section.id);
                  }}
                  aria-label={section.label}
                  style={collapsedRailButtonStyle(section.active, pinnedSectionId === section.id)}
                >
                  <NavIcon name={section.icon} />
                </button>

                {isPanelOpen ? (
                  <div style={flyoutPanelStyle}>
                    <div style={flyoutPanelInnerStyle}>
                      <MainNavLink href={section.href} active={section.active} icon={section.icon}>
                        {section.label}
                      </MainNavLink>

                      {section.children.length ? (
                        <div style={{ display: "grid", gap: "8px", paddingLeft: "10px" }}>
                          {section.children.map((child) =>
                            child.href ? (
                              <SubNavLink key={child.label} href={child.href} active={Boolean(child.active)}>
                                {child.label}
                              </SubNavLink>
                            ) : (
                              <span key={child.label} style={disabledSubNavStyle}>
                                {child.label}
                              </span>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      ) : (
        <nav
          style={{
            display: "grid",
            gap: "10px",
          }}
        >
          {sections.map((section) => (
            <div key={section.id} style={{ display: "grid", gap: "8px" }}>
              <MainNavLink href={section.href} active={section.active} icon={section.icon}>
                {section.label}
              </MainNavLink>

              {section.active && section.children.length ? (
                <div style={{ display: "grid", gap: "8px", paddingLeft: "10px" }}>
                  {section.children.map((child) =>
                    child.href ? (
                      <SubNavLink key={child.label} href={child.href} active={Boolean(child.active)}>
                        {child.label}
                      </SubNavLink>
                    ) : (
                      <span key={child.label} style={disabledSubNavStyle}>
                        {child.label}
                      </span>
                    )
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      )}
    </aside>
  );
}

function MainNavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        textDecoration: "none",
        padding: "10px 8px",
        background: "transparent",
        color: active ? "var(--admin-nav-accent-text)" : "var(--admin-nav-text)",
        fontWeight: 700,
        fontSize: "0.95rem",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          flexShrink: 0,
        }}
      >
        <NavIcon name={icon} />
      </span>
      <span>{children}</span>
    </Link>
  );
}

function SubNavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        padding: "8px 10px",
        background: "transparent",
        color: active ? "var(--admin-nav-accent-text)" : "var(--admin-nav-sub-text)",
        fontWeight: 700,
        fontSize: "0.82rem",
      }}
    >
      {children}
    </Link>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
          <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
          <rect x="3.5" y="12" width="7" height="8.5" rx="1.5" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="3" />
          <path d="M4.5 18.5c1.1-2.7 7-2.7 8.9 0" />
          <circle cx="17.5" cy="10.5" r="2.2" />
          <path d="M15.7 17.9c1-.9 2.4-1.4 3.8-1.4.4 0 .8 0 1.2.1" />
        </svg>
      );
    case "leads":
      return (
        <svg {...commonProps}>
          <path d="M5 5.5h14v11H9l-4 3v-14Z" />
          <path d="M8.5 9h7" />
          <path d="M8.5 12h5" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...commonProps}>
          <path d="M4.5 20V11" />
          <path d="M10 20V7" />
          <path d="M15.5 20v-5" />
          <path d="M21 20V4" />
        </svg>
      );
    case "scheduling":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
          <path d="M8 3.5v4" />
          <path d="M16 3.5v4" />
          <path d="M3.5 10h17" />
          <path d="M8 14h3" />
          <path d="M13 14h3" />
          <path d="M8 18h3" />
        </svg>
      );
    case "library":
      return (
        <svg {...commonProps}>
          <path d="M6 4.5h11a2 2 0 0 1 2 2v11.5H8a2 2 0 0 0-2 2V4.5Z" />
          <path d="M6 18h13" />
          <path d="M9.5 8.5h6" />
          <path d="M9.5 11.5h6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.1 1.1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.1-1.1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.6a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.1-1.1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.7Z" />
        </svg>
      );
  }
}

function collapsedRailButtonStyle(active: boolean, pinned: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "48px",
    height: "48px",
    border: "none",
    background: "transparent",
    color: active || pinned ? "var(--admin-nav-accent-text)" : "var(--admin-nav-text)",
    cursor: "pointer",
  };
}

const flyoutPanelStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: "calc(100% + 12px)",
  width: "240px",
  zIndex: 30,
};

const flyoutPanelInnerStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-flyout-bg)",
  boxShadow: "var(--admin-shadow-card)",
};

const disabledSubNavStyle: CSSProperties = {
  display: "block",
  padding: "8px 10px",
  background: "transparent",
  color: "var(--admin-nav-disabled-text)",
  fontWeight: 700,
  fontSize: "0.82rem",
  opacity: 0.8,
};
