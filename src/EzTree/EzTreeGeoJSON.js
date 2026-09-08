import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Cartographic from "@cesium/engine/Source/Core/Cartographic.js";
import Matrix4 from "@cesium/engine/Source/Core/Matrix4.js";
import Transforms from "@cesium/engine/Source/Core/Transforms.js";
import sampleTerrainMostDetailed from "@cesium/engine/Source/Core/sampleTerrainMostDetailed.js";
import EzTreePrimitive from "./EzTreePrimitive.js";

const vegetationNumberKeys = Object.freeze([
  "seed",
  "width",
  "depth",
  "treeDensity",
  "grassDensity",
  "flowerDensity",
  "rockDensity",
  "treeCount",
  "grassCount",
  "flowerCount",
  "rockCount",
  "treeScale",
  "grassScale",
  "flowerScale",
  "rockScale",
  "grassPatchScale",
  "grassPatchiness",
  "maximumGrassCount",
  "maximumFlowerCount",
  "maximumRockCount",
  "minimumTreeSpacing",
]);

const vegetationStringKeys = Object.freeze(["treePreset"]);
const vegetationBooleanKeys = Object.freeze(["tree", "grass", "flower", "rock"]);
const defaultPointTreePresets = Object.freeze([
  "Oak Medium",
  "Pine Medium",
  "Aspen Medium",
  "Bush 2",
]);
const pointBatchDefaults = Object.freeze({
  seed: 0,
  treePreset: "Mixed",
  presets: defaultPointTreePresets,
  treeScale: 0.62,
});
const pointBatchOptionKeys = Object.freeze([
  "seed",
  "treePreset",
  "presets",
  "treeScale",
]);
const defaultTerrainSamplingTimeout = 30000;

class TerrainSamplingTimeoutError extends Error {
  constructor(timeout) {
    super(
      `EzTreeGeoJSON terrain sampling timed out after ${timeout} ms. Reduce the GeoJSON range, increase terrainSamplingTimeout, wait for terrain to load, or disable clampToTerrain.`,
    );
    this.name = "TerrainSamplingTimeoutError";
  }
}

function emptyCounts() {
  return { tree: 0, grass: 0, flower: 0, rock: 0 };
}

function addCounts(target, instances) {
  for (const instance of instances) {
    if (Object.prototype.hasOwnProperty.call(target, instance.kind)) {
      target[instance.kind]++;
    }
  }
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

function normalizeFeatures(geojson) {
  if (!isObject(geojson)) {
    throw new TypeError("EzTreeGeoJSON requires a GeoJSON object.");
  }

  if (geojson.type === "FeatureCollection") {
    return Array.isArray(geojson.features) ? geojson.features : [];
  }
  if (geojson.type === "Feature") {
    return [geojson];
  }
  return [{ type: "Feature", properties: {}, geometry: geojson }];
}

function isCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1])
  );
}

function normalizeCoordinate(coordinate) {
  if (!isCoordinate(coordinate)) return undefined;
  return Number.isFinite(coordinate[2])
    ? [coordinate[0], coordinate[1], coordinate[2]]
    : [coordinate[0], coordinate[1]];
}

function normalizeRing(ring) {
  if (!Array.isArray(ring)) return undefined;
  const coordinates = ring
    .map(normalizeCoordinate)
    .filter((coordinate) => coordinate !== undefined);
  return coordinates.length >= 3 ? coordinates : undefined;
}

function normalizePolygon(rings) {
  if (!Array.isArray(rings)) return undefined;
  const positions = normalizeRing(rings[0]);
  if (positions === undefined) return undefined;
  return {
    positions,
    holes: rings
      .slice(1)
      .map(normalizeRing)
      .filter((ring) => ring !== undefined),
  };
}

function collectGeometry(geometry, properties, polygons, pointGroups) {
  if (!isObject(geometry)) return;

  switch (geometry.type) {
    case "Polygon": {
      const polygon = normalizePolygon(geometry.coordinates);
      if (polygon !== undefined) {
        polygons.push({ properties, ...polygon });
      }
      break;
    }
    case "MultiPolygon": {
      if (!Array.isArray(geometry.coordinates)) break;
      for (const rings of geometry.coordinates) {
        const polygon = normalizePolygon(rings);
        if (polygon !== undefined) {
          polygons.push({ properties, ...polygon });
        }
      }
      break;
    }
    case "Point": {
      const coordinate = normalizeCoordinate(geometry.coordinates);
      if (coordinate !== undefined) {
        pointGroups.push({ properties, coordinates: [coordinate] });
      }
      break;
    }
    case "MultiPoint": {
      if (!Array.isArray(geometry.coordinates)) break;
      const coordinates = geometry.coordinates
        .map(normalizeCoordinate)
        .filter((coordinate) => coordinate !== undefined);
      if (coordinates.length > 0) {
        pointGroups.push({ properties, coordinates });
      }
      break;
    }
    case "GeometryCollection":
      if (!Array.isArray(geometry.geometries)) break;
      for (const child of geometry.geometries) {
        collectGeometry(child, properties, polygons, pointGroups);
      }
      break;
    default:
      break;
  }
}

function extractGeometry(geojson) {
  const polygons = [];
  const pointGroups = [];
  for (const feature of normalizeFeatures(geojson)) {
    if (!isObject(feature)) continue;
    const properties = isObject(feature.properties) ? feature.properties : {};
    collectGeometry(feature.geometry, properties, polygons, pointGroups);
  }
  return { polygons, pointGroups };
}

function coordinateToLonLat(coordinate) {
  if (isCoordinate(coordinate)) {
    return [coordinate[0], coordinate[1]];
  }
  if (isObject(coordinate)) {
    const longitude = coordinate.longitude ?? coordinate.lon;
    const latitude = coordinate.latitude ?? coordinate.lat;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return [longitude, latitude];
    }
  }
  return undefined;
}

function centerFromCoordinates(coordinates) {
  let longitude = 0.0;
  let latitude = 0.0;
  let count = 0;
  for (const coordinate of coordinates) {
    const lonLat = coordinateToLonLat(coordinate);
    if (lonLat === undefined) continue;
    longitude += lonLat[0];
    latitude += lonLat[1];
    count++;
  }

  if (count === 0) {
    throw new TypeError("EzTreeGeoJSON geometry has no valid coordinates.");
  }
  return {
    longitude: longitude / count,
    latitude: latitude / count,
  };
}

function getModelMatrix(coordinates) {
  const center = centerFromCoordinates(coordinates);
  return Transforms.eastNorthUpToFixedFrame(
    Cartesian3.fromDegrees(center.longitude, center.latitude, 0.0),
  );
}

function getVegetationDefaults(options) {
  const defaults = {
    ...(isObject(options.vegetationOptions) ? options.vegetationOptions : {}),
  };
  for (const key of [
    ...vegetationNumberKeys,
    ...vegetationStringKeys,
    ...vegetationBooleanKeys,
    "presets",
  ]) {
    if (options[key] !== undefined) {
      defaults[key] = options[key];
    }
  }
  return defaults;
}

function resolveBoolean(defaults, properties, key) {
  if (typeof properties[key] === "boolean") return properties[key];
  return typeof defaults[key] === "boolean" ? defaults[key] : undefined;
}

function isVegetationEnabled(defaults, properties, kind) {
  const props = isObject(properties) ? properties : {};
  return resolveBoolean(defaults, props, kind) !== false;
}



function buildVegetationOptions(defaults, properties) {
  const props = isObject(properties) ? properties : {};
  const result = {};

  for (const key of vegetationNumberKeys) {
    const propertyValue = props[key];
    const value =
      typeof propertyValue === "number" && Number.isFinite(propertyValue)
        ? propertyValue
        : defaults[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  }

  for (const key of vegetationStringKeys) {
    const propertyValue = props[key];
    const value =
      typeof propertyValue === "string" ? propertyValue : defaults[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  if (Array.isArray(props.presets)) {
    result.presets = props.presets;
  } else if (Array.isArray(defaults.presets)) {
    result.presets = defaults.presets;
  }

  for (const kind of vegetationBooleanKeys) {
    if (resolveBoolean(defaults, props, kind) === false) {
      result[`${kind}Count`] = 0;
      result[`${kind}Density`] = 0;
    }
  }

  return result;
}

function getPointBatchKey(options, treeEnabled) {
  return JSON.stringify([
    treeEnabled,
    ...pointBatchOptionKeys.map((key) => {
      const value = options[key] ?? pointBatchDefaults[key];
      return Array.isArray(value) ? [...value] : value;
    }),
  ]);
}

function createPointBatches(pointGroups, defaults) {
  const batches = new Map();
  for (const pointGroup of pointGroups) {
    const options = buildVegetationOptions(defaults, pointGroup.properties);
    const treeEnabled = isVegetationEnabled(
      defaults,
      pointGroup.properties,
      "tree",
    );
    const key = getPointBatchKey(options, treeEnabled);
    let batch = batches.get(key);
    if (batch === undefined) {
      batch = {
        coordinates: [],
        options,
        treeEnabled,
      };
      batches.set(key, batch);
    }
    batch.coordinates.push(...pointGroup.coordinates);
  }
  return batches.values();
}

function sampleTerrainWithTimeout(terrainProvider, cartographics, timeout) {
  const sampling = sampleTerrainMostDetailed(terrainProvider, cartographics);
  if (timeout === 0) return sampling;

  let timer;
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TerrainSamplingTimeoutError(timeout));
    }, timeout);
  });
  return Promise.race([sampling, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

async function clampTreesToTerrain(
  instances,
  modelMatrix,
  terrainProvider,
  timeout,
) {
  if (!terrainProvider) return instances;

  const treeIndices = [];
  const cartographics = [];
  for (let i = 0; i < instances.length; i++) {
    if (instances[i].kind !== "tree") continue;
    const translation = instances[i].translation;
    const world = Matrix4.multiplyByPoint(
      modelMatrix,
      translation,
      new Cartesian3(),
    );
    treeIndices.push(i);
    cartographics.push(Cartographic.fromCartesian(world));
  }

  if (cartographics.length === 0) return instances;

  try {
    await sampleTerrainWithTimeout(terrainProvider, cartographics, timeout);
    const inverseModelMatrix = Matrix4.inverse(modelMatrix, new Matrix4());
    const world = new Cartesian3();
    const local = new Cartesian3();
    for (let i = 0; i < cartographics.length; i++) {
      const cartographic = cartographics[i];
      if (!Number.isFinite(cartographic.height)) continue;
      Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height,
        undefined,
        world,
      );
      Matrix4.multiplyByPoint(inverseModelMatrix, world, local);
      instances[treeIndices[i]].translation.x = local.x;
      instances[treeIndices[i]].translation.y = local.y;
      instances[treeIndices[i]].translation.z = local.z;
    }
  } catch (error) {
    console.warn("EzTreeGeoJSON terrain sampling failed", error);
    if (error instanceof TerrainSamplingTimeoutError) {
      throw error;
    }
  }

  return instances;
}

function removeAndDestroyPrimitive(collection, primitive) {
  collection.remove(primitive);
  if (
    typeof primitive.isDestroyed === "function" &&
    !primitive.isDestroyed() &&
    typeof primitive.destroy === "function"
  ) {
    primitive.destroy();
  }
}

/**
 * Generates and manages EzTree primitives from GeoJSON features.
 */
class EzTreeGeoJSON {
  constructor(options = {}) {
    if (!isObject(options.viewer) || !options.viewer.scene?.primitives) {
      throw new TypeError(
        "EzTreeGeoJSON requires options.viewer.scene.primitives.",
      );
    }

    this._viewer = options.viewer;
    this._terrainProvider = options.terrainProvider;
    this._clampToTerrain = options.clampToTerrain ?? false;
    this._terrainSamplingTimeout =
      options.terrainSamplingTimeout ?? defaultTerrainSamplingTimeout;
    if (
      !Number.isFinite(this._terrainSamplingTimeout) ||
      this._terrainSamplingTimeout < 0
    ) {
      throw new TypeError(
        "EzTreeGeoJSON terrainSamplingTimeout must be a finite non-negative number.",
      );
    }
    this._primitiveOptions = isObject(options.primitiveOptions)
      ? { ...options.primitiveOptions }
      : {};
    this._vegetationDefaults = getVegetationDefaults(options);
    this._primitives = [];
    this._counts = emptyCounts();
    this._polygonCount = 0;
    this._pointCount = 0;
    this._show = this._primitiveOptions.show ?? true;
    this._loadToken = 0;
    this._destroyed = false;
  }

  static async load(geojson, options) {
    const layer = new EzTreeGeoJSON(options);
    await layer.load(geojson);
    return layer;
  }

  get primitives() {
    return this._primitives.slice();
  }

  get counts() {
    return { ...this._counts };
  }

  get polygonCount() {
    return this._polygonCount;
  }

  get pointCount() {
    return this._pointCount;
  }

  get show() {
    return this._show;
  }

  set show(value) {
    this._show = Boolean(value);
    for (const primitive of this._primitives) {
      primitive.show = this._show;
    }
  }

  async load(geojson) {
    if (this._destroyed) {
      throw new Error("Cannot load GeoJSON into a destroyed EzTreeGeoJSON.");
    }

    const token = ++this._loadToken;
    this._clearPrimitives();
    this._counts = emptyCounts();
    this._polygonCount = 0;
    this._pointCount = 0;

    try {
      const { polygons, pointGroups } = extractGeometry(geojson);
      if (polygons.length === 0 && pointGroups.length === 0) {
        throw new Error(
          "GeoJSON contains no supported Polygon, MultiPolygon, Point, or MultiPoint geometry.",
        );
      }
      for (const polygon of polygons) {
        const modelMatrix = getModelMatrix(polygon.positions);
        const instances = await this._createInstances(
          polygon.positions,
          {
            polygon: {
              positions: polygon.positions,
              holes: polygon.holes,
            },
            ...buildVegetationOptions(
              this._vegetationDefaults,
              polygon.properties,
            ),
          },
          modelMatrix,
        );
        if (token !== this._loadToken) return this;
        this._addPrimitive(instances, modelMatrix);
        this._polygonCount++;
      }

      for (const pointBatch of createPointBatches(
        pointGroups,
        this._vegetationDefaults,
      )) {
        const modelMatrix = getModelMatrix(pointBatch.coordinates);
        const instances = pointBatch.treeEnabled
          ? await this._createInstances(
              pointBatch.coordinates,
              {
                points: pointBatch.coordinates,
                ...pointBatch.options,
              },
              modelMatrix,
            )
          : [];
        if (token !== this._loadToken) return this;
        this._addPrimitive(instances, modelMatrix);
        this._pointCount += pointBatch.coordinates.length;
      }

      return this;
    } catch (error) {
      if (token === this._loadToken) {
        this._clearPrimitives();
        this._counts = emptyCounts();
        this._polygonCount = 0;
        this._pointCount = 0;
      }
      throw error;
    }
  }

  async _createInstances(coordinates, options, modelMatrix) {
    modelMatrix ??= getModelMatrix(coordinates);
    const instances = await EzTreePrimitive.createVegetationInstancesAsync({
      modelMatrix,
      ...options,
    });
    if (this._clampToTerrain) {
      await clampTreesToTerrain(
        instances,
        modelMatrix,
        this._terrainProvider ?? this._viewer.terrainProvider,
        this._terrainSamplingTimeout,
      );
    }
    return instances;
  }

  _addPrimitive(instances, modelMatrix) {
    if (instances.length === 0) return;
    const primitive = new EzTreePrimitive({
      ...this._primitiveOptions,
      modelMatrix,
      instances,
      show: this._show,
    });
    this._viewer.scene.primitives.add(primitive);
    this._primitives.push(primitive);
    addCounts(this._counts, instances);
  }

  _clearPrimitives() {
    for (const primitive of this._primitives) {
      removeAndDestroyPrimitive(this._viewer.scene.primitives, primitive);
    }
    this._primitives.length = 0;
  }

  clear() {
    if (this._destroyed) return;
    this._loadToken++;
    this._clearPrimitives();
    this._counts = emptyCounts();
    this._polygonCount = 0;
    this._pointCount = 0;
  }

  isDestroyed() {
    return this._destroyed;
  }

  destroy() {
    if (this._destroyed) return undefined;
    this.clear();
    this._destroyed = true;
    return undefined;
  }
}

export default EzTreeGeoJSON;
export { EzTreeGeoJSON };
