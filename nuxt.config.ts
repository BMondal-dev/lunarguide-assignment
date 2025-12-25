// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/image", "@nuxt/ui", "@nuxt/scripts"],
  // Use Nuxt runtimeConfig to surface the Google Maps API key to server-side code.
  // This keeps the key out of client bundles and avoids direct `process.env` usage from server handlers.
  runtimeConfig: {
    // Private value available only on the server: set GOOGLE_MAPS_API_KEY in your environment
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    // Public runtime config (safe values you want to expose to client)
    public: {
      // add any non-sensitive runtime flags here if needed
    },
  },
});
