import type { GetServerSideProps } from "next";

const LibraryIndexPage = () => null;
export default LibraryIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/library/prompts",
      permanent: false,
    },
  };
};
