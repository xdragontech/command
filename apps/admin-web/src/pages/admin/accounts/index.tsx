import type { GetServerSideProps } from "next";
import { buildSetupRedirect, isInstallInitialized } from "../../../server/installState";

const AccountsIndexPage = () => null;
export default AccountsIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  if (!(await isInstallInitialized())) {
    return buildSetupRedirect();
  }

  return {
    redirect: {
      destination: "/admin/accounts/staff",
      permanent: false,
    },
  };
};
