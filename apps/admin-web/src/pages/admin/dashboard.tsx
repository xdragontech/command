import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { CSSProperties } from "react";
import { AdminPlaceholderShell } from "../../components/AdminPlaceholderShell";
import { requireBackofficePage } from "../../server/backofficeAuth";

type DashboardProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function DashboardPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminPlaceholderShell
      title="Dashboard"
      subtitle="The full admin UI has not been migrated into command yet. This page is the landing stub for the first extraction wave."
      principal={principal}
      role={role}
      brands={brands}
    >
      <h2 style={headingStyle}>Wave 3 migration in progress</h2>
      <p style={bodyStyle}>
        Backoffice sign-in and MFA now live in <strong>command</strong>. Dashboard modules, library management,
        accounts, settings, and analytics will move in later extraction waves.
      </p>
    </AdminPlaceholderShell>
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

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.35rem",
  lineHeight: 1.2,
};

const bodyStyle: CSSProperties = {
  margin: "14px 0 0",
  color: "#475569",
  lineHeight: 1.7,
  fontSize: "1rem",
};
