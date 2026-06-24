import { BarkType, Billboard, LeafType, TreeType } from "./EzTreeEnums.js";

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value !== null && typeof value === "object") {
    const result = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = cloneValue(value[key]);
      }
    }
    return result;
  }

  return value;
}

function mergeOptions(target, source) {
  if (source === undefined || source === null) {
    return target;
  }

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceValue = source[key];
    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      if (
        target[key] === undefined ||
        target[key] === null ||
        typeof target[key] !== "object"
      ) {
        target[key] = {};
      }
      mergeOptions(target[key], sourceValue);
    } else {
      target[key] = cloneValue(sourceValue);
    }
  }

  return target;
}

function cloneOptions(options) {
  return mergeOptions(new EzTreeOptions(), options);
}

/**
 * Options used to generate an EzTree procedural tree.
 *
 * @alias EzTreeOptions
 * @constructor
 *
 * @param {object} [options] Overrides for the default tree options.
 */
function EzTreeOptions(options) {
  this.seed = 0;
  this.type = TreeType.Deciduous;

  this.bark = {
    type: BarkType.Oak,
    tint: 0xffffff,
    flatShading: false,
    textured: true,
    textureScale: { x: 1.0, y: 1.0 },
  };

  this.branch = {
    levels: 3,
    angle: {
      1: 70.0,
      2: 60.0,
      3: 60.0,
    },
    children: {
      0: 7,
      1: 7,
      2: 5,
    },
    force: {
      direction: { x: 0.0, y: 1.0, z: 0.0 },
      strength: 0.01,
    },
    gnarliness: {
      0: 0.15,
      1: 0.2,
      2: 0.3,
      3: 0.02,
    },
    length: {
      0: 20.0,
      1: 20.0,
      2: 10.0,
      3: 1.0,
    },
    radius: {
      0: 1.5,
      1: 0.7,
      2: 0.7,
      3: 0.7,
    },
    sections: {
      0: 12,
      1: 10,
      2: 8,
      3: 6,
    },
    segments: {
      0: 8,
      1: 6,
      2: 4,
      3: 3,
    },
    start: {
      1: 0.4,
      2: 0.3,
      3: 0.3,
    },
    taper: {
      0: 0.7,
      1: 0.7,
      2: 0.7,
      3: 0.7,
    },
    twist: {
      0: 0.0,
      1: 0.0,
      2: 0.0,
      3: 0.0,
    },
  };

  this.leaves = {
    type: LeafType.Oak,
    billboard: Billboard.Double,
    angle: 10.0,
    count: 1,
    start: 0.0,
    size: 2.5,
    sizeVariance: 0.7,
    tint: 0xffffff,
    alphaTest: 0.5,
    roundedNormals: true,
  };

  this.trellis = {
    enabled: false,
    position: { x: 0.0, y: 0.0, z: -2.0 },
    width: 10.0,
    height: 20.0,
    spacing: 2.0,
    force: {
      strength: 0.02,
      maxDistance: 3.0,
      falloff: 1.0,
    },
    cylinderRadius: 0.05,
    visible: true,
    color: 0x8b4513,
  };

  mergeOptions(this, options);
}

EzTreeOptions.clone = cloneOptions;
EzTreeOptions.merge = mergeOptions;

export { cloneOptions, mergeOptions };
export default EzTreeOptions;
