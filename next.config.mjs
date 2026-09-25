/** @type {import('next').NextConfig} */

const dev = process.env.NODE_ENV !== "production";

/**
 * Security headers on every response (26 September 2026). The portal holds
 * passports and screening files, so a page can never be framed by another
 * site, scripts and connections come only from the portal itself, and the
 * camera and location are for the portal's own pages (the officers' selfies).
 * Development adds what the dev server needs for live reloading.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
