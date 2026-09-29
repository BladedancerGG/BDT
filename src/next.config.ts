import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "www.bungie.net" }],
  },
  devIndicators: {
    position: "bottom-right"
  }
};

export default withNextIntl(nextConfig);