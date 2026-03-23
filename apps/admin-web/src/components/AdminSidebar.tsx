import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

type AdminSidebarProps = {
  active: "dashboard" | "accounts" | "library" | "leads" | "analytics" | "settings";
};

type NavSection = {
  label: string;
  items: Array<{
    href: string;
    label: string;
    active: boolean;
    expanded?: boolean;
    children?: Array<{
      href?: string;
      label: string;
      active?: boolean;
      disabled?: boolean;
    }>;
  }>;
};

export function AdminSidebar({ active }: AdminSidebarProps) {
  const router = useRouter();
  const pathname = router.pathname;
  const onAccounts = pathname === "/admin/accounts" || pathname.startsWith("/admin/accounts/");
  const onLibrary = pathname === "/admin/library" || pathname.startsWith("/admin/library/");
  const onSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        {
          href: "/admin/dashboard",
          label: "Dashboard",
          active: active === "dashboard",
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          href: "/admin/accounts/staff",
          label: "Accounts",
          active: active === "accounts",
          expanded: onAccounts || active === "accounts",
          children: [
            {
              href: "/admin/accounts/staff",
              label: "Staff Accounts",
              active: pathname === "/admin/accounts/staff" || pathname === "/admin/accounts",
            },
            {
              href: "/admin/accounts/clients",
              label: "Client Accounts",
              active: pathname === "/admin/accounts/clients",
            },
            {
              label: "Partner Accounts",
              disabled: true,
            },
          ],
        },
        {
          href: "/admin/leads",
          label: "Leads",
          active: active === "leads",
        },
        {
          href: "/admin/analytics",
          label: "Analytics",
          active: active === "analytics",
        },
      ],
    },
    {
      label: "Content",
      items: [
        {
          href: "/admin/library/prompts",
          label: "Library",
          active: active === "library",
          expanded: onLibrary || active === "library",
          children: [
            {
              href: "/admin/library/prompts",
              label: "Prompts",
              active: pathname === "/admin/library/prompts" || pathname === "/admin/library",
            },
            {
              href: "/admin/library/guides",
              label: "Guides",
              active: pathname === "/admin/library/guides",
            },
            {
              href: "/admin/library/articles",
              label: "Articles",
              active: pathname === "/admin/library/articles",
            },
          ],
        },
      ],
    },
    {
      label: "Configuration",
      items: [
        {
          href: "/admin/settings/security",
          label: "Settings",
          active: active === "settings",
          expanded: onSettings || active === "settings",
          children: [
            {
              href: "/admin/settings/brands",
              label: "Brands",
              active: pathname === "/admin/settings/brands",
            },
            {
              href: "/admin/settings/configs",
              label: "Configs",
              active: pathname === "/admin/settings/configs" || pathname === "/admin/settings",
            },
            {
              href: "/admin/settings/security",
              label: "Security",
              active: pathname === "/admin/settings/security",
            },
          ],
        },
      ],
    },
  ];

  return (
    <>
      <aside className="sidebarShell">
        <div className="sidebarPanel">
          <div className="sidebarTop">
            <div className="sidebarKicker">Navigation</div>
            <div className="sidebarTitle">Admin Modules</div>
            <p className="sidebarCopy">
              Move between operational areas without losing install context or brand scope.
            </p>
          </div>

          <nav className="navStack" aria-label="Admin navigation">
            {sections.map((section) => (
              <div key={section.label} className="navSection">
                <div className="navSectionLabel">{section.label}</div>
                <div className="navSectionItems">
                  {section.items.map((item) => (
                    <div key={item.href} className="navItemBlock">
                      <NavItem href={item.href} active={item.active}>
                        {item.label}
                      </NavItem>

                      {item.expanded && item.children?.length ? (
                        <div className="subNavList">
                          {item.children.map((child) =>
                            child.disabled ? (
                              <span key={child.label} className="subNavDisabled">
                                <span>{child.label}</span>
                                <span className="soonTag">Soon</span>
                              </span>
                            ) : (
                              <SubNavItem key={child.href} href={child.href || item.href} active={Boolean(child.active)}>
                                {child.label}
                              </SubNavItem>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <style jsx>{`
        .sidebarShell {
          display: grid;
          gap: 14px;
          align-self: start;
        }

        .sidebarPanel {
          border-radius: 30px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(18px);
          overflow: hidden;
        }

        .sidebarTop {
          padding: 22px 22px 18px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.9);
          background:
            linear-gradient(180deg, rgba(248, 250, 252, 0.96) 0%, rgba(241, 245, 249, 0.84) 100%);
        }

        .sidebarKicker,
        .navSectionLabel {
          color: #64748b;
          font-size: 0.74rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .sidebarTitle {
          margin-top: 8px;
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #0f172a;
        }

        .sidebarCopy {
          margin: 10px 0 0;
          color: #475569;
          font-size: 0.9rem;
          line-height: 1.65;
        }

        .navStack {
          display: grid;
          gap: 18px;
          padding: 18px;
        }

        .navSection {
          display: grid;
          gap: 10px;
        }

        .navSectionItems,
        .navItemBlock,
        .subNavList {
          display: grid;
          gap: 8px;
        }

        .navLink {
          display: block;
          text-decoration: none;
          border-radius: 18px;
          padding: 13px 14px;
          font-size: 0.95rem;
          font-weight: 800;
          transition:
            transform 140ms ease,
            background 140ms ease,
            color 140ms ease,
            border-color 140ms ease;
        }

        .navLink:hover {
          transform: translateY(-1px);
        }

        .navLink.active {
          border: 1px solid rgba(15, 23, 42, 0.14);
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #f8fafc;
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18);
        }

        .navLink.idle {
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(248, 250, 252, 0.9);
          color: #0f172a;
        }

        .subNavList {
          padding: 4px 0 0 12px;
        }

        .subNavLink,
        .subNavDisabled {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .subNavLink {
          text-decoration: none;
          border: 1px solid rgba(148, 163, 184, 0.16);
          transition:
            background 140ms ease,
            color 140ms ease,
            transform 140ms ease;
        }

        .subNavLink:hover {
          transform: translateY(-1px);
        }

        .subNavLink.active {
          background: rgba(3, 105, 161, 0.12);
          border-color: rgba(14, 165, 233, 0.24);
          color: #075985;
        }

        .subNavLink.idle {
          background: rgba(248, 250, 252, 0.82);
          color: #334155;
        }

        .subNavDisabled {
          border: 1px dashed rgba(148, 163, 184, 0.32);
          background: rgba(241, 245, 249, 0.86);
          color: #64748b;
        }

        .soonTag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 4px 8px;
          background: rgba(148, 163, 184, 0.14);
          font-size: 0.7rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        @media (max-width: 1080px) {
          .sidebarPanel {
            border-radius: 24px;
          }

          .navStack {
            gap: 14px;
          }
        }

        @media (max-width: 720px) {
          .sidebarTop {
            padding: 18px 18px 16px;
          }

          .navStack {
            padding: 14px;
          }
        }
      `}</style>
    </>
  );
}

function NavItem({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={`navLink ${active ? "active" : "idle"}`}>
      {children}
    </Link>
  );
}

function SubNavItem({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={`subNavLink ${active ? "active" : "idle"}`}>
      {children}
    </Link>
  );
}
