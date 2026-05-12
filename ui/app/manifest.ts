import type { MetadataRoute } from "next";

// PWA manifest. The `share_target` lets you screenshot in a bank/fintech app on
// your phone, hit "Share", pick WealthFlow, and land in the upload flow with the
// image already in hand. The share POSTs multipart to /api/share-target, which
// stashes the file and redirects to /upload.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WealthFlow",
    short_name: "WealthFlow",
    description: "Your financial reality, mapped — and what to do about it.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    share_target: {
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "file", accept: ["image/*"] }],
      },
    },
  };
}
