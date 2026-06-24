import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("assets", "dist/assets", {
  recursive: true,
  force: true,
});
