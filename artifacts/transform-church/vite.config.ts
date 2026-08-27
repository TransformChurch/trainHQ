import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const rawPort = env.PORT || process.env.PORT || "3000";
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // Use a path-only public URL. This supports deployment at the domain root or
  // beneath a CMS-managed subpath without baking a host name into the bundle.
  const publicUrl = env.PUBLIC_URL || process.env.PUBLIC_URL || "/";
  const base = publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`;
  const frameAncestors = env.FRAME_ANCESTORS || process.env.FRAME_ANCESTORS || "'self'";

  return {
    envDir: path.resolve(import.meta.dirname, "../.."),
    base,
    plugins: [react(), tailwindcss({ optimize: false })],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      headers: {
        "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      headers: {
        "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
      },
    },
  };
});
