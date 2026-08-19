import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "static-app",
  publicDir: "../public",
  base: process.env.PAGES_BASE_PATH || "/make-it-in-time/",
  plugins: [react()],
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
  },
});
