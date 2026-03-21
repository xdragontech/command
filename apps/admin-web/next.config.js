/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: [
    "@command/core-auth-backoffice",
    "@command/core-brand-runtime",
    "@command/core-config",
    "@command/core-db",
  ],
};

module.exports = nextConfig;
