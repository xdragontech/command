import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../server/backofficeAuth";

type LeadsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function LeadsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Leads"
      sectionLabel="Leads"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="leads"
    >
      <AdminCard title="Leads" description="Lead management remains in the legacy repo for now, but the route and shell are now owned by command.">
        <AdminPlaceholderNotice
          title="Leads migration not started"
          body="This placeholder keeps the admin route tree stable while lead workflows are still extracted. The live management views will replace it in a later wave."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<LeadsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/leads",
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
