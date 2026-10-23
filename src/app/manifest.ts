import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/** Installable web app (Add to Home Screen) for teachers, parents and drivers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.appName,
    short_name: brand.appName,
    description: brand.tagline,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
