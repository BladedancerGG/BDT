import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    // Version affichée dans « À propos », tenue par package.json
    NEXT_PUBLIC_APP_VERSION: version,
  },
  images: {
    // Les icônes des objets Destiny sont servies depuis bungie.net
    remotePatterns: [{ protocol: "https", hostname: "www.bungie.net" }],
  },
};

export default withNextIntl(nextConfig);