import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const outDir = resolve("dist-pages");
const cesiumBuildRoot = resolve("node_modules/cesium/Build/Cesium");
const ezTreeAssetsRoot = resolve("assets");

function copyDirectory(source, target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function copyPagesRuntimeAssets() {
  return {
    name: "copy-pages-runtime-assets",
    closeBundle() {
      copyDirectory(cesiumBuildRoot, resolve(outDir, "cesium"));
      copyDirectory(ezTreeAssetsRoot, resolve(outDir, "ez-tree-assets"));
      writeFileSync(resolve(outDir, ".nojekyll"), "");
    },
  };
}

export default defineConfig({
  root: "examples/basic",
  base: process.env.GITHUB_PAGES === "true" ? "/cesium-ez-tree/" : "/",
  plugins: [copyPagesRuntimeAssets()],
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 5000,
  },
});
