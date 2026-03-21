import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../server/backofficeAuth";

type DashboardProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function DashboardPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Dashboard"
      sectionLabel="Dashboard"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="dashboard"
    >
      <AdminCard
        title="Dashboard"
        description="The dashboard shell is now in command, but the operational widgets and reporting cards have not been extracted yet."
      >
        <AdminPlaceholderNotice
          title="Dashboard migration queued"
          body="This page is intentionally live but minimal. It confirms the new admin shell, route protection, and session handling are working inside command before the real dashboard modules move over."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx);
  if (!auth.ok) {
    return auth.response;
  }

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};
