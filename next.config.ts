import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.124.7"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
