import type { NextConfig } from "next";

// Static export served from GitHub Pages at
// https://jacobandrews96.github.io/Health-Accountability/
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Health-Accountability",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
