import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parent folder has its own package-lock.json; pin app root so RSC/dev resolution stays correct.
  outputFileTracingRoot: __dirname,
  // Browsers still request /favicon.ico by default; without this, many tabs only get an icon when
  // the HTML <link rel="icon" href="/icon"> is applied, so the favicon appears inconsistently.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;
