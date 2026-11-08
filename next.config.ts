import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is an experimental Next.js 16 feature that makes auth
  // cookie reads require Suspense boundaries. We disable it so the standard
  // Supabase server-side auth pattern works cleanly. See docs/adr/0006.
  cacheComponents: false,
};

export default nextConfig;
