import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Clean URLs (/app, /how, /proof) in the dev server; production routing lives in the backend.
const mpaRewrites: PluginOption = {
  name: "mpa-rewrites",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === "/app") req.url = "/app.html";
      else if (req.url === "/how") req.url = "/how.html";
      else if (req.url === "/proof") req.url = "/proof.html";
      next();
    });
  },
};

// Multi-page build: `/` is the brand landing (vanilla TS + WebGL), `/app` is the React
// console, `/how` and `/proof` are static token-styled pages.
export default defineConfig({
  plugins: [react(), mpaRewrites],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080" },
  },
  build: {
    rollupOptions: {
      input: {
        index: page("./index.html"),
        app: page("./app.html"),
        how: page("./how.html"),
        proof: page("./proof.html"),
      },
    },
  },
});
