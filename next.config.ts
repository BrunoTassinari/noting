import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app é quase todo interativo depois do login (sessão via cookie do
  // Supabase). Mantemos Cache Components desligado por simplicidade.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
