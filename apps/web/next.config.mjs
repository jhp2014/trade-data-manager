/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@trade-data-manager/database"],
    logging: {
        fetches: {
            fullUrl: true,
        },
    },
};

export default nextConfig;