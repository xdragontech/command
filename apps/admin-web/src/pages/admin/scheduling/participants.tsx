import type { GetServerSideProps } from "next";
import { requireBackofficePage } from "../../../server/backofficeAuth";

export default function SchedulingParticipantsRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/participants" });
  if (!auth.ok) return auth.response;

  return {
    redirect: {
      destination: "/admin/accounts/partners",
      permanent: false,
    },
  };
};
