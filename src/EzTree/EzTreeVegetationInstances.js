import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Color from "@cesium/engine/Source/Core/Color.js";
import Frozen from "@cesium/engine/Source/Core/Frozen.js";
import EzTreeRNG from "./EzTreeRNG.js";

const defaultTreePresets = Object.freeze([
  "Oak Medium",
  "Pine Medium",
  "Aspen Medium",
  "Bush 2",
]);

const treePlacementAttemptCount = 24;

function randomInRectangle(rng, width, depth) {
  return new Cartesian3(
    rng.random(width * 0.5, -width * 0.5),
    rng.random(depth * 0.5, -depth * 0.5),
    0.0,
  );
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function mod289(value) {
  return value - Math.floor(value * (1.0 / 289.0)) * 289.0;
}

function permute(value) {
  return mod289((value * 34.0 + 1.0) * value);
}

function fract(value) {
  return value - Math.floor(value);
}

function simplex2d(x, y) {
  const cX = 0.211324865405187;
  const cY = 0.366025403784439;
  const cZ = -0.577350269189626;
  const cW = 0.024390243902439;

  let iX = Math.floor(x + cY * (x + y));
  let iY = Math.floor(y + cY * (x + y));
  const x0X = x - iX + cX * (iX + iY);
  const x0Y = y - iY + cX * (iX + iY);
  const i1X = x0X > x0Y ? 1.0 : 0.0;
  const i1Y = x0X > x0Y ? 0.0 : 1.0;
  const x12X = x0X + cX - i1X;
  const x12Y = x0Y + cX - i1Y;
  const x12Z = x0X + cZ;
  const x12W = x0Y + cZ;

  iX = mod289(iX);
  iY = mod289(iY);
  const pX = permute(permute(iY) + iX);
  const pY = permute(permute(iY + i1Y) + iX + i1X);
  const pZ = permute(permute(iY + 1.0) + iX + 1.0);

  let mX = Math.max(0.0, 0.5 - (x0X * x0X + x0Y * x0Y));
  let mY = Math.max(0.0, 0.5 - (x12X * x12X + x12Y * x12Y));
  let mZ = Math.max(0.0, 0.5 - (x12Z * x12Z + x12W * x12W));
  mX *= mX;
  mY *= mY;
  mZ *= mZ;
  mX *= mX;
  mY *= mY;
  mZ *= mZ;

  const xX = 2.0 * fract(pX * cW) - 1.0;
  const xY = 2.0 * fract(pY * cW) - 1.0;
  const xZ = 2.0 * fract(pZ * cW) - 1.0;
  const hX = Math.abs(xX) - 0.5;
  const hY = Math.abs(xY) - 0.5;
  const hZ = Math.abs(xZ) - 0.5;
  const oxX = Math.floor(xX + 0.5);
  const oxY = Math.floor(xY + 0.5);
  const oxZ = Math.floor(xZ + 0.5);
  const a0X = xX - oxX;
  const a0Y = xY - oxY;
  const a0Z = xZ - oxZ;

  mX *= 1.79284291400159 - 0.85373472095314 * (a0X * a0X + hX * hX);
  mY *= 1.79284291400159 - 0.85373472095314 * (a0Y * a0Y + hY * hY);
  mZ *= 1.79284291400159 - 0.85373472095314 * (a0Z * a0Z + hZ * hZ);

  const gX = a0X * x0X + hX * x0Y;
  const gY = a0Y * x12X + hY * x12Y;
  const gZ = a0Z * x12Z + hZ * x12W;
  return 130.0 * (mX * gX + mY * gY + mZ * gZ);
}

function isGrassPatchPosition(position, rng, patchScale, patchiness) {
  if (patchiness >= 1.0 || patchScale <= 0.0) {
    return true;
  }

  const noise =
    0.5 + 0.5 * simplex2d(position.x / patchScale, position.y / patchScale);
  return noise <= patchiness || rng.random() + 0.6 <= patchiness;
}

function randomGrassInPatch(rng, width, depth, patchScale, patchiness) {
  let position;
  for (let i = 0; i < 32; i++) {
    position = randomInRectangle(rng, width, depth);
    if (isGrassPatchPosition(position, rng, patchScale, patchiness)) {
      return position;
    }
  }

  return position ?? randomInRectangle(rng, width, depth);
}

function getMinimumTreeSpacing(options, width, depth, treeCount, treeScale) {
  if (options.minimumTreeSpacing !== undefined) {
    return Number.isFinite(options.minimumTreeSpacing)
      ? Math.max(0.0, options.minimumTreeSpacing)
      : 0.0;
  }

  if (treeCount <= 1) {
    return 0.0;
  }

  const averageTreeSpacing = Math.sqrt((width * depth) / treeCount);
  const scaledTreeSpacing = Number.isFinite(treeScale) ? treeScale * 18.0 : 0.0;
  return Math.max(0.0, Math.min(scaledTreeSpacing, averageTreeSpacing * 0.6));
}

function getTreeCellKey(x, y) {
  return `${x},${y}`;
}

function getTreeCell(position, cellSize) {
  return {
    x: Math.floor(position.x / cellSize),
    y: Math.floor(position.y / cellSize),
  };
}

function getNearestTreeDistanceSquared(position, grid, cellSize) {
  const cell = getTreeCell(position, cellSize);
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let y = cell.y - 1; y <= cell.y + 1; y++) {
    for (let x = cell.x - 1; x <= cell.x + 1; x++) {
      const bucket = grid.get(getTreeCellKey(x, y));
      if (bucket === undefined) {
        continue;
      }

      for (let i = 0; i < bucket.length; i++) {
        nearestDistanceSquared = Math.min(
          nearestDistanceSquared,
          Cartesian3.distanceSquared(position, bucket[i]),
        );
      }
    }
  }

  return nearestDistanceSquared;
}

function addTreePosition(position, grid, cellSize) {
  const cell = getTreeCell(position, cellSize);
  const key = getTreeCellKey(cell.x, cell.y);
  let bucket = grid.get(key);
  if (bucket === undefined) {
    bucket = [];
    grid.set(key, bucket);
  }
  bucket.push(position);
}

function randomTreeInRectangle(rng, width, depth, grid, minimumTreeSpacing) {
  if (minimumTreeSpacing <= 0.0) {
    return randomInRectangle(rng, width, depth);
  }

  const minimumDistanceSquared = minimumTreeSpacing * minimumTreeSpacing;
  let bestPosition;
  let bestDistanceSquared = -1.0;

  for (let i = 0; i < treePlacementAttemptCount; i++) {
    const position = randomInRectangle(rng, width, depth);
    const distanceSquared = getNearestTreeDistanceSquared(
      position,
      grid,
      minimumTreeSpacing,
    );

    if (distanceSquared >= minimumDistanceSquared) {
      addTreePosition(position, grid, minimumTreeSpacing);
      return position;
    }

    if (distanceSquared > bestDistanceSquared) {
      bestPosition = position;
      bestDistanceSquared = distanceSquared;
    }
  }

  addTreePosition(bestPosition, grid, minimumTreeSpacing);
  return bestPosition;
}

function randomGrassColor(rng) {
  return new Color(
    rng.random(0.48, 0.32),
    rng.random(0.78, 0.48),
    rng.random(0.2, 0.1),
    1.0,
  );
}

function randomRockColor(rng) {
  const scalar = rng.random(1.08, 0.88);
  return new Color(scalar, scalar, scalar, 1.0);
}

function capCount(count, maximum) {
  if (!Number.isFinite(maximum)) {
    return count;
  }
  return Math.min(count, Math.max(0, Math.floor(maximum)));
}

/**
 * Creates random vegetation instances for EzTreePrimitive.
 *
 * @param {object} [options] Vegetation distribution options.
 * @param {number} [options.minimumTreeSpacing] Minimum tree spacing in meters. Derived from density and scale by default.
 * @param {number} [options.rockDensity=6.0] Rock density in instances per hectare.
 * @param {number} [options.grassPatchScale=100.0] Approximate grass patch size in meters.
 * @param {number} [options.grassPatchiness=0.7] Grass patch fill ratio. 1.0 keeps grass uniform.
 * @param {number} [options.maximumGrassCount=60000] Maximum generated grass instances.
 * @param {number} [options.maximumFlowerCount=8000] Maximum generated flower instances.
 * @param {number} [options.maximumRockCount=5000] Maximum generated rock instances.
 * @returns {object[]} The generated vegetation instances.
 *
 * @private
 */
export default function createEzTreeVegetationInstances(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const rng = new EzTreeRNG(options.seed ?? 0);
  const width = options.width ?? 120.0;
  const depth = options.depth ?? 120.0;
  const areaHectares = (width * depth) / 10000.0;
  const treeCount =
    options.treeCount ??
    Math.round((options.treeDensity ?? 20.0) * areaHectares);
  const grassCount = capCount(
    options.grassCount ??
      Math.round((options.grassDensity ?? 450.0) * areaHectares),
    options.maximumGrassCount ?? 60000,
  );
  const flowerCount = capCount(
    options.flowerCount ??
      Math.round((options.flowerDensity ?? 100.0) * areaHectares),
    options.maximumFlowerCount ?? 8000,
  );
  const rockCount = capCount(
    options.rockCount ??
      Math.round((options.rockDensity ?? 6.0) * areaHectares),
    options.maximumRockCount ?? 5000,
  );
  const treePreset = options.treePreset ?? "Mixed";
  const presets = options.presets ?? defaultTreePresets;
  const treeScale = options.treeScale ?? 0.62;
  const grassScale = options.grassScale ?? 1.0;
  const grassPatchScale = Math.max(0.001, options.grassPatchScale ?? 100.0);
  const grassPatchiness = clamp(options.grassPatchiness ?? 0.7, 0.0, 1.0);
  const flowerScale = options.flowerScale ?? 1.0;
  const rockScale = options.rockScale ?? 1.0;
  const minimumTreeSpacing = getMinimumTreeSpacing(
    options,
    width,
    depth,
    treeCount,
    treeScale,
  );
  const treeGrid = new Map();
  const instances = [];

  for (let i = 0; i < treeCount; i++) {
    const preset =
      treePreset === "Mixed" ? presets[i % presets.length] : treePreset;
    const scale = treeScale * rng.random(1.25, 0.72);
    instances.push({
      kind: "tree",
      preset: preset,
      translation: randomTreeInRectangle(
        rng,
        width,
        depth,
        treeGrid,
        minimumTreeSpacing,
      ),
      rotation: rng.random(Math.PI * 2.0),
      scale: new Cartesian3(scale, scale, scale),
      colorVariation: rng.random(1.12, 0.88),
      windPhase: rng.random(),
    });
  }

  for (let i = 0; i < grassCount; i++) {
    const height = grassScale * rng.random(6.0, 4.0);
    const widthScale = grassScale * rng.random(6.0, 5.0);
    instances.push({
      kind: "grass",
      translation: randomGrassInPatch(
        rng,
        width,
        depth,
        grassPatchScale,
        grassPatchiness,
      ),
      rotation: rng.random(Math.PI * 2.0),
      scale: new Cartesian3(widthScale, widthScale, height),
      color: randomGrassColor(rng),
      windPhase: rng.random(),
    });
  }

  const flowerAssets = ["flower_white", "flower_blue", "flower_yellow"];
  for (let i = 0; i < flowerCount; i++) {
    const scale = flowerScale * rng.random(0.05, 0.02);
    instances.push({
      kind: "flower",
      asset: flowerAssets[i % flowerAssets.length],
      translation: randomGrassInPatch(
        rng,
        width,
        depth,
        grassPatchScale,
        grassPatchiness,
      ),
      rotation: rng.random(Math.PI * 2.0),
      scale: new Cartesian3(scale, scale, scale),
      color: Color.WHITE,
      colorVariation: rng.random(1.06, 0.94),
      windPhase: rng.random(),
    });
  }

  const rockAssets = ["rock1", "rock2", "rock3"];
  for (let i = 0; i < rockCount; i++) {
    const scale = rockScale * rng.random(5.0, 2.0);
    const translation = randomInRectangle(rng, width, depth);
    translation.z = 0.3;
    instances.push({
      kind: "rock",
      asset: rockAssets[i % rockAssets.length],
      translation: translation,
      rotation: rng.random(Math.PI * 2.0),
      scale: new Cartesian3(scale, scale, scale),
      color: randomRockColor(rng),
      windPhase: rng.random(),
    });
  }

  return instances;
}
