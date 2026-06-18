import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the AtomicNet backend (Hono on :8080).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080" },
  },
});
