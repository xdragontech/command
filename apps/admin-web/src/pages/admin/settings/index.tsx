import type { GetServerSideProps } from "next";

const SettingsIndexPage = () => null;
export default SettingsIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/settings/security",
      permanent: false,
    },
  };
};
