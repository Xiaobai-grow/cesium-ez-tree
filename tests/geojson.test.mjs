import assert from "node:assert/strict";
import test from "node:test";
import GeographicTilingScheme from "@cesium/engine/Source/Core/GeographicTilingScheme.js";
import { configureEzTree } from "../src/configuration.js";
import EzTreeGeoJSON from "../src/EzTree/EzTreeGeoJSON.js";

configureEzTree({ useWorkers: false });

function createViewer() {
  const primitives = [];
  return {
    viewer: {
      scene: {
        primitives: {
          add(primitive) {
            primitives.push(primitive);
            return primitive;
          },
          remove(primitive) {
            const index = primitives.indexOf(primitive);
            if (index === -1) return false;
            primitives.splice(index, 1);
            return true;
          },
        },
      },
    },
    primitives,
  };
}

const geojson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        treeCount: 2,
        grassCount: 3,
        flowerCount: 0,
        rockCount: 0,
        treePreset: "Pine Medium",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [118.85, 32.06],
            [118.86, 32.06],
            [118.86, 32.07],
            [118.85, 32.07],
            [118.85, 32.06],
          ],
          [
            [118.853, 32.063],
            [118.857, 32.063],
            [118.857, 32.067],
            [118.853, 32.067],
            [118.853, 32.063],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { treePreset: "Aspen Medium" },
      geometry: {
        type: "MultiPoint",
        coordinates: [
          [118.851, 32.071],
          [118.852, 32.071],
        ],
      },
    },
  ],
};

test("loads polygon and point GeoJSON into managed primitives", async () => {
  const { viewer, primitives } = createViewer();
  const layer = await EzTreeGeoJSON.load(geojson, {
    viewer,
    treeCount: 20,
    grassCount: 20,
    primitiveOptions: {
      windStrength: 0.25,
      show: false,
    },
  });

  assert.equal(layer.polygonCount, 1);
  assert.equal(layer.pointCount, 2);
  assert.deepEqual(layer.counts, {
    tree: 4,
    grass: 3,
    flower: 0,
    rock: 0,
  });
  assert.equal(primitives.length, 2);
  assert.equal(layer.primitives.length, 2);
  assert.equal(layer.show, false);
  assert.equal(primitives[0].windStrength, 0.25);
  assert.ok(
    primitives[0].instances
      .filter((instance) => instance.kind === "tree")
      .every((instance) => instance.preset === "Pine Medium"),
  );
  assert.ok(
    primitives[1].instances.every(
      (instance) => instance.preset === "Aspen Medium",
    ),
  );

  layer.show = true;
  assert.ok(primitives.every((primitive) => primitive.show));

  const managedPrimitives = layer.primitives;
  layer.clear();
  assert.equal(primitives.length, 0);
  assert.deepEqual(layer.counts, {
    tree: 0,
    grass: 0,
    flower: 0,
    rock: 0,
  });
  assert.ok(managedPrimitives.every((primitive) => primitive.isDestroyed()));

  layer.destroy();
  assert.equal(layer.isDestroyed(), true);
});

test("loads bare geometry and applies vegetation type switches", async () => {
  const { viewer, primitives } = createViewer();
  const layer = await EzTreeGeoJSON.load(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            tree: false,
            grass: false,
            flower: false,
            rock: false,
            treeCount: 10,
            grassCount: 10,
            flowerCount: 10,
            rockCount: 10,
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [118.85, 32.06],
                [118.851, 32.06],
                [118.851, 32.061],
                [118.85, 32.061],
                [118.85, 32.06],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { tree: false },
          geometry: { type: "Point", coordinates: [118.852, 32.062] },
        },
      ],
    },
    {
      viewer,
      treeCount: 10,
      grassCount: 10,
      flowerCount: 10,
      rockCount: 10,
    },
  );

  assert.deepEqual(layer.counts, {
    tree: 0,
    grass: 0,
    flower: 0,
    rock: 0,
  });
  assert.equal(layer.polygonCount, 1);
  assert.equal(layer.pointCount, 1);
  assert.equal(primitives.length, 0);
  layer.destroy();
});

test("rejects polygon rings without three valid coordinates", async () => {
  const { viewer, primitives } = createViewer();

  await assert.rejects(
    EzTreeGeoJSON.load(
      {
        type: "Polygon",
        coordinates: [[[118.85, 32.06], [118.86, 32.07], ["bad", 32.08]]],
      },
      { viewer },
    ),
    /no supported Polygon/,
  );
  assert.equal(primitives.length, 0);
});

test("clamps generated trees to the supplied terrain provider", async () => {
  const { viewer, primitives } = createViewer();
  const terrainProvider = {
    availability: {
      computeMaximumLevelAtPosition() {
        return 1;
      },
    },
    tilingScheme: new GeographicTilingScheme(),
    requestTileGeometry() {
      return Promise.resolve({
        interpolateHeight() {
          return 125;
        },
      });
    },
  };

  const layer = await EzTreeGeoJSON.load(
    { type: "Point", coordinates: [118.85, 32.06] },
    { viewer, terrainProvider, clampToTerrain: true },
  );

  assert.equal(layer.counts.tree, 1);
  assert.ok(
    Math.abs(primitives[0].instances[0].translation.z - 125) < 0.01,
  );
  layer.destroy();
});

test("loads MultiPolygon and nested GeometryCollection geometries", async () => {
  const { viewer, primitives } = createViewer();
  const polygon = [
    [118.85, 32.06],
    [118.851, 32.06],
    [118.851, 32.061],
    [118.85, 32.061],
    [118.85, 32.06],
  ];
  const layer = await EzTreeGeoJSON.load(
    {
      type: "GeometryCollection",
      geometries: [
        {
          type: "MultiPolygon",
          coordinates: [[[...polygon]], [[...polygon]]],
        },
        {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [118.852, 32.062] },
          ],
        },
      ],
    },
    {
      viewer,
      treeCount: 1,
      grassCount: 0,
      flowerCount: 0,
      rockCount: 0,
    },
  );

  assert.equal(layer.polygonCount, 2);
  assert.equal(layer.pointCount, 1);
  assert.equal(layer.counts.tree, 3);
  assert.equal(primitives.length, 3);
  layer.destroy();
});

test("rejects GeoJSON without supported geometry", async () => {
  const { viewer, primitives } = createViewer();

  await assert.rejects(
    EzTreeGeoJSON.load(
      {
        type: "LineString",
        coordinates: [
          [118.85, 32.06],
          [118.86, 32.07],
        ],
      },
      { viewer },
    ),
    /no supported Polygon/,
  );
  assert.equal(primitives.length, 0);
});

test("batches point features with equivalent tree options", async () => {
  const { viewer, primitives } = createViewer();
  const features = Array.from({ length: 12 }, (_, index) => ({
    type: "Feature",
    properties: {
      FID: index,
      stopName: `站点-${index}`,
    },
    geometry: {
      type: "Point",
      coordinates: [118.85 + index * 0.001, 32.06],
    },
  }));
  const layer = await EzTreeGeoJSON.load(
    { type: "FeatureCollection", features },
    {
      viewer,
      treePreset: "Pine Medium",
      treeScale: 0.8,
    },
  );

  assert.equal(layer.pointCount, features.length);
  assert.equal(layer.counts.tree, features.length);
  assert.equal(primitives.length, 1);
  assert.equal(primitives[0].instances.length, features.length);
  assert.ok(
    primitives[0].instances.every(
      (instance) => instance.preset === "Pine Medium",
    ),
  );
  layer.destroy();
});

test("keeps point batches separate for effective tree options", async () => {
  const { viewer, primitives } = createViewer();
  const presetsA = ["Pine Medium", "Oak Medium"];
  const presetsB = ["Aspen Medium", "Bush 2"];
  const layer = await EzTreeGeoJSON.load(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { treePreset: "Pine Medium", seed: 1 },
          geometry: { type: "Point", coordinates: [118.85, 32.06] },
        },
        {
          type: "Feature",
          properties: { treePreset: "Pine Medium", seed: 1, stopName: "A" },
          geometry: { type: "Point", coordinates: [118.851, 32.06] },
        },
        {
          type: "Feature",
          properties: { treePreset: "Oak Medium", seed: 1 },
          geometry: { type: "Point", coordinates: [118.852, 32.06] },
        },
        {
          type: "Feature",
          properties: { presets: presetsA },
          geometry: { type: "Point", coordinates: [118.853, 32.06] },
        },
        {
          type: "Feature",
          properties: { presets: [...presetsA] },
          geometry: { type: "Point", coordinates: [118.854, 32.06] },
        },
        {
          type: "Feature",
          properties: { presets: presetsB },
          geometry: { type: "Point", coordinates: [118.855, 32.06] },
        },
        {
          type: "Feature",
          properties: { tree: false },
          geometry: { type: "Point", coordinates: [118.856, 32.06] },
        },
      ],
    },
    { viewer, treePreset: "Mixed", seed: 1 },
  );

  assert.equal(layer.pointCount, 7);
  assert.equal(layer.counts.tree, 6);
  assert.equal(primitives.length, 4);
  assert.deepEqual(
    primitives.map((primitive) => primitive.instances.length),
    [2, 1, 2, 1],
  );
  layer.destroy();
});
