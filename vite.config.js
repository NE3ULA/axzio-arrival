import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Short commit hash baked into the build so any client can show exactly
// which build it runs (same pattern as the main AXZIO app).
let buildSha = "dev";
try {
  buildSha = execSync("git rev-parse --short HEAD").toString().trim() || "dev";
} catch {
  /* no git — dev fallback */
}

// AXZIO | ARRIVAL — static SPA build. No SSR, no router; a single guided
// flow, so it works from any static host and any subpath.
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the build works from any static host and any
  // subpath (GitHub Pages project sites, file drops, etc.).
  base: "./",
  build: {
    outDir: "dist",
  },
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
});
