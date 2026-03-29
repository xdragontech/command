import type { GetServerSideProps } from "next";

const ReportsIndexPage = () => null;
export default ReportsIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/reports/leads",
      permanent: false,
    },
  };
};
