import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { AdminPlaceholderNotice } from "../../../components/AdminPlaceholderNotice";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function BrandsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminLayout
      title="Command Admin — Brands"
      sectionLabel="Settings / Brands"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="settings"
    >
      <AdminCard title="Brands" description="Brand configuration is still managed in xdragon-site until the settings stack is fully migrated.">
        <AdminPlaceholderNotice
          title="Brand management pending"
          body="The route now exists in command so the settings navigation is coherent. The live brand editor will move here after the security screen and shared layout prove stable."
        />
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<BrandsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/settings/brands",
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
