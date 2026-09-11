import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // API_TARGET y VITE_PORT permiten levantar varias instancias aisladas (QA, E2E).
    port: Number(process.env.VITE_PORT) || 5173,
    // IPv4 explicito: en Windows "localhost" puede resolver solo a ::1 y las
    // herramientas que llaman a 127.0.0.1 (pruebas E2E) no encuentran el servidor.
    host: process.env.VITE_HOST || "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          markdown: ["react-markdown", "remark-gfm"],
        },
      },
    },
  },
});
