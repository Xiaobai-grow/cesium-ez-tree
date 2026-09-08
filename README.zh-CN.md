# cesium-ez-tree

[![CI](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/ci.yml)
[![Pages](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml/badge.svg)](https://github.com/Xiaobai-grow/cesium-ez-tree/actions/workflows/pages.yml)
[![npm version](https://img.shields.io/npm/v/cesium-ez-tree.svg)](https://www.npmjs.com/package/cesium-ez-tree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English README](README.md)

`cesium-ez-tree` 是一个面向 CesiumJS 的程序化植被 Primitive，用于渲染
实例化的树木、草地、花朵和岩石。

本项目借鉴并部分源自 Daniel Greenheck 的
[EZ-Tree](https://github.com/dgreenheck/ez-tree)。EZ-Tree 是一个 Three.js
程序化树木生成库；本项目将相关思路适配到 CesiumJS Primitive、实例化渲染、
Cesium 渲染命令、Cesium worker 调度和地理空间放置场景中。

在线示例：https://xiaobai-grow.github.io/cesium-ez-tree/

## 兼容性

首个版本面向 CesiumJS `1.141.x` 和 `@cesium/engine` `25.x`。

本包会导入 Cesium engine 内部的 `Source/*` 模块，例如 `Renderer/Buffer`、
`Renderer/DrawCommand`、`Scene/DracoLoader` 和 `Core/TaskProcessor`。
请将 `cesium@1.141.x` 和 `@cesium/engine@25.x` 视为必需的 peer
dependencies。未来版本的 Cesium 可能可以工作，但在测试确认前不做兼容承诺。

## 安装

```bash
npm i cesium-ez-tree
```

## 资源与 Worker 配置

包内包含运行时资源 `assets/`，执行 `npm run build` 后还会生成 worker bundle
到 `dist/workers/`。

在应用中，请将这些目录复制到可公开访问的静态路径，并在创建 Primitive 前配置：

```js
import { configureEzTree } from "cesium-ez-tree";

configureEzTree({
  assetBaseUrl: "/cesium-ez-tree/assets/",
  workerBaseUrl: "/cesium-ez-tree/workers/",
});
```

如果你的应用暂时不能提供自定义 worker 文件，可以关闭 worker。库仍然可以运行，
但生成或打包大量实例时会花费更长时间：

```js
configureEzTree({
  assetBaseUrl: "/cesium-ez-tree/assets/",
  useWorkers: false,
});
```

## 基础用法

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

## 多边形用法

多边形顶点使用角度制的 `[经度, 纬度]`。实例生成和 Primitive 必须传入
同一个 ENU `modelMatrix`。可以通过 `holes` 设置多边形内环（孔洞）。

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

## GeoJSON 用法

`EzTreeGeoJSON` 支持 `Polygon`、`MultiPolygon`、`Point`、`MultiPoint`，以及
嵌套的 `GeometryCollection`。点坐标可以使用 `[经度, 纬度, 高度]`。Feature 的
properties 会覆盖图层中对应的植被参数。

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
  // 后续可使用：layer.show = false、layer.clear() 或 layer.destroy()
} catch (error) {
  console.error("植被 GeoJSON 加载失败：", error);
}
```

启用 `clampToTerrain` 后，地形采样默认最多等待 30 秒。可以通过
`terrainSamplingTimeout` 设置等待毫秒数，或者设为 `0` 关闭超时。

为了兼容旧的 Sandcastle 风格示例，也可以把 API 挂到 Cesium 命名空间：

```js
import * as Cesium from "cesium";
import { installEzTree } from "cesium-ez-tree";

installEzTree(Cesium);

const primitive = new Cesium.EzTreePrimitive({ instances });
```

## 主要 API

- `configureEzTree(options)`：设置 `assetBaseUrl`、`workerBaseUrl`、显式
  `workerUrls` 或 `useWorkers`。
- `EzTreePrimitive`：用于渲染程序化植被的 Cesium Primitive。
- `EzTreePrimitive.createVegetationInstances(options)`：同步生成实例。
- `EzTreePrimitive.createVegetationInstancesAsync(options)`：使用 worker 生成实例，
  并提供同步 fallback。使用 `polygon` 限定植被范围，或使用 `points` 设置固定树木点位。
- `EzTreeGeoJSON`：从 Polygon、MultiPolygon、Point、MultiPoint 和
  GeometryCollection GeoJSON 加载并管理植被。
- `EzTreeOptions`、`EzTreeGenerator`、`generateTreeGeometry(options)`：底层树木
  参数与几何生成工具。
- `TreePreset` / `loadEzTreePreset(name)`：内置树木预设，例如 `Oak Medium`、
  `Pine Medium`、`Aspen Medium` 和 `Bush 2`。

## 开发

```bash
npm install
npm run test
npm run build
npm run build:pages
npm run dev
npm run pack:dry-run
```

`npm run dev` 会启动 `examples/basic` 里的独立 Vite 示例。
打开地址：`http://127.0.0.1:5173/examples/basic/`。

## 问题反馈

欢迎提交问题、bug 报告、功能建议和使用示例。如果你遇到问题，请在 GitHub
Issue 中尽量附上 Cesium 版本、浏览器、运行环境配置，以及可以复现问题的最小示例。

## 致谢

- EZ-Tree: https://github.com/dgreenheck/ez-tree
- CesiumJS: https://github.com/CesiumGS/cesium
- 资源署名细节记录在 `NOTICE.md` 和 `assets/` 内各目录的 README 文件中。

## 许可证

MIT。详见 `LICENSE` 和 `NOTICE.md`。
