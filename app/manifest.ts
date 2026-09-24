import type { MetadataRoute } from "next";

/**
 * Installable on a phone's home screen. On an iPhone that is what lets the
 * portal show alerts at all: Safari only delivers them to a site added to the
 * home screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leon Guarding — Workforce & Operations",
    short_name: "Leon",
    description: "Duties, book-ons, check calls and alerts for Leon Guarding officers and Control.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#1f3a5f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
