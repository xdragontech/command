import type { CSSProperties } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { mutedPanelStyle, panelStyle } from "../../../components/adminScheduling";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type ReportsEventsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function ReportsEventsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Reports / Events"
      sectionLabel="Reports / Events"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="reports"
    >
      <AdminCard title="Events">
        <section style={panelStyle}>
          <div style={placeholderTitleStyle}>Event reports are not implemented yet.</div>
          <div style={{ ...mutedPanelStyle, marginTop: "14px" }}>
            This page is reserved for event reporting. The page shell, navigation ownership, and route are now in place so the reporting work can be added without changing the Reports structure again.
          </div>
        </section>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ReportsEventsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/reports/events",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

const placeholderTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 800,
  color: "var(--admin-text-primary)",
};
