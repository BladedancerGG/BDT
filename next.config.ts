import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Les icônes des objets Destiny sont servies depuis bungie.net
    remotePatterns: [{ protocol: "https", hostname: "www.bungie.net" }],
  },
};

export default withNextIntl(nextConfig);