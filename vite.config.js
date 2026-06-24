import { defineConfig } from "vite";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const cesiumBuildRoot = resolve("node_modules/cesium/Build/Cesium");

const mimeTypes = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveCesiumBuild() {
  return {
    name: "serve-cesium-build",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url?.split("?")[0] ?? "";
        if (!requestUrl.startsWith("/cesium/")) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(
          requestUrl.slice("/cesium/".length),
        );
        const filePath = normalize(join(cesiumBuildRoot, relativePath));
        if (!filePath.startsWith(cesiumBuildRoot)) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }

        response.setHeader(
          "Content-Type",
          mimeTypes[extname(filePath)] ?? "application/octet-stream",
        );
        createReadStream(filePath).pipe(response);
      });
    },
  };
}

export default defineConfig({
  plugins: [serveCesiumBuild()],
  build: {
    lib: {
      entry: "src/index.js",
      formats: ["es"],
      fileName: () => "index.js",
    },
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      external: [/^(?:cesium|@cesium\/engine)(?:\/.*)?$/],
    },
  },
});
