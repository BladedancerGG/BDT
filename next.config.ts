import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

const nextConfig: NextConfig = {
  // Nécessaire pour que le hot-reload fonctionne dans un conteneur Docker
  // (le montage de volume ne propage pas toujours les événements fs natifs)
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
  images: {
    // Les icônes des objets Destiny sont servies depuis bungie.net
    remotePatterns: [
      { protocol: "https", hostname: "www.bungie.net" },
    ],
  },
};

export default withNextIntl(nextConfig);
