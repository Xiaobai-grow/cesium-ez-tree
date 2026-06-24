# Notices And Third-Party Attribution

## EZ-Tree

This project is inspired by and partially derived from Daniel Greenheck's
EZ-Tree project:

- Repository: https://github.com/dgreenheck/ez-tree
- npm package: `@dgreenheck/ez-tree`
- License: MIT
- Copyright: Copyright (c) 2024 Daniel Greenheck

The Cesium implementation adapts the procedural tree generation concepts for
CesiumJS primitives, GPU instancing, render commands, worker scheduling, and
geospatial placement.

## CesiumJS

This package depends on CesiumJS and imports Cesium `Source/*` modules.

- Repository: https://github.com/CesiumGS/cesium
- License: Apache-2.0

## Assets

The package includes bark textures, leaf textures, grass texture, and GLB
models used by the runtime demo and primitive.

Current source notes are preserved in:

- `assets/bark/README.md`
- `assets/grass/README.md`
- `assets/models/README.md`

Bark source links recorded by the original migration:

- Birch: https://www.texturecan.com/details/221/
- Pine: https://www.texturecan.com/details/588/
- Oak: https://polyhaven.com/a/bark_brown_02
- Willow: https://polyhaven.com/a/bark_willow_02

The GLB model files and extracted `grass.webp` are recorded as coming from the
original EZ-Tree demo application's `src/app/public` assets.
