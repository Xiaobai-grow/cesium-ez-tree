# cesium-ez-tree

`cesium-ez-tree` is a CesiumJS procedural vegetation primitive for rendering
instanced trees, grass, flowers, and rocks.

This project is inspired by and partially derived from Daniel Greenheck's
[EZ-Tree](https://github.com/dgreenheck/ez-tree). EZ-Tree is a Three.js
procedural tree generator; this package adapts the idea for CesiumJS primitives,
instancing, Cesium render commands, Cesium worker scheduling, and geospatial
placement.

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
npm run dev
npm run pack:dry-run
```

`npm run dev` starts the standalone Vite example in `examples/basic`.
Open it at `http://127.0.0.1:5173/examples/basic/`.

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
npm publish
```

## Attribution

- EZ-Tree: https://github.com/dgreenheck/ez-tree
- CesiumJS: https://github.com/CesiumGS/cesium
- Asset attribution details are kept in `NOTICE.md` and the README files inside
  `assets/`.

## License

MIT. See `LICENSE` and `NOTICE.md`.
