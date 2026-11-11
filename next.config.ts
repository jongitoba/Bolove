import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

// Makes getCloudflareContext() resolve real bindings/vars (from .dev.vars)
// when running `next dev`, instead of only working under `wrangler dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
