import assert from "node:assert/strict";
import test from "node:test";
import EzTreeOptions, {
  cloneOptions,
  mergeOptions,
} from "../src/EzTree/EzTreeOptions.js";
import { loadPreset } from "../src/EzTree/EzTreePresets.js";
import { generateTreeGeometry } from "../src/EzTree/EzTreeGenerator.js";

test("clones and merges tree options without mutating the source", () => {
  const source = {
    seed: 42,
    branch: {
      levels: 2,
    },
    leaves: {
      size: 4,
    },
  };

  const options = cloneOptions(source);
  source.branch.levels = 99;

  assert.equal(options.seed, 42);
  assert.equal(options.branch.levels, 2);
  assert.equal(options.leaves.size, 4);
});

test("mergeOptions keeps nested defaults while applying overrides", () => {
  const target = new EzTreeOptions();
  mergeOptions(target, {
    bark: {
      textured: false,
    },
  });

  assert.equal(target.bark.textured, false);
  assert.equal(typeof target.branch.levels, "number");
});

test("loads a built-in preset and generates tree geometry", () => {
  const preset = loadPreset("Oak Medium");
  const geometry = generateTreeGeometry(preset);

  assert.equal(preset.bark.type, "oak");
  assert.ok(geometry.branches.positions.length > 0);
  assert.ok(geometry.leaves.positions.length > 0);
});
