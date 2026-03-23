import type { GetServerSideProps } from "next";
import { SETUP_ROUTE, isInstallInitialized } from "../server/installState";

const HomePage = () => null;
export default HomePage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: (await isInstallInitialized()) ? "/admin" : SETUP_ROUTE,
      permanent: false,
    },
  };
};
