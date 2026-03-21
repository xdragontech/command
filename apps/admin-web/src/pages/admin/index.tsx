import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import {
  isBackofficeSession,
  requiresBackofficeMfaChallenge,
} from "@command/core-auth-backoffice";
import { authOptions } from "../../server/authOptions";
import {
  hasVerifiedBackofficeMfaForRequest,
  resolveBackofficePostAuthDestination,
} from "../../server/backofficeAuth";

const AdminIndexPage = () => null;
export default AdminIndexPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);

  if (!isBackofficeSession(session)) {
    return {
      redirect: {
        destination: "/admin/signin",
        permanent: false,
      },
    };
  }

  const destination = resolveBackofficePostAuthDestination(session);
  if (requiresBackofficeMfaChallenge(session) && !hasVerifiedBackofficeMfaForRequest(ctx.req, session)) {
    return {
      redirect: {
        destination: `/admin/mfa?callbackUrl=${encodeURIComponent(destination)}`,
        permanent: false,
      },
    };
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
