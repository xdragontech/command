import type { GetServerSideProps } from "next";
import { requireBackofficePage } from "../../../server/backofficeAuth";

export default function SchedulingIndexPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/calendar" });
  if (!auth.ok) return auth.response;

  return {
    redirect: {
      destination: "/admin/scheduling/calendar",
      permanent: false,
    },
  };
};
