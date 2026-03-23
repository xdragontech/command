import Head from "next/head";
import type { ReactNode } from "react";
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

const SECTION_SUMMARY: Record<AdminLayoutProps["active"], string> = {
  dashboard: "Monitor account activity and install health across the backoffice surface.",
  accounts: "Manage staff access, client records, and brand-scoped ownership without leaving the shell.",
  library: "Publish prompts, guides, and content artifacts from one reusable backoffice product.",
  leads: "Work the incoming contact and chat queue with brand visibility built into the install.",
  analytics: "Review cross-brand performance and usage patterns without relying on frontend-only reporting.",
  settings: "Control brands, security, and install-level runtime behavior from the same operational surface.",
};

function roleLabel(role: string) {
  return role === "SUPERADMIN" ? "Superadmin" : role === "STAFF" ? "Staff" : role;
}

export function AdminLayout({ title, sectionLabel, active, loggedInAs, role, brands, children }: AdminLayoutProps) {
  const brandLabel =
    brands.length === 0 ? "No brand scope" : brands.length === 1 ? brands[0] : `${brands.length} brands`;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="adminShell">
        <main className="adminFrame">
          <section className="adminHero">
            <div className="heroPrimary">
              <div className="heroEyebrowRow">
                <span className="commandBadge">Command</span>
                <span className="sectionPill">{sectionLabel}</span>
              </div>

              <h1 className="heroTitle">Backoffice Control Surface</h1>
              <p className="heroSummary">{SECTION_SUMMARY[active]}</p>

              <div className="heroMetaRow">
                <div className="heroMetaCard">
                  <div className="heroMetaLabel">Install Scope</div>
                  <div className="heroMetaValue">Multi-brand product boundary</div>
                </div>
                <div className="heroMetaCard">
                  <div className="heroMetaLabel">Current Area</div>
                  <div className="heroMetaValue">{sectionLabel}</div>
                </div>
              </div>
            </div>

            <div className="heroRail">
              <div className="identityCard">
                <div className="identityHeader">
                  <div>
                    <div className="identityLabel">Signed In As</div>
                    <div className="identityValue">{loggedInAs || "Unknown"}</div>
                  </div>
                  <span className="rolePill">{roleLabel(role)}</span>
                </div>

                <div className="identityDivider" />

                <div className="railMetricGrid">
                  <div className="railMetric">
                    <div className="railMetricLabel">Brand Scope</div>
                    <div className="railMetricValue">{brandLabel}</div>
                  </div>
                  <div className="railMetric">
                    <div className="railMetricLabel">Access Model</div>
                    <div className="railMetricValue">Server-owned sessions</div>
                  </div>
                </div>

                <div className="brandChipRow">
                  {brands.length ? (
                    brands.map((brand) => (
                      <span key={brand} className="brandChip">
                        {brand}
                      </span>
                    ))
                  ) : (
                    <span className="emptyBrands">No brands assigned</span>
                  )}
                </div>
              </div>

              <div className="railActions">
                <AdminSignOutButton />
              </div>
            </div>
          </section>

          <section className="adminBody">
            <div className="sidebarColumn">
              <AdminSidebar active={active} />
            </div>

            <div className="contentColumn">{children}</div>
          </section>
        </main>
      </div>

      <style jsx>{`
        .adminShell {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 30%),
            radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 28%),
            linear-gradient(180deg, #f8fafc 0%, #eef2ff 52%, #f8fafc 100%);
          color: #0f172a;
          font-family:
            "Avenir Next", "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif;
        }

        .adminFrame {
          margin: 0 auto;
          max-width: 1360px;
          padding: 32px 20px 80px;
        }

        .adminHero {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(300px, 360px);
          gap: 22px;
          align-items: stretch;
          margin-bottom: 24px;
        }

        .heroPrimary,
        .identityCard {
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(18px);
        }

        .heroPrimary {
          border-radius: 32px;
          padding: 30px 30px 28px;
          position: relative;
          overflow: hidden;
        }

        .heroPrimary::after {
          content: "";
          position: absolute;
          inset: auto -80px -120px auto;
          width: 260px;
          height: 260px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0));
          pointer-events: none;
        }

        .heroEyebrowRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .commandBadge,
        .sectionPill,
        .rolePill,
        .brandChip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .commandBadge {
          padding: 7px 12px;
          background: #0f172a;
          color: #f8fafc;
          font-size: 0.76rem;
          text-transform: uppercase;
        }

        .sectionPill {
          padding: 7px 12px;
          background: rgba(14, 165, 233, 0.12);
          color: #0369a1;
          font-size: 0.76rem;
          text-transform: uppercase;
        }

        .heroTitle {
          margin: 18px 0 0;
          font-size: clamp(2.15rem, 4vw, 3.4rem);
          line-height: 0.96;
          letter-spacing: -0.06em;
        }

        .heroSummary {
          margin: 16px 0 0;
          max-width: 62ch;
          color: #475569;
          font-size: 1rem;
          line-height: 1.75;
        }

        .heroMetaRow {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 24px;
        }

        .heroMetaCard {
          border-radius: 22px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(248, 250, 252, 0.9);
          padding: 16px 18px;
        }

        .heroMetaLabel,
        .identityLabel,
        .railMetricLabel {
          color: #64748b;
          font-size: 0.76rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .heroMetaValue,
        .identityValue,
        .railMetricValue {
          margin-top: 8px;
          font-size: 0.98rem;
          font-weight: 700;
          line-height: 1.45;
          color: #0f172a;
        }

        .heroRail {
          display: grid;
          gap: 16px;
          align-content: start;
        }

        .identityCard {
          border-radius: 30px;
          padding: 22px;
        }

        .identityHeader {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          justify-content: space-between;
        }

        .rolePill {
          padding: 8px 12px;
          background: rgba(217, 249, 157, 0.46);
          color: #365314;
          font-size: 0.72rem;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .identityDivider {
          height: 1px;
          background: linear-gradient(90deg, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0));
          margin: 18px 0;
        }

        .railMetricGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .railMetric {
          border-radius: 18px;
          background: rgba(248, 250, 252, 0.94);
          border: 1px solid rgba(148, 163, 184, 0.16);
          padding: 14px;
        }

        .brandChipRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .brandChip {
          padding: 7px 11px;
          background: rgba(15, 23, 42, 0.08);
          color: #0f172a;
          font-size: 0.78rem;
        }

        .emptyBrands {
          color: #64748b;
          font-size: 0.9rem;
        }

        .railActions {
          display: flex;
          justify-content: flex-end;
        }

        .adminBody {
          display: grid;
          grid-template-columns: minmax(260px, 310px) minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }

        .sidebarColumn {
          position: sticky;
          top: 20px;
          align-self: start;
        }

        .contentColumn {
          display: grid;
          gap: 18px;
          min-width: 0;
        }

        @media (max-width: 1080px) {
          .adminHero {
            grid-template-columns: 1fr;
          }

          .adminBody {
            grid-template-columns: 1fr;
          }

          .sidebarColumn {
            position: static;
          }
        }

        @media (max-width: 720px) {
          .adminFrame {
            padding: 22px 14px 56px;
          }

          .heroPrimary,
          .identityCard {
            border-radius: 24px;
            padding: 22px 20px;
          }

          .heroMetaRow,
          .railMetricGrid {
            grid-template-columns: 1fr;
          }

          .heroTitle {
            font-size: 2.3rem;
          }
        }
      `}</style>
    </>
  );
}
