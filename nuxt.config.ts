// Screenreel runs entirely in the browser (screen capture, IndexedDB, Google sign-in),
// so it's built as a static single-page app that GitHub Pages can host.
const base = process.env.NUXT_APP_BASE_URL || "/";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: false },
  css: ["~/assets/css/app.css"],

  app: {
    baseURL: base,
    head: {
      title: "Screenreel Recorder",
      htmlAttrs: { lang: "en" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "description", content: "Record your screen, computer sound and microphone, and send every recording to Google Drive." },
        { name: "theme-color", content: "#131923" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Screenreel" }
      ],
      link: [
        { rel: "manifest", href: base + "manifest.webmanifest" },
        { rel: "icon", type: "image/png", href: base + "icons/icon-192.png" },
        { rel: "apple-touch-icon", href: base + "icons/apple-touch-icon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" }
      ]
    }
  },

  // Set these at build time (NUXT_PUBLIC_GOOGLE_CLIENT_ID etc.), or in the app's Settings.
  // The GitHub workflow fills them from the repository's Actions variables.
  runtimeConfig: {
    public: {
      googleClientId: "",
      googleEmail: "",
      driveFolder: "Screenreel Recordings"
    }
  }
});
