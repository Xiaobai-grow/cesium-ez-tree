import BoundingSphere from "@cesium/engine/Source/Core/BoundingSphere.js";
import Cartesian2 from "@cesium/engine/Source/Core/Cartesian2.js";
import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Matrix3 from "@cesium/engine/Source/Core/Matrix3.js";
import Quaternion from "@cesium/engine/Source/Core/Quaternion.js";
import CesiumMath from "@cesium/engine/Source/Core/Math.js";
import { Billboard, TreeType } from "./EzTreeEnums.js";
import EzTreeOptions, { cloneOptions } from "./EzTreeOptions.js";
import EzTreeRNG from "./EzTreeRNG.js";

const scratchMatrix3 = new Matrix3();
const scratchVectorA = new Cartesian3();
const scratchVectorB = new Cartesian3();
const scratchQuaternionA = new Quaternion();
const scratchQuaternionB = new Quaternion();
const scratchQuaternionC = new Quaternion();
const UNIT_Y = Cartesian3.UNIT_Y;

function getLevelValue(object, level, defaultValue) {
  const value = object?.[level];
  return value ?? defaultValue;
}

function rotateVector(vector, quaternion, result) {
  Matrix3.fromQuaternion(quaternion, scratchMatrix3);
  return Matrix3.multiplyByVector(scratchMatrix3, vector, result);
}

function normalizeSafe(vector, result) {
  const magnitude = Cartesian3.magnitude(vector);
  if (magnitude === 0.0) {
    return Cartesian3.clone(UNIT_Y, result);
  }
  return Cartesian3.divideByScalar(vector, magnitude, result);
}

function quaternionFromUnitVectors(from, to, result) {
  const EPSILON = 1e-6;
  let r = Cartesian3.dot(from, to) + 1.0;

  if (r < EPSILON) {
    r = 0.0;
    if (Math.abs(from.x) > Math.abs(from.z)) {
      Cartesian3.fromElements(-from.y, from.x, 0.0, scratchVectorA);
    } else {
      Cartesian3.fromElements(0.0, -from.z, from.y, scratchVectorA);
    }
  } else {
    Cartesian3.cross(from, to, scratchVectorA);
  }

  result.x = scratchVectorA.x;
  result.y = scratchVectorA.y;
  result.z = scratchVectorA.z;
  result.w = r;
  return Quaternion.normalize(result, result);
}

function rotateTowards(current, target, step, result) {
  let dot = Quaternion.dot(current, target);
  dot = Math.min(Math.max(dot, -1.0), 1.0);

  const angle = 2.0 * Math.acos(Math.min(Math.abs(dot), 1.0));
  if (angle === 0.0 || !Number.isFinite(angle)) {
    return Quaternion.clone(current, result);
  }

  return Quaternion.slerp(current, target, Math.min(1.0, step / angle), result);
}

function perturbOrientation(orientation, rng, amount, result) {
  const x = rng.random(amount, -amount);
  const z = rng.random(amount, -amount);
  Quaternion.fromAxisAngle(Cartesian3.UNIT_X, x, scratchQuaternionA);
  Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, z, scratchQuaternionB);
  Quaternion.multiply(orientation, scratchQuaternionA, result);
  Quaternion.multiply(result, scratchQuaternionB, result);
  return Quaternion.normalize(result, result);
}

function Branch(
  origin,
  orientation,
  length,
  radius,
  level,
  sectionCount,
  segmentCount,
) {
  this.origin = Cartesian3.clone(origin);
  this.orientation = Quaternion.clone(orientation);
  this.length = length;
  this.radius = radius;
  this.level = level;
  this.sectionCount = sectionCount;
  this.segmentCount = segmentCount;
}

function createBuffers() {
  return {
    positions: [],
    normals: [],
    st: [],
    windWeights: [],
    indices: [],
  };
}

function pushVertex(buffers, position, normal, st, windWeight) {
  buffers.positions.push(position.x, position.y, position.z);
  buffers.normals.push(normal.x, normal.y, normal.z);
  buffers.st.push(st.x, st.y);
  buffers.windWeights.push(windWeight);
}

function addQuad(buffers, vertices, normal, windWeights) {
  addQuadWithSt(buffers, vertices, normal, windWeights, [
    new Cartesian2(0.0, 1.0),
    new Cartesian2(0.0, 0.0),
    new Cartesian2(1.0, 0.0),
    new Cartesian2(1.0, 1.0),
  ]);
}

function addQuadWithSt(buffers, vertices, normal, windWeights, st) {
  addQuadWithNormals(
    buffers,
    vertices,
    [normal, normal, normal, normal],
    windWeights,
    st,
  );
}

function addQuadWithNormals(buffers, vertices, normals, windWeights, st) {
  const index = buffers.positions.length / 3;
  pushVertex(buffers, vertices[0], normals[0], st[0], windWeights[0]);
  pushVertex(buffers, vertices[1], normals[1], st[1], windWeights[1]);
  pushVertex(buffers, vertices[2], normals[2], st[2], windWeights[2]);
  pushVertex(buffers, vertices[3], normals[3], st[3], windWeights[3]);
  buffers.indices.push(
    index,
    index + 1,
    index + 2,
    index,
    index + 2,
    index + 3,
  );
}

function toTypedGeometry(buffers) {
  return {
    positions: new Float32Array(buffers.positions),
    normals: new Float32Array(buffers.normals),
    st: new Float32Array(buffers.st),
    windWeights: new Float32Array(buffers.windWeights),
    indices:
      buffers.positions.length / 3 > CesiumMath.SIXTY_FOUR_KILOBYTES
        ? new Uint32Array(buffers.indices)
        : new Uint16Array(buffers.indices),
    boundingSphere: BoundingSphere.fromVertices(buffers.positions),
  };
}

function createRoundedLeafNormal(vertex, origin, normal, result) {
  Cartesian3.add(normal, vertex, result);
  Cartesian3.subtract(result, origin, result);
  return normalizeSafe(result, result);
}

/**
 * Generates typed geometry buffers for an EzTree procedural tree.
 *
 * @alias EzTreeGenerator
 * @constructor
 *
 * @param {EzTreeOptions|object} [options] The tree generation options.
 */
function EzTreeGenerator(options) {
  this.options = cloneOptions(options ?? new EzTreeOptions());
  this.rng = new EzTreeRNG(this.options.seed);
  this._branchQueue = [];
  this._branches = createBuffers();
  this._leaves = createBuffers();
}

/**
 * Generates branch and leaf geometry for the configured tree.
 *
 * @returns {object} The generated branch and leaf geometry buffers.
 */
EzTreeGenerator.prototype.generate = function () {
  const branch = this.options.branch;
  this._branchQueue.length = 0;
  this._branches = createBuffers();
  this._leaves = createBuffers();
  this.rng = new EzTreeRNG(this.options.seed);

  this._branchQueue.push(
    new Branch(
      Cartesian3.ZERO,
      Quaternion.IDENTITY,
      getLevelValue(branch.length, 0, 20.0),
      getLevelValue(branch.radius, 0, 1.0),
      0,
      getLevelValue(branch.sections, 0, 8),
      getLevelValue(branch.segments, 0, 8),
    ),
  );

  while (this._branchQueue.length > 0) {
    this._generateBranch(this._branchQueue.shift());
  }

  return {
    branches: toTypedGeometry(this._branches),
    leaves: toTypedGeometry(this._leaves),
  };
};

EzTreeGenerator.prototype._generateBranch = function (branch) {
  const options = this.options;
  const branchOptions = options.branch;
  const level = branch.level;
  const indexOffset = this._branches.positions.length / 3;

  const sectionOrientation = Quaternion.clone(branch.orientation);
  const sectionOrigin = Cartesian3.clone(branch.origin);
  const deciduousLengthDivisor =
    options.type === TreeType.Deciduous
      ? Math.max(1, branchOptions.levels - 1)
      : 1;
  const sectionLength =
    branch.length / branch.sectionCount / deciduousLengthDivisor;

  const sections = [];

  for (let i = 0; i <= branch.sectionCount; i++) {
    let sectionRadius = branch.radius;
    if (i === branch.sectionCount && level === branchOptions.levels) {
      sectionRadius = 0.001;
    } else if (options.type === TreeType.Deciduous) {
      sectionRadius *=
        1.0 -
        getLevelValue(branchOptions.taper, level, 0.7) *
          (i / branch.sectionCount);
    } else if (options.type === TreeType.Evergreen) {
      sectionRadius *= 1.0 - i / branch.sectionCount;
    }

    let firstVertex;
    let firstNormal;
    for (let j = 0; j < branch.segmentCount; j++) {
      const angle = (2.0 * Math.PI * j) / branch.segmentCount;
      const localVertex = Cartesian3.fromElements(
        Math.cos(angle) * sectionRadius,
        0.0,
        Math.sin(angle) * sectionRadius,
        scratchVectorA,
      );
      const localNormal = Cartesian3.fromElements(
        Math.cos(angle),
        0.0,
        Math.sin(angle),
        scratchVectorB,
      );
      const vertex = rotateVector(
        localVertex,
        sectionOrientation,
        new Cartesian3(),
      );
      const normal = rotateVector(
        localNormal,
        sectionOrientation,
        new Cartesian3(),
      );
      Cartesian3.add(vertex, sectionOrigin, vertex);
      normalizeSafe(normal, normal);

      if (j === 0) {
        firstVertex = Cartesian3.clone(vertex);
        firstNormal = Cartesian3.clone(normal);
      }

      pushVertex(
        this._branches,
        vertex,
        normal,
        new Cartesian2(j / branch.segmentCount, i % 2 === 0 ? 0.0 : 1.0),
        0.05 * level,
      );
    }

    pushVertex(
      this._branches,
      firstVertex,
      firstNormal,
      new Cartesian2(1.0, i % 2 === 0 ? 0.0 : 1.0),
      0.05 * level,
    );

    sections.push({
      origin: Cartesian3.clone(sectionOrigin),
      orientation: Quaternion.clone(sectionOrientation),
      radius: sectionRadius,
    });

    rotateVector(
      Cartesian3.fromElements(0.0, sectionLength, 0.0, scratchVectorA),
      sectionOrientation,
      scratchVectorB,
    );
    Cartesian3.add(sectionOrigin, scratchVectorB, sectionOrigin);

    const gnarliness =
      Math.max(1.0, 1.0 / Math.sqrt(Math.max(sectionRadius, 0.001))) *
      getLevelValue(branchOptions.gnarliness, level, 0.0);
    perturbOrientation(
      sectionOrientation,
      this.rng,
      gnarliness,
      sectionOrientation,
    );

    Quaternion.fromAxisAngle(
      UNIT_Y,
      getLevelValue(branchOptions.twist, level, 0.0),
      scratchQuaternionA,
    );
    Quaternion.multiply(
      sectionOrientation,
      scratchQuaternionA,
      sectionOrientation,
    );

    normalizeSafe(branchOptions.force.direction, scratchVectorA);
    quaternionFromUnitVectors(UNIT_Y, scratchVectorA, scratchQuaternionB);
    rotateTowards(
      sectionOrientation,
      scratchQuaternionB,
      branchOptions.force.strength / Math.max(sectionRadius, 0.001),
      sectionOrientation,
    );

    if (options.trellis.enabled) {
      const trellisResult = this._calculateTrellisForce(
        sectionOrigin,
        Math.max(sectionRadius, 0.001),
      );
      if (trellisResult !== undefined) {
        quaternionFromUnitVectors(
          UNIT_Y,
          trellisResult.direction,
          scratchQuaternionC,
        );
        rotateTowards(
          sectionOrientation,
          scratchQuaternionC,
          trellisResult.strength,
          sectionOrientation,
        );
      }
    }
  }

  this._generateBranchIndices(indexOffset, branch);

  if (options.type === TreeType.Deciduous) {
    const lastSection = sections[sections.length - 1];
    if (level < branchOptions.levels) {
      this._branchQueue.push(
        new Branch(
          lastSection.origin,
          lastSection.orientation,
          getLevelValue(branchOptions.length, level + 1, branch.length * 0.5),
          lastSection.radius,
          level + 1,
          branch.sectionCount,
          branch.segmentCount,
        ),
      );
    } else {
      this._generateLeaf(lastSection.origin, lastSection.orientation);
    }
  }

  if (level === branchOptions.levels) {
    this._generateLeaves(sections);
  } else if (level < branchOptions.levels) {
    this._generateChildBranches(
      getLevelValue(branchOptions.children, level, 0),
      level + 1,
      sections,
    );
  }
};

EzTreeGenerator.prototype._generateBranchIndices = function (
  indexOffset,
  branch,
) {
  const N = branch.segmentCount + 1;
  for (let i = 0; i < branch.sectionCount; i++) {
    for (let j = 0; j < branch.segmentCount; j++) {
      const v1 = indexOffset + i * N + j;
      const v2 = indexOffset + i * N + j + 1;
      const v3 = v1 + N;
      const v4 = v2 + N;
      this._branches.indices.push(v1, v3, v2, v2, v3, v4);
    }
  }
};

EzTreeGenerator.prototype._generateChildBranches = function (
  count,
  level,
  sections,
) {
  const options = this.options;
  const branchOptions = options.branch;
  const radialOffset = this.rng.random();

  for (let i = 0; i < count; i++) {
    const childBranchStart = this.rng.random(
      1.0,
      getLevelValue(branchOptions.start, level, 0.3),
    );
    const sectionIndex = Math.floor(childBranchStart * (sections.length - 1));
    const sectionA = sections[sectionIndex];
    const sectionB = sections[Math.min(sectionIndex + 1, sections.length - 1)];
    const alpha =
      (childBranchStart - sectionIndex / (sections.length - 1)) /
      (1.0 / (sections.length - 1));

    const childBranchOrigin = Cartesian3.lerp(
      sectionA.origin,
      sectionB.origin,
      alpha,
      new Cartesian3(),
    );
    const childBranchRadius =
      getLevelValue(branchOptions.radius, level, 0.7) *
      ((1.0 - alpha) * sectionA.radius + alpha * sectionB.radius);

    const parentOrientation = Quaternion.slerp(
      sectionB.orientation,
      sectionA.orientation,
      alpha,
      new Quaternion(),
    );
    const radialAngle = 2.0 * Math.PI * (radialOffset + i / count);
    Quaternion.fromAxisAngle(
      Cartesian3.UNIT_X,
      CesiumMath.toRadians(getLevelValue(branchOptions.angle, level, 60.0)),
      scratchQuaternionA,
    );
    Quaternion.fromAxisAngle(UNIT_Y, radialAngle, scratchQuaternionB);
    Quaternion.multiply(
      scratchQuaternionB,
      scratchQuaternionA,
      scratchQuaternionC,
    );
    const childBranchOrientation = Quaternion.multiply(
      parentOrientation,
      scratchQuaternionC,
      new Quaternion(),
    );

    const childBranchLength =
      getLevelValue(branchOptions.length, level, 1.0) *
      (options.type === TreeType.Evergreen ? 1.0 - childBranchStart : 1.0);

    this._branchQueue.push(
      new Branch(
        childBranchOrigin,
        childBranchOrientation,
        childBranchLength,
        childBranchRadius,
        level,
        getLevelValue(branchOptions.sections, level, 4),
        getLevelValue(branchOptions.segments, level, 4),
      ),
    );
  }
};

EzTreeGenerator.prototype._generateLeaves = function (sections) {
  const options = this.options;
  const radialOffset = this.rng.random();
  const count = options.leaves.count;

  for (let i = 0; i < count; i++) {
    const leafStart = this.rng.random(1.0, options.leaves.start);
    const sectionIndex = Math.floor(leafStart * (sections.length - 1));
    const sectionA = sections[sectionIndex];
    const sectionB = sections[Math.min(sectionIndex + 1, sections.length - 1)];
    const alpha =
      (leafStart - sectionIndex / (sections.length - 1)) /
      (1.0 / (sections.length - 1));
    const leafOrigin = Cartesian3.lerp(
      sectionA.origin,
      sectionB.origin,
      alpha,
      new Cartesian3(),
    );
    const parentOrientation = Quaternion.slerp(
      sectionB.orientation,
      sectionA.orientation,
      alpha,
      new Quaternion(),
    );
    const radialAngle = 2.0 * Math.PI * (radialOffset + i / count);
    Quaternion.fromAxisAngle(
      Cartesian3.UNIT_X,
      CesiumMath.toRadians(options.leaves.angle),
      scratchQuaternionA,
    );
    Quaternion.fromAxisAngle(UNIT_Y, radialAngle, scratchQuaternionB);
    Quaternion.multiply(
      scratchQuaternionB,
      scratchQuaternionA,
      scratchQuaternionC,
    );
    const leafOrientation = Quaternion.multiply(
      parentOrientation,
      scratchQuaternionC,
      new Quaternion(),
    );
    this._generateLeaf(leafOrigin, leafOrientation);
  }
};

EzTreeGenerator.prototype._generateLeaf = function (origin, orientation) {
  const leaves = this.options.leaves;
  const leafSize =
    leaves.size *
    (1.0 + this.rng.random(leaves.sizeVariance, -leaves.sizeVariance));
  const W = leafSize;
  const L = leafSize;

  this._addLeafQuad(origin, orientation, W, L, 0.0);
  if (leaves.billboard === Billboard.Double) {
    this._addLeafQuad(origin, orientation, W, L, Math.PI * 0.5);
  }
};

EzTreeGenerator.prototype._addLeafQuad = function (
  origin,
  orientation,
  width,
  length,
  rotation,
) {
  Quaternion.fromAxisAngle(UNIT_Y, rotation, scratchQuaternionA);
  const quadOrientation = Quaternion.multiply(
    orientation,
    scratchQuaternionA,
    scratchQuaternionB,
  );
  const vertices = [
    new Cartesian3(-width * 0.5, length, 0.0),
    new Cartesian3(-width * 0.5, 0.0, 0.0),
    new Cartesian3(width * 0.5, 0.0, 0.0),
    new Cartesian3(width * 0.5, length, 0.0),
  ];

  for (let i = 0; i < 4; i++) {
    rotateVector(vertices[i], quadOrientation, vertices[i]);
    Cartesian3.add(vertices[i], origin, vertices[i]);
  }

  const normal = rotateVector(
    Cartesian3.UNIT_Z,
    quadOrientation,
    new Cartesian3(),
  );
  normalizeSafe(normal, normal);
  const normals =
    this.options.leaves.roundedNormals === false
      ? [normal, normal, normal, normal]
      : [
          createRoundedLeafNormal(
            vertices[0],
            origin,
            normal,
            new Cartesian3(),
          ),
          createRoundedLeafNormal(
            vertices[1],
            origin,
            normal,
            new Cartesian3(),
          ),
          createRoundedLeafNormal(
            vertices[2],
            origin,
            normal,
            new Cartesian3(),
          ),
          createRoundedLeafNormal(
            vertices[3],
            origin,
            normal,
            new Cartesian3(),
          ),
        ];
  addQuadWithNormals(
    this._leaves,
    vertices,
    normals,
    [1.0, 0.0, 0.0, 1.0],
    [
      new Cartesian2(0.0, 1.0),
      new Cartesian2(0.0, 0.0),
      new Cartesian2(1.0, 0.0),
      new Cartesian2(1.0, 1.0),
    ],
  );
};

EzTreeGenerator.prototype._getNearestTrellisPoint = function (position) {
  const trellis = this.options.trellis;
  const minX = trellis.position.x - trellis.width * 0.5;
  const maxX = trellis.position.x + trellis.width * 0.5;
  const minY = trellis.position.y;
  const maxY = trellis.position.y + trellis.height;

  const clampedX = CesiumMath.clamp(position.x, minX, maxX);
  const clampedY = CesiumMath.clamp(position.y, minY, maxY);
  const nearestHLineY =
    Math.round((clampedY - minY) / trellis.spacing) * trellis.spacing + minY;
  const nearestVLineX =
    Math.round((clampedX - minX) / trellis.spacing) * trellis.spacing + minX;

  const pointOnHLine = Cartesian3.fromElements(
    clampedX,
    CesiumMath.clamp(nearestHLineY, minY, maxY),
    trellis.position.z,
    scratchVectorA,
  );
  const pointOnVLine = Cartesian3.fromElements(
    CesiumMath.clamp(nearestVLineX, minX, maxX),
    clampedY,
    trellis.position.z,
    scratchVectorB,
  );

  return Cartesian3.distance(position, pointOnHLine) <
    Cartesian3.distance(position, pointOnVLine)
    ? Cartesian3.clone(pointOnHLine, new Cartesian3())
    : Cartesian3.clone(pointOnVLine, new Cartesian3());
};

EzTreeGenerator.prototype._calculateTrellisForce = function (position, radius) {
  const trellis = this.options.trellis;
  const nearestPoint = this._getNearestTrellisPoint(position);
  const distance = Cartesian3.distance(position, nearestPoint);
  if (distance > trellis.force.maxDistance || distance < 0.001) {
    return undefined;
  }

  const direction = Cartesian3.subtract(
    nearestPoint,
    position,
    new Cartesian3(),
  );
  normalizeSafe(direction, direction);
  const distanceFactor =
    1.0 - Math.pow(distance / trellis.force.maxDistance, trellis.force.falloff);
  return {
    direction: direction,
    strength: (trellis.force.strength * distanceFactor) / radius,
  };
};

function createGrassGeometry() {
  const buffers = createBuffers();
  const positions = [
    0.688383, 0.0, 0.829004, -0.311617, 0.0, -0.903047, 0.688384, 2.0, 0.829004,
    -0.311617, 2.0, -0.903047, -1.082349, 0.0, -0.028984, 0.878732, 0.0,
    0.363649, -1.082349, 2.0, -0.028984, 0.878732, 2.0, 0.363649, -0.708245,
    0.0, 0.791983, 0.291755, 0.0, -0.940068, -0.708244, 2.0, 0.791983, 0.291755,
    2.0, -0.940068,
  ];
  const normals = [
    0.866019, 0.0, -0.500011, 0.866019, 0.0, -0.500011, 0.866019, 0.0,
    -0.500011, 0.866019, 0.0, -0.500011, -0.196308, 0.0, 0.980542, -0.196308,
    0.0, 0.980542, -0.196308, 0.0, 0.980542, -0.196308, 0.0, 0.980542, 0.866019,
    0.0, 0.500011, 0.866019, 0.0, 0.500011, 0.866019, 0.0, 0.500011, 0.866019,
    0.0, 0.500011,
  ];
  const st = [
    0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0,
    0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0,
  ];

  for (let i = 0; i < positions.length; i += 3) {
    buffers.positions.push(positions[i], positions[i + 1], positions[i + 2]);
    buffers.normals.push(normals[i], normals[i + 1], normals[i + 2]);
    buffers.st.push(st[(i / 3) * 2], st[(i / 3) * 2 + 1]);
    buffers.windWeights.push(Math.min(1.0, positions[i + 1] * 0.5));
  }
  buffers.indices.push(0, 1, 3, 0, 3, 2, 4, 5, 7, 4, 7, 6, 8, 9, 11, 8, 11, 10);
  return toTypedGeometry(buffers);
}

function createFlowerGeometry() {
  const buffers = createBuffers();
  const normalA = Cartesian3.clone(Cartesian3.UNIT_Z);
  const normalB = Cartesian3.clone(Cartesian3.UNIT_X);
  addQuadWithSt(
    buffers,
    [
      new Cartesian3(-0.035, 0.72, 0.0),
      new Cartesian3(-0.035, 0.0, 0.0),
      new Cartesian3(0.035, 0.0, 0.0),
      new Cartesian3(0.035, 0.72, 0.0),
    ],
    normalA,
    [0.7, 0.0, 0.0, 0.7],
    [
      new Cartesian2(0.0, -1.0),
      new Cartesian2(0.0, -1.0),
      new Cartesian2(1.0, -1.0),
      new Cartesian2(1.0, -1.0),
    ],
  );
  addQuadWithSt(
    buffers,
    [
      new Cartesian3(0.0, 0.72, -0.035),
      new Cartesian3(0.0, 0.0, -0.035),
      new Cartesian3(0.0, 0.0, 0.035),
      new Cartesian3(0.0, 0.72, 0.035),
    ],
    normalB,
    [0.7, 0.0, 0.0, 0.7],
    [
      new Cartesian2(0.0, -1.0),
      new Cartesian2(0.0, -1.0),
      new Cartesian2(1.0, -1.0),
      new Cartesian2(1.0, -1.0),
    ],
  );
  addQuad(
    buffers,
    [
      new Cartesian3(-0.28, 0.95, 0.0),
      new Cartesian3(-0.28, 0.43, 0.0),
      new Cartesian3(0.28, 0.43, 0.0),
      new Cartesian3(0.28, 0.95, 0.0),
    ],
    normalA,
    [1.0, 0.0, 0.0, 1.0],
  );
  addQuad(
    buffers,
    [
      new Cartesian3(0.0, 0.95, -0.28),
      new Cartesian3(0.0, 0.43, -0.28),
      new Cartesian3(0.0, 0.43, 0.28),
      new Cartesian3(0.0, 0.95, 0.28),
    ],
    normalB,
    [1.0, 0.0, 0.0, 1.0],
  );
  return toTypedGeometry(buffers);
}

/**
 * Generates branch and leaf geometry for an EzTree procedural tree.
 *
 * @function generateTreeGeometry
 *
 * @param {EzTreeOptions|object} [options] The tree generation options.
 * @returns {object} The generated branch and leaf geometry buffers.
 */
function generateTreeGeometry(options) {
  return new EzTreeGenerator(options).generate();
}

export { createFlowerGeometry, createGrassGeometry, generateTreeGeometry };
export default EzTreeGenerator;
