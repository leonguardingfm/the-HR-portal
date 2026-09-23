/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // proxy.ts sees every request first and buffers its body, 10 MB by
    // default. An upload cut short there reaches the action as a broken form.
    proxyClientMaxBodySize: "11mb",
    serverActions: {
      // Document uploads on screening files are capped at 10 MB
      // (lib/core/screening-documents.ts); the rest is multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
