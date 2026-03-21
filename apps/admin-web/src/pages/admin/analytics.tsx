import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../server/backofficeAuth";

type AnalyticsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function AnalyticsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Analytics"
      sectionLabel="Analytics"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="analytics"
    >
      <AdminCard title="Analytics" description="Analytics will move after the shared admin shell and core operational settings are stable in command.">
        <AdminPlaceholderNotice
          title="Analytics not migrated yet"
          body="This route exists so the new admin app has a coherent navigation tree. The analytics implementation remains in xdragon-site until a later extraction wave."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<AnalyticsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/analytics",
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
