import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { CSSProperties } from "react";
import { AdminPlaceholderShell } from "../../components/AdminPlaceholderShell";
import { requireBackofficePage } from "../../server/backofficeAuth";

type LibraryProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function LibraryPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AdminPlaceholderShell
      title="Library"
      subtitle="This is the first protected destination in command/admin-web while the broader library UI is still being extracted."
      principal={principal}
      role={role}
      brands={brands}
    >
      <h2 style={headingStyle}>Protected admin shell is active</h2>
      <p style={bodyStyle}>
        Your backoffice session, role, and brand scope are now being resolved inside the <strong>command</strong> repo.
        The actual library screens will replace this stub in the next extraction waves.
      </p>
    </AdminPlaceholderShell>
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
