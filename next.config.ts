import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app é quase todo interativo depois do login (sessão via cookie do
  // Supabase). Mantemos Cache Components desligado por simplicidade.
  cacheComponents: false,
  partialPrefetching: false,
  async headers() {
    return [
      {
        // O navegador precisa sempre buscar a versão nova do service worker.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
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
