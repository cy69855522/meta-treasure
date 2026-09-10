import type { NextConfig } from "next";
import os from "node:os";

/** Collect LAN IPv4s so phone/tablet can load /_next/* in `next dev`. */
function localDevOrigins(): string[] {
  const origins = new Set<string>(["127.0.0.1", "localhost"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      origins.add(entry.address);
    }
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevOrigins(),
  // Bottom-left "N" badge sits on top of mobile chrome (+ / menu) and steals taps.
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
