import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root to this project. Without this, Next found a stray
  // package-lock.json one level up (Desktop) and guessed the wrong root.
  turbopack: {
    root: __dirname,
  },
  /* config options here */
  reactStrictMode: false,
  // Gzip-compresses HTML/CSS/JS/API responses served by the Node server
  // (this is Next's default, set explicitly so it can't be silently
  // disabled by a future config change). Brotli/edge caching still needs a
  // CDN or reverse proxy in front — this only covers origin compression.
  compress: true,
  images: {
    // Serve any next/image usage (patient photos, uploaded documents) as
    // modern formats instead of the original JPEG/PNG when the browser
    // supports it.
    formats: ["image/avif", "image/webp"],
  },
  allowedDevOrigins: [
    "http://21.0.10.188:81",
    "http://21.0.10.188:3000",
    "https://*.space-z.ai",
    "http://*.space-z.ai",
  ],
  // The marketing landing page now lives at "/" itself (see src/app/page.tsx)
  // — old links/bookmarks to /landing get a permanent redirect instead of a
  // second, duplicate-content copy of the same page.
  async redirects() {
    return [
      {
        source: "/landing",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // HTTPS is already enforced at the nginx reverse proxy; this adds
          // the same guarantee at the application layer so a proxy
          // misconfiguration can't silently start serving the app over
          // plain HTTP again.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
