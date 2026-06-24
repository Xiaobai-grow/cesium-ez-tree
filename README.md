# cesium-ez-tree

[![CI](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml)
[![Pages](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml)
[![npm version](https://img.shields.io/npm/v/cesium-ez-tree.svg)](https://www.npmjs.com/package/cesium-ez-tree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`cesium-ez-tree` is a CesiumJS procedural vegetation primitive for rendering
instanced trees, grass, flowers, and rocks.

This project is inspired by and partially derived from Daniel Greenheck's
[EZ-Tree](https://github.com/dgreenheck/ez-tree). EZ-Tree is a Three.js
procedural tree generator; this package adapts the idea for CesiumJS primitives,
instancing, Cesium render commands, Cesium worker scheduling, and geospatial
placement.

Live example: https://xiaobai-grow.github.io/cesium-ez-tree/

## Compatibility

The first release targets CesiumJS `1.141.x` and `@cesium/engine` `25.x`.

This package imports Cesium engine internal `Source/*` modules such as
`Renderer/Buffer`, `Renderer/DrawCommand`, `Scene/DracoLoader`, and
`Core/TaskProcessor`. Treat `cesium@1.141.x` and `@cesium/engine@25.x` as
required peer dependencies. Future Cesium versions may work, but they are not
promised until tested.

## Install

```bash
npm i cesium-ez-tree cesium@1.141 @cesium/engine@25
```

The canonical package is published on npm as `cesium-ez-tree`. GitHub Releases
also publish a GitHub Packages mirror as `@xiaobai-grow/cesium-ez-tree` so the
repository Packages panel and each Release stay connected:

```bash
npm i @xiaobai-grow/cesium-ez-tree --registry=https://npm.pkg.github.com
```

## Asset And Worker Setup

The package includes runtime assets under `assets/` and worker bundles under
`dist/workers/` after `npm run build`.

For applications, copy these folders to a public static path and configure the
library before creating primitives:

```js
import { configureEzTree } from "cesium-ez-tree";

configureEzTree({
  assetBaseUrl: "/cesium-ez-tree/assets/",
  workerBaseUrl: "/cesium-ez-tree/workers/",
});
```

If your app cannot serve custom worker files yet, disable workers. The library
will still run, but large instance sets may take longer to generate or pack:

```js
configureEzTree({
  assetBaseUrl: "/cesium-ez-tree/assets/",
  useWorkers: false,
});
```

## Basic Usage

```js
import * as Cesium from "cesium";
import {
  EzTreePrimitive,
  configureEzTree,
} from "cesium-ez-tree";

configureEzTree({
  assetBaseUrl: "/cesium-ez-tree/assets/",
  workerBaseUrl: "/cesium-ez-tree/workers/",
});

const center = Cesium.Cartesian3.fromDegrees(-122.38985, 37.61864, 16.0);
const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);

const instances = await EzTreePrimitive.createVegetationInstancesAsync({
  width: 420,
  depth: 320,
  seed: 12,
  treeDensity: 18,
  grassDensity: 650,
  flowerDensity: 45,
  rockDensity: 8,
  treeScale: 0.58,
});

viewer.scene.primitives.add(
  new EzTreePrimitive({
    modelMatrix,
    instances,
    windStrength: 0.1,
    windFrequency: 0.8,
    windScale: 85,
    roundedLeafNormals: true,
    maximumGrassDistance: 800,
    maximumFlowerDistance: 600,
    maximumRockDistance: 1800,
  }),
);
```

For compatibility with old Sandcastle-style examples, you can also attach the
API to a Cesium namespace:

```js
import * as Cesium from "cesium";
import { installEzTree } from "cesium-ez-tree";

installEzTree(Cesium);

const primitive = new Cesium.EzTreePrimitive({ instances });
```

## Main API

- `configureEzTree(options)`: set `assetBaseUrl`, `workerBaseUrl`, explicit
  `workerUrls`, or `useWorkers`.
- `EzTreePrimitive`: Cesium primitive that renders procedural vegetation.
- `EzTreePrimitive.createVegetationInstances(options)`: synchronous instance
  generation.
- `EzTreePrimitive.createVegetationInstancesAsync(options)`: worker-backed
  generation with synchronous fallback.
- `EzTreeOptions`, `EzTreeGenerator`, `generateTreeGeometry(options)`: lower
  level tree option and geometry helpers.
- `TreePreset` / `loadEzTreePreset(name)`: built-in tree presets such as
  `Oak Medium`, `Pine Medium`, `Aspen Medium`, and `Bush 2`.

## Development

```bash
npm install
npm run test
npm run build
npm run build:pages
npm run dev
npm run pack:dry-run
```

`npm run dev` starts the standalone Vite example in `examples/basic`.
Open it at `http://127.0.0.1:5173/examples/basic/`.

## CI/CD

GitHub Actions runs CI on pushes and pull requests targeting `main`:

```bash
npm ci
npm test
npm run build
npm run build:pages
npm run pack:dry-run
```

Publishing is handled by the `Release` workflow when a GitHub Release is
published or a `v*` tag is pushed. The release tag must match `package.json`,
for example `v0.1.1` for package version `0.1.1`. The workflow skips publishing
if that exact version is already available on npm.

After publishing, the workflow creates or updates the matching GitHub Release
and writes a managed package-status block that links the Release, npm package,
GitHub Packages mirror, install commands, tarball metadata, and live demo.

To enable npm publishing from GitHub Actions, add a repository secret named
`NPM_TOKEN` with publish permission for this package. Use an npm granular access
token with `Read and write` permission and 2FA bypass enabled, or an npm
automation token.

The `Pages` workflow deploys the standalone example to GitHub Pages:

```text
https://xiaobai-grow.github.io/cesium-ez-tree/
```

## Versioning

This package uses SemVer.

- Patch releases: bug fixes, documentation, asset packaging fixes.
- Minor releases: new options, new presets, performance improvements, tested
  compatibility with additional Cesium versions.
- Major releases: public API changes or a required Cesium major/minor upgrade
  that breaks existing consumers.

Release checklist:

```bash
npm run test
npm run build
npm run pack:dry-run
npm version patch
git push --follow-tags
```

Then create and publish a GitHub Release for the pushed tag, or just push a
`v*` tag. The CD workflow will publish the package to npm when the version is
not already published, then sync the GitHub Release body with npm metadata.

Suggested GitHub repository About settings:

```text
Description: Procedural EzTree vegetation primitives for CesiumJS.
Website: https://xiaobai-grow.github.io/cesium-ez-tree/
Topics: cesium, cesiumjs, eztree, vegetation, procedural-generation, instancing, webgl, npm-package
```

## Attribution

- EZ-Tree: https://github.com/dgreenheck/ez-tree
- CesiumJS: https://github.com/CesiumGS/cesium
- Asset attribution details are kept in `NOTICE.md` and the README files inside
  `assets/`.

## License

MIT. See `LICENSE` and `NOTICE.md`.
