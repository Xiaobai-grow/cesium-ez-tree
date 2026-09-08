# cesium-ez-tree

[![CI](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml)
[![Pages](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml)
[![npm version](https://img.shields.io/npm/v/cesium-ez-tree.svg)](https://www.npmjs.com/package/cesium-ez-tree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文文档](README.zh-CN.md)

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
npm i cesium-ez-tree
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

## Polygon Usage

Polygon vertices use `[longitude, latitude]` in degrees. Pass the same
ENU `modelMatrix` to instance generation and the primitive. Inner rings can be
provided with `holes`.

```js
import * as Cesium from "cesium";
import { EzTreePrimitive } from "cesium-ez-tree";

const polygon = {
  positions: [
    [-122.3910, 37.6178],
    [-122.3878, 37.6178],
    [-122.3878, 37.6200],
    [-122.3910, 37.6200],
    [-122.3910, 37.6178],
  ],
  holes: [
    [
      [-122.3900, 37.6185],
      [-122.3888, 37.6185],
      [-122.3888, 37.6192],
      [-122.3900, 37.6192],
      [-122.3900, 37.6185],
    ],
  ],
};

const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
  Cesium.Cartesian3.fromDegrees(-122.3894, 37.6189),
);
const instances = await EzTreePrimitive.createVegetationInstancesAsync({
  modelMatrix,
  polygon,
  seed: 12,
  treeDensity: 18,
  grassDensity: 650,
  flowerDensity: 45,
  rockDensity: 8,
});

viewer.scene.primitives.add(
  new EzTreePrimitive({ modelMatrix, instances }),
);
```

## GeoJSON Usage

`EzTreeGeoJSON` supports `Polygon`, `MultiPolygon`, `Point`, `MultiPoint`, and
nested `GeometryCollection` geometries. Point coordinates may include a height
as `[longitude, latitude, height]`. Feature properties override matching layer
vegetation options.

```js
import { EzTreeGeoJSON } from "cesium-ez-tree";

const geojson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        treePreset: "Pine Medium",
        treeCount: 120,
        grassCount: 800,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-122.3910, 37.6178],
          [-122.3878, 37.6178],
          [-122.3878, 37.6200],
          [-122.3910, 37.6200],
          [-122.3910, 37.6178],
        ]],
      },
    },
    {
      type: "Feature",
      properties: { treePreset: "Oak Medium", treeScale: 0.7 },
      geometry: {
        type: "MultiPoint",
        coordinates: [
          [-122.3902, 37.6204, 12],
          [-122.3892, 37.6204, 18],
        ],
      },
    },
  ],
};

try {
  const layer = await EzTreeGeoJSON.load(geojson, {
    viewer,
    treeDensity: 18,
    grassDensity: 650,
    flowerDensity: 45,
    rockDensity: 8,
    clampToTerrain: true,
    terrainSamplingTimeout: 15000,
    primitiveOptions: {
      windStrength: 0.1,
      maximumGrassDistance: 800,
    },
  });

  console.log(layer.polygonCount, layer.pointCount, layer.counts);
  // Later: layer.show = false; layer.clear(); or layer.destroy();
} catch (error) {
  console.error("Failed to load vegetation GeoJSON:", error);
}
```

When `clampToTerrain` is enabled, terrain sampling waits up to 30 seconds by
default. Set `terrainSamplingTimeout` in milliseconds, or use `0` to disable
the timeout.

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
  generation with synchronous fallback. Use `polygon` for bounded vegetation or
  `points` for fixed tree positions.
- `EzTreeGeoJSON`: loads and manages vegetation from Polygon, MultiPolygon,
  Point, MultiPoint, and GeometryCollection GeoJSON.
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

## Feedback

Questions, bug reports, feature requests, and usage examples are welcome. If you
run into a problem, please open a GitHub Issue with your Cesium version, browser,
runtime setup, and a minimal reproduction when possible.

## Attribution

- EZ-Tree: https://github.com/dgreenheck/ez-tree
- CesiumJS: https://github.com/CesiumGS/cesium
- Asset attribution details are kept in `NOTICE.md` and the README files inside
  `assets/`.

## License

MIT. See `LICENSE` and `NOTICE.md`.
