import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type ClientProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function ClientAccountsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Client Accounts"
      sectionLabel="Accounts / Clients"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="accounts"
    >
      <AdminCard title="Client Accounts" description="External account management will move after the staff-account UI and broader admin shell are stable in command.">
        <AdminPlaceholderNotice
          title="Client account UI pending"
          body="This placeholder keeps the account route structure coherent in the new repo while the actual client-account management screens are still hosted in xdragon-site."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ClientProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/accounts/clients",
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
