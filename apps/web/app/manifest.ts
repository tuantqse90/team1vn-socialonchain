import type { MetadataRoute } from "next";
import { clientConfig } from "@/configs";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: clientConfig.appName,
    short_name: clientConfig.appName,
    description: clientConfig.tagline.en,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: clientConfig.theme.accent,
    icons: [
      { src: "/brand/icon", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
