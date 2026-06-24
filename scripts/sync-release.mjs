import { readFile } from "node:fs/promises";

const startMarker = "<!-- cesium-ez-tree-release-sync:start -->";
const endMarker = "<!-- cesium-ez-tree-release-sync:end -->";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const packageName = packageJson.name;
const packageVersion = packageJson.version;
const expectedTag = `v${packageVersion}`;
const releaseTag =
  process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? expectedTag;

if (releaseTag !== expectedTag) {
  throw new Error(
    `Release tag ${releaseTag} does not match package version ${packageVersion}.`,
  );
}

const repository =
  process.env.GITHUB_REPOSITORY ?? parseRepository(packageJson.repository?.url);

if (!repository) {
  throw new Error("GITHUB_REPOSITORY or package.json repository URL is required.");
}

const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) {
  throw new Error("GITHUB_TOKEN is required to sync a GitHub Release.");
}

const githubApiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
const npmPackage = await fetchNpmPackage(packageName, packageVersion);
const releaseBody = createReleaseSyncBlock({
  packageName,
  packageVersion,
  repository,
  releaseTag,
  npmPackage,
});

const existingRelease = await githubRequest(
  `/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`,
  { allowNotFound: true },
);

if (existingRelease) {
  const body = replaceManagedBlock(existingRelease.body ?? "", releaseBody);
  await githubRequest(`/repos/${repository}/releases/${existingRelease.id}`, {
    method: "PATCH",
    body: {
      name: existingRelease.name || `${packageName} ${releaseTag}`,
      body,
      prerelease: isPrerelease(packageVersion),
    },
  });
  console.log(`Updated GitHub Release ${releaseTag}.`);
} else {
  await githubRequest(`/repos/${repository}/releases`, {
    method: "POST",
    body: {
      tag_name: releaseTag,
      name: `${packageName} ${releaseTag}`,
      body: releaseBody,
      draft: false,
      prerelease: isPrerelease(packageVersion),
    },
  });
  console.log(`Created GitHub Release ${releaseTag}.`);
}

function parseRepository(repositoryUrl) {
  if (!repositoryUrl) {
    return undefined;
  }

  const match = repositoryUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?/);
  return match?.[1];
}

async function fetchNpmPackage(name, version) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to read npm package metadata: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

function createReleaseSyncBlock({
  packageName,
  packageVersion,
  repository,
  releaseTag,
  npmPackage,
}) {
  const npmUrl = `https://www.npmjs.com/package/${packageName}/v/${packageVersion}`;
  const demoUrl = `https://${repository.split("/")[0]}.github.io/${
    repository.split("/")[1]
  }/`;
  const npmStatus = npmPackage
    ? `Published on npm as [${packageName}@${packageVersion}](${npmUrl}).`
    : `Not published on npm yet. The Release workflow will publish ${packageName}@${packageVersion} when NPM_TOKEN is configured.`;
  const tarballLine = npmPackage?.dist?.tarball
    ? `- Tarball: ${npmPackage.dist.tarball}`
    : undefined;
  const integrityLine = npmPackage?.dist?.integrity
    ? `- Integrity: \`${npmPackage.dist.integrity}\``
    : undefined;

  return [
    startMarker,
    "## Package Status",
    "",
    `- GitHub Release: ${releaseTag}`,
    `- npm: ${npmStatus}`,
    `- Install: \`npm i ${packageName}@${packageVersion}\``,
    `- Demo: ${demoUrl}`,
    tarballLine,
    integrityLine,
    "",
    "This block is managed by the Release workflow so GitHub Releases and the npm package page stay linked.",
    endMarker,
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function replaceManagedBlock(existingBody, managedBlock) {
  const startIndex = existingBody.indexOf(startMarker);
  const endIndex = existingBody.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = existingBody.slice(0, startIndex).trimEnd();
    const after = existingBody.slice(endIndex + endMarker.length).trimStart();
    return [before, managedBlock, after].filter(Boolean).join("\n\n");
  }

  return [existingBody.trim(), managedBlock].filter(Boolean).join("\n\n");
}

function isPrerelease(version) {
  return version.includes("-");
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${githubApiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cesium-ez-tree-release-sync",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (options.allowNotFound && response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API request failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}
