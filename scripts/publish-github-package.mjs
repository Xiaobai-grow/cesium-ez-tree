import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const packageJsonUrl = new URL("../package.json", import.meta.url);
const originalPackageJson = await readFile(packageJsonUrl, "utf8");
const packageJson = JSON.parse(originalPackageJson);
const repository =
  process.env.GITHUB_REPOSITORY ?? parseRepository(packageJson.repository?.url);

if (!repository) {
  throw new Error("GITHUB_REPOSITORY or package.json repository URL is required.");
}

const owner = repository.split("/")[0].toLowerCase();
const originalName = packageJson.name;
const githubPackageName = `@${owner}/${originalName}`;

packageJson.name = githubPackageName;
packageJson.publishConfig = {
  registry: "https://npm.pkg.github.com",
};

await writeFile(packageJsonUrl, `${JSON.stringify(packageJson, null, 2)}\n`);

try {
  await run("npm", [
    "publish",
    "--registry=https://npm.pkg.github.com",
    "--access",
    "public",
  ]);
  console.log(`Published ${githubPackageName}@${packageJson.version}.`);
} finally {
  await writeFile(packageJsonUrl, originalPackageJson);
}

function parseRepository(repositoryUrl) {
  if (!repositoryUrl) {
    return undefined;
  }

  const match = repositoryUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?/);
  return match?.[1];
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}.`));
      }
    });
  });
}
