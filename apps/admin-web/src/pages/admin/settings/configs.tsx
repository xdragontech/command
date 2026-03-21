import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type ConfigsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function ConfigsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Configs"
      sectionLabel="Settings / Configs"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="settings"
    >
      <AdminCard title="Configs" description="Operational runtime diagnostics remain in xdragon-site for now, but the destination is established here in command.">
        <AdminPlaceholderNotice
          title="Config diagnostics pending"
          body="This page will eventually own the command runtime diagnostics and installation-level configuration visibility. For now it preserves the route structure while the security page is the first migrated settings screen."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ConfigsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/settings/configs",
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
