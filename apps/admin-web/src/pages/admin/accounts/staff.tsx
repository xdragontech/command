import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type StaffProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function StaffAccountsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Staff Accounts"
      sectionLabel="Accounts / Staff"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="accounts"
    >
      <AdminCard title="Staff Accounts" description="Backoffice account management will migrate here after the admin shell and security page settle in command.">
        <AdminPlaceholderNotice
          title="Staff account UI pending"
          body="This route is established so the account area already exists in command. The current staff-account management implementation remains in xdragon-site until the next extraction wave."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<StaffProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/accounts/staff",
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
