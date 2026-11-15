import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(projectRoot, "app");

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/assets": "http://localhost:3000",
      "/data": "http://localhost:3000",
      "/motionTOword": "http://localhost:3000",
    },
  },
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(appRoot, "index.html"),
        react: resolve(appRoot, "react.html"),
      },
    },
  },
});
