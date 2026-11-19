import type { MetadataRoute } from "next";

// Makes the app installable ("Add to home screen" / "Install app"). No
// service worker on purpose: the news lives on the server, so an offline
// copy would only show stale data — and browsers no longer require one to
// offer installation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "newsScrapperAI",
    short_name: "newsScrapper",
    description: "Twój codzienny przegląd newsów z tech, AI i gier — posortowany przez AI.",
    lang: "pl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // the default (dark) theme, so the splash screen matches the first paint
    background_color: "#0f1216",
    theme_color: "#0f1216",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
