import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const rawPort = env.PORT || process.env.PORT || "3000";
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  const publicUrl = env.PUBLIC_URL || process.env.PUBLIC_URL || "/";
  const base = publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`;

  return {
    envDir: path.resolve(import.meta.dirname, "../.."),
    base,
    plugins: [mockupPreviewPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
