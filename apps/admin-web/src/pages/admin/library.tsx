import type { GetServerSideProps } from "next";
import { buildSetupRedirect, isInstallInitialized } from "../../server/installState";

const LibraryIndexPage = () => null;
export default LibraryIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  if (!(await isInstallInitialized())) {
    return buildSetupRedirect();
  }

  return {
    redirect: {
      destination: "/admin/library/prompts",
      permanent: false,
    },
  };
};
