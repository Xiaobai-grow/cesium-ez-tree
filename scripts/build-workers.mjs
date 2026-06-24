import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist/workers", { recursive: true });

await build({
  entryPoints: {
    createEzTreeInstanceAttributes:
      "src/workers/createEzTreeInstanceAttributes.js",
    createEzTreeVegetationInstances:
      "src/workers/createEzTreeVegetationInstances.js",
  },
  outdir: "dist/workers",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});
