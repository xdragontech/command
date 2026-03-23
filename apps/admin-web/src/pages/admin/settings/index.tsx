import type { GetServerSideProps } from "next";
import { buildSetupRedirect, isInstallInitialized } from "../../../server/installState";

const SettingsIndexPage = () => null;
export default SettingsIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  if (!(await isInstallInitialized())) {
    return buildSetupRedirect();
  }

  return {
    redirect: {
      destination: "/admin/settings/security",
      permanent: false,
    },
  };
};
