import type { GetServerSideProps } from "next";
import { requireBackofficePage } from "../../../server/backofficeAuth";

export default function SchedulingIndexPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/planner" });
  if (!auth.ok) return auth.response;

  return {
    redirect: {
      destination: "/admin/scheduling/planner",
      permanent: false,
    },
  };
};
