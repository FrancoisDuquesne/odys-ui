export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@nuxt/icon", "@nuxt/fonts"],
  css: ["~/assets/css/main.css"],
  // Flatten components/charts/*.vue to their bare name (DispatchChart, not
  // ChartsDispatchChart) -- Nuxt's default nested-folder prefixing otherwise
  // silently breaks every <XyzChart> usage across the Results/Compare pages.
  components: [{ path: "~/components", pathPrefix: false }],
  fonts: {
    families: [
      { name: "IBM Plex Sans", provider: "google", weights: [400, 500, 600, 700] },
      { name: "IBM Plex Mono", provider: "google", weights: [400, 500, 600] },
    ],
  },
  icon: {
    collections: ["lucide"],
  },
  // "/api" itself is reserved by Nuxt modules (e.g. @nuxt/icon serves its
  // local icon bundle from "/api/_nuxt_icon") -- proxying that whole prefix
  // to the backend silently 404s icon requests. Use a distinct prefix and
  // rewrite it back to "/api" (the backend's own route prefix) on the way out.
  vite: {
    server: {
      proxy: {
        "/backend-api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/backend-api/, "/api"),
        },
      },
    },
  },
});
