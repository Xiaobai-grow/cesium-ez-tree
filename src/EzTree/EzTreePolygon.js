import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Matrix4 from "@cesium/engine/Source/Core/Matrix4.js";
import defined from "@cesium/engine/Source/Core/defined.js";

const scratchInverseModelMatrix = new Matrix4();
const scratchWorldPosition = new Cartesian3();
const scratchLocalPosition = new Cartesian3();

/**
 * Resolves a single polygon vertex to a world-space Cartesian3. Supports:
 *  - `[longitude, latitude, height?]` tuples (degrees),
 *  - `{ longitude, latitude }` / `{ lon, lat }` objects (degrees),
 *  - `Cartesian3` (or `{ x, y, z }`) world ECEF positions.
 *
 * Returns `undefined` for a vertex that is already in local `{ x, y }` meters.
 *
 * @param {*} vertex The polygon vertex.
 * @returns {Cartesian3|undefined} The world-space position, or undefined when the vertex is already local.
 *
 * @private
 */
function polygonVertexToWorldPosition(vertex) {
  if (Array.isArray(vertex)) {
    return Cartesian3.fromDegrees(
      vertex[0],
      vertex[1],
      vertex[2] ?? 0.0,
      undefined,
      scratchWorldPosition,
    );
  }

  const longitude = vertex.longitude ?? vertex.lon;
  const latitude = vertex.latitude ?? vertex.lat;
  if (defined(longitude) && defined(latitude)) {
    return Cartesian3.fromDegrees(
      longitude,
      latitude,
      vertex.height ?? 0.0,
      undefined,
      scratchWorldPosition,
    );
  }

  if (
    typeof vertex.x === "number" &&
    typeof vertex.y === "number" &&
    typeof vertex.z === "number"
  ) {
    return Cartesian3.fromElements(
      vertex.x,
      vertex.y,
      vertex.z,
      scratchWorldPosition,
    );
  }

  return undefined;
}

function convertRingToLocal(ring, inverseModelMatrix) {
  if (!Array.isArray(ring)) {
    return undefined;
  }

  const points = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const vertex = ring[i];
    const world = polygonVertexToWorldPosition(vertex);
    if (defined(world)) {
      Matrix4.multiplyByPoint(inverseModelMatrix, world, scratchLocalPosition);
      points[i] = {
        x: scratchLocalPosition.x,
        y: scratchLocalPosition.y,
        z: scratchLocalPosition.z,
      };
    } else {
      points[i] = { x: vertex.x, y: vertex.y, z: vertex.z ?? 0.0 };
    }
  }
  return points;
}

/**
 * Converts a polygon outline to local ENU meter points relative to an
 * east-north-up model matrix. Vertices given as longitude/latitude (degrees) or
 * world Cartesian3 are transformed via the inverse model matrix; vertices that
 * are already local `{ x, y }` meters are passed through unchanged.
 *
 * Accepts either a flat outer ring (array of vertices) or a `{ positions, holes }`
 * object whose `holes` are inner rings. Returns the same shape in local meters.
 *
 * @param {object|object[]} polygon The polygon outline (flat ring or `{ positions, holes }`).
 * @param {Matrix4} [modelMatrix=Matrix4.IDENTITY] The local ENU-to-world transform.
 * @returns {object|object[]|undefined} The polygon as local `{ x, y }` points (same shape as input).
 *
 * @private
 */
export default function convertPolygonToLocal(polygon, modelMatrix) {
  if (
    polygon !== null &&
    typeof polygon === "object" &&
    Array.isArray(polygon.positions)
  ) {
    const inverseModelMatrix = Matrix4.inverse(
      modelMatrix ?? Matrix4.IDENTITY,
      scratchInverseModelMatrix,
    );
    const positions = convertRingToLocal(polygon.positions, inverseModelMatrix);
    if (positions === undefined) {
      return polygon;
    }

    const holes = [];
    if (Array.isArray(polygon.holes)) {
      for (let i = 0; i < polygon.holes.length; i++) {
        const hole = convertRingToLocal(polygon.holes[i], inverseModelMatrix);
        if (hole !== undefined) {
          holes.push(hole);
        }
      }
    }
    return { positions: positions, holes: holes };
  }

  if (!Array.isArray(polygon) || polygon.length < 3) {
    return polygon;
  }

  const inverseModelMatrix = Matrix4.inverse(
    modelMatrix ?? Matrix4.IDENTITY,
    scratchInverseModelMatrix,
  );
  return convertRingToLocal(polygon, inverseModelMatrix);
}

/**
 * Converts a list of point vertices (longitude/latitude or Cartesian3) to local
 * ENU meter points. Unlike {@link convertPolygonToLocal}, no minimum ring size
 * is enforced — a single point is valid.
 *
 * @param {object[]} points The point vertices.
 * @param {Matrix4} [modelMatrix=Matrix4.IDENTITY] The local ENU-to-world transform.
 * @returns {object[]|undefined} The points as local `{ x, y, z }` objects.
 *
 * @private
 */
export function convertPointsToLocal(points, modelMatrix) {
  if (!Array.isArray(points)) {
    return points;
  }

  const inverseModelMatrix = Matrix4.inverse(
    modelMatrix ?? Matrix4.IDENTITY,
    scratchInverseModelMatrix,
  );
  return convertRingToLocal(points, inverseModelMatrix);
}
