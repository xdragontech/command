import type { GetServerSideProps } from "next";

const HomePage = () => null;
export default HomePage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin",
      permanent: false,
    },
  };
};
