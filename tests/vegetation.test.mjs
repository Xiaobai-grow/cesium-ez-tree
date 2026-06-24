import assert from "node:assert/strict";
import test from "node:test";
import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import createEzTreeVegetationInstances from "../src/EzTree/EzTreeVegetationInstances.js";

function getTrees(instances) {
  return instances.filter((instance) => instance.kind === "tree");
}

test("keeps mixed tree presets separated", () => {
  const minimumTreeSpacing = 9.0;
  const instances = createEzTreeVegetationInstances({
    width: 120.0,
    depth: 120.0,
    seed: 12,
    treeCount: 32,
    grassCount: 0,
    flowerCount: 0,
    treeScale: 0.58,
    minimumTreeSpacing,
  });

  const trees = getTrees(instances);
  const minimumDistanceSquared = minimumTreeSpacing * minimumTreeSpacing;
  const presets = new Set();

  assert.equal(trees.length, 32);

  for (let i = 0; i < trees.length; i++) {
    presets.add(trees[i].preset);
    for (let j = i + 1; j < trees.length; j++) {
      assert.ok(
        Cartesian3.distanceSquared(
          trees[i].translation,
          trees[j].translation,
        ) >= minimumDistanceSquared,
      );
    }
  }

  assert.ok(presets.size > 1);
});

test("keeps the requested tree count when spacing is saturated", () => {
  const instances = createEzTreeVegetationInstances({
    width: 1.0,
    depth: 1.0,
    seed: 12,
    treeCount: 5,
    grassCount: 0,
    flowerCount: 0,
    minimumTreeSpacing: 10.0,
  });

  assert.equal(getTrees(instances).length, 5);
});
