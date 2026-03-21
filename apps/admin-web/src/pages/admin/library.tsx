import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../server/backofficeAuth";

type LibraryProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function LibraryPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Library"
      sectionLabel="Library"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="library"
    >
      <AdminCard
        title="Library"
        description="This is the first protected non-auth destination in command. The library modules themselves still need to be extracted."
      >
        <AdminPlaceholderNotice
          title="Library extraction pending"
          body="The command repo now owns the route, protection, and app shell for the library area. The actual prompt and guide management screens will replace this placeholder in a later wave."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<LibraryProps> = async (ctx) => {
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
