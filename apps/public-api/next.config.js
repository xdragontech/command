/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    externalDir: true,
  },
  transpilePackages: [
    "@command/core-auth-external",
    "@command/core-content",
    "@command/core-db",
    "@command/core-email",
  ],
};

module.exports = nextConfig;
