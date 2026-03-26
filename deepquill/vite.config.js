import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      fastRefresh: false, // Disable React Fast Refresh (prevents /@react-refresh 404s when proxied)
    }),
    tailwindcss(),
  ],
  base: "/",
  server: {
    hmr: false, // Disable HMR websocket (not needed when proxied through /terminal-proxy)
  },
});
