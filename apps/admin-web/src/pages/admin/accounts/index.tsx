import type { GetServerSideProps } from "next";

const AccountsIndexPage = () => null;
export default AccountsIndexPage;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/accounts/staff",
      permanent: false,
    },
  };
};
