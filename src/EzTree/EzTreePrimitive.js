import BoundingSphere from "@cesium/engine/Source/Core/BoundingSphere.js";
import Cartesian2 from "@cesium/engine/Source/Core/Cartesian2.js";
import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Color from "@cesium/engine/Source/Core/Color.js";
import ComponentDatatype from "@cesium/engine/Source/Core/ComponentDatatype.js";
import FeatureDetection from "@cesium/engine/Source/Core/FeatureDetection.js";
import Frozen from "@cesium/engine/Source/Core/Frozen.js";
import IndexDatatype from "@cesium/engine/Source/Core/IndexDatatype.js";
import Intersect from "@cesium/engine/Source/Core/Intersect.js";
import CesiumMath from "@cesium/engine/Source/Core/Math.js";
import Matrix4 from "@cesium/engine/Source/Core/Matrix4.js";
import PrimitiveType from "@cesium/engine/Source/Core/PrimitiveType.js";
import PixelFormat from "@cesium/engine/Source/Core/PixelFormat.js";
import Resource from "@cesium/engine/Source/Core/Resource.js";
import TaskProcessor from "@cesium/engine/Source/Core/TaskProcessor.js";
import defined from "@cesium/engine/Source/Core/defined.js";
import destroyObject from "@cesium/engine/Source/Core/destroyObject.js";
import Buffer from "@cesium/engine/Source/Renderer/Buffer.js";
import BufferUsage from "@cesium/engine/Source/Renderer/BufferUsage.js";
import DrawCommand from "@cesium/engine/Source/Renderer/DrawCommand.js";
import Pass from "@cesium/engine/Source/Renderer/Pass.js";
import PixelDatatype from "@cesium/engine/Source/Renderer/PixelDatatype.js";
import RenderState from "@cesium/engine/Source/Renderer/RenderState.js";
import Sampler from "@cesium/engine/Source/Renderer/Sampler.js";
import ShaderProgram from "@cesium/engine/Source/Renderer/ShaderProgram.js";
import Texture from "@cesium/engine/Source/Renderer/Texture.js";
import TextureMagnificationFilter from "@cesium/engine/Source/Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "@cesium/engine/Source/Renderer/TextureMinificationFilter.js";
import TextureWrap from "@cesium/engine/Source/Renderer/TextureWrap.js";
import VertexArray from "@cesium/engine/Source/Renderer/VertexArray.js";
import JobType from "@cesium/engine/Source/Scene/JobType.js";
import createEzTreeInstanceAttributes, {
  INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
  INSTANCE_COLOR_OFFSET_IN_BYTES,
  INSTANCE_ROTATION_WIND_OFFSET_IN_BYTES,
  INSTANCE_SCALE_OFFSET_IN_BYTES,
  INSTANCE_TRANSLATION_OFFSET_IN_BYTES,
  cloneEzTreeInstanceAttributes,
} from "./EzTreeInstanceAttributes.js";
import { TreePreset, loadPreset } from "./EzTreePresets.js";
import createEzTreeVegetationInstances from "./EzTreeVegetationInstances.js";
import { generateTreeGeometry } from "./EzTreeGenerator.js";
import {
  createEzTreeGltfAssetRecord,
  destroyEzTreeGltfAssetRecord,
  processEzTreeGltfAssetRecord,
} from "./EzTreeGltfAsset.js";
import EzTreeInstancedVS from "./Shaders/EzTreeInstancedVS.js";
import EzTreeVegetationFS from "./Shaders/EzTreeVegetationFS.js";
import {
  getEzTreeAssetUrl,
  getEzTreeUseWorkers,
  getEzTreeWorkerUrl,
} from "../configuration.js";

const attributeLocations = Object.freeze({
  a_position: 0,
  a_normal: 1,
  a_st: 2,
  a_windWeight: 3,
  a_instanceTranslation: 4,
  a_instanceScale: 5,
  a_instanceRotationWind: 6,
  a_instanceColor: 7,
});

const CUTOUT_NONE = 0.0;
const CUTOUT_LEAF = 1.0;
const CUTOUT_GRASS = 2.0;
const WHITE_INTEGER = 0xffffff;
const DEFAULT_MAXIMUM_CACHED_COMMANDS = 256;
const DEFAULT_GPU_RESOURCE_CACHE_FRAMES = 90;
const DEFAULT_MAXIMUM_COMMAND_BUILDS_PER_FRAME = 8;
const DEFAULT_MAXIMUM_COMMAND_DESTROYS_PER_FRAME = 32;
const DEFAULT_MAXIMUM_UPLOAD_BYTES_PER_FRAME = 512 * 1024;
const DEFAULT_GPU_PRELOAD_RADIUS = 240.0;
const DEFAULT_CULLING_TILE_SIZE = 720.0;
const DEFAULT_STATISTICS_UPDATE_INTERVAL = 30;
const DEFAULT_WORKER_PACKING = true;
const defaultBarkTextureScale = Object.freeze(new Cartesian2(1.0, 1.0));
const barkTexturePaths = Object.freeze({
  birch: "EzTree/assets/bark/birch_color_1k.jpg",
  oak: "EzTree/assets/bark/oak_color_1k.jpg",
  pine: "EzTree/assets/bark/pine_color_1k.jpg",
  willow: "EzTree/assets/bark/willow_color_1k.jpg",
});
const gltfAssetPaths = Object.freeze({
  grass: "EzTree/assets/models/grass.glb",
  flowerWhite: "EzTree/assets/models/flower_white.glb",
  flowerBlue: "EzTree/assets/models/flower_blue.glb",
  flowerYellow: "EzTree/assets/models/flower_yellow.glb",
  rock1: "EzTree/assets/models/rock1.glb",
  rock2: "EzTree/assets/models/rock2.glb",
  rock3: "EzTree/assets/models/rock3.glb",
});
const barkTextureSampler = Object.freeze(
  new Sampler({
    wrapS: TextureWrap.REPEAT,
    wrapT: TextureWrap.REPEAT,
    minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    magnificationFilter: TextureMagnificationFilter.LINEAR,
  }),
);
const defaultLeafColors = Object.freeze({
  ash: Color.fromBytes(86, 142, 65, 255),
  aspen: Color.fromBytes(126, 164, 72, 255),
  oak: Color.fromBytes(64, 126, 58, 255),
  pine: Color.fromBytes(45, 94, 57, 255),
});

function nowSeconds() {
  if (typeof performance !== "undefined" && defined(performance.now)) {
    return performance.now() * 0.001;
  }
  return Date.now() * 0.001;
}

function colorFromInteger(value, result) {
  return Color.fromBytes(
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
    255,
    result,
  );
}

function getColorBrightness(color) {
  return color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722;
}

function getColorSaturation(color) {
  const max = Math.max(color.red, color.green, color.blue);
  if (max === 0.0) {
    return 0.0;
  }

  const min = Math.min(color.red, color.green, color.blue);
  return (max - min) / max;
}

function leafColorFromOptions(options, result) {
  const tint = colorFromInteger(options.leaves.tint, result);
  const defaultColor = defaultLeafColors[options.leaves.type];
  if (!defined(defaultColor)) {
    return tint;
  }

  const isWhite = options.leaves.tint === WHITE_INTEGER;
  const isWashedOut =
    getColorBrightness(tint) > 0.82 && getColorSaturation(tint) < 0.25;
  if (isWhite || isWashedOut) {
    return Color.clone(defaultColor, result);
  }

  return tint;
}

function barkTextureScaleFromOptions(options) {
  const scale = options.bark.textureScale;
  if (!defined(scale)) {
    return defaultBarkTextureScale;
  }

  return new Cartesian2(scale.x ?? 1.0, scale.y ?? 1.0);
}

function createBarkTexture(context, image) {
  const texture = new Texture({
    context: context,
    source: image,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    sampler: barkTextureSampler,
    flipY: false,
  });
  texture.generateMipmap();
  return texture;
}

function loadBarkTextureRecord(context, resources, barkType) {
  const path = barkTexturePaths[barkType];
  const record = {
    texture: undefined,
    promise: undefined,
    error: undefined,
    destroyed: false,
  };

  if (!defined(path)) {
    return record;
  }

  resources.pendingTextureCount++;
  const resource = Resource.createIfNeeded(getEzTreeAssetUrl(path));
  record.promise = resource
    .fetchImage()
    .then(function (image) {
      resources.pendingTextureCount = Math.max(
        0,
        resources.pendingTextureCount - 1,
      );
      if (!defined(image)) {
        return;
      }

      const texture = createBarkTexture(context, image);
      if (record.destroyed) {
        texture.destroy();
        return;
      }

      record.texture = texture;
    })
    .catch(function (error) {
      resources.pendingTextureCount = Math.max(
        0,
        resources.pendingTextureCount - 1,
      );
      record.error = error;
    });

  return record;
}

function getBarkTextureRecord(resources, context, barkType) {
  let record = resources.barkTextureRecords.get(barkType);
  if (!defined(record)) {
    record = loadBarkTextureRecord(context, resources, barkType);
    resources.barkTextureRecords.set(barkType, record);
  }

  return record;
}

function getBarkTexture(record, context) {
  if (defined(record) && defined(record.texture)) {
    return record.texture;
  }

  return context.defaultTexture;
}

function isBarkTextureReady(record) {
  return defined(record) && defined(record.texture);
}

function destroyBarkTextureRecord(record) {
  record.destroyed = true;
  record.texture = record.texture && record.texture.destroy();
}

function normalizeScale(scale, result) {
  if (typeof scale === "number") {
    return Cartesian3.fromElements(scale, scale, scale, result);
  }
  if (defined(scale)) {
    return Cartesian3.clone(scale, result);
  }
  return Cartesian3.clone(Cartesian3.ONE, result);
}

function getInstanceRadius(instance, scale) {
  if (instance.kind === "grass") {
    return Math.max(Math.max(scale.x, scale.y) * 1.5, scale.z * 2.1);
  }

  if (instance.kind === "flower") {
    return Math.max(scale.x, scale.y, scale.z) * 110.0;
  }

  if (instance.kind === "rock") {
    return Math.max(scale.x, scale.y, scale.z) * 1.4;
  }

  return Math.max(scale.x, scale.y, scale.z) * 60.0;
}

function getInstanceTranslation(instance, result) {
  return Cartesian3.clone(
    instance.translation ?? instance.position ?? Cartesian3.ZERO,
    result,
  );
}

function createSharedVertexBuffer(context, typedArray) {
  const buffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: typedArray,
    usage: BufferUsage.STATIC_DRAW,
  });
  buffer.vertexArrayDestroyable = false;
  return buffer;
}

function createIndexTypedArray(source, context) {
  const vertexCount = source.positions.length / 3;
  if (
    vertexCount >= CesiumMath.SIXTY_FOUR_KILOBYTES &&
    context.elementIndexUint
  ) {
    return new Uint32Array(source.indices);
  }

  return new Uint16Array(source.indices);
}

function createSharedIndexBuffer(context, typedArray) {
  const buffer = Buffer.createIndexBuffer({
    context: context,
    typedArray: typedArray,
    usage: BufferUsage.STATIC_DRAW,
    indexDatatype: IndexDatatype.fromTypedArray(typedArray),
  });
  buffer.vertexArrayDestroyable = false;
  return buffer;
}

function createMeshResource(context, source) {
  if (!defined(source) || source.indices.length === 0) {
    return undefined;
  }

  const indices = createIndexTypedArray(source, context);
  const positionBuffer = createSharedVertexBuffer(context, source.positions);
  const normalBuffer = createSharedVertexBuffer(context, source.normals);
  const stBuffer = createSharedVertexBuffer(context, source.st);
  const windWeightBuffer = createSharedVertexBuffer(
    context,
    source.windWeights,
  );
  const indexBuffer = createSharedIndexBuffer(context, indices);

  return {
    positionBuffer: positionBuffer,
    normalBuffer: normalBuffer,
    stBuffer: stBuffer,
    windWeightBuffer: windWeightBuffer,
    indexBuffer: indexBuffer,
    indexCount: source.indices.length,
    byteLength:
      source.positions.byteLength +
      source.normals.byteLength +
      source.st.byteLength +
      source.windWeights.byteLength +
      indices.byteLength,
  };
}

function destroyMeshResource(meshResource) {
  if (!defined(meshResource)) {
    return;
  }

  meshResource.positionBuffer =
    meshResource.positionBuffer && meshResource.positionBuffer.destroy();
  meshResource.normalBuffer =
    meshResource.normalBuffer && meshResource.normalBuffer.destroy();
  meshResource.stBuffer =
    meshResource.stBuffer && meshResource.stBuffer.destroy();
  meshResource.windWeightBuffer =
    meshResource.windWeightBuffer && meshResource.windWeightBuffer.destroy();
  meshResource.indexBuffer =
    meshResource.indexBuffer && meshResource.indexBuffer.destroy();
}

function createInstanceBuffer(context, typedArray) {
  return Buffer.createVertexBuffer({
    context: context,
    typedArray: typedArray,
    usage: BufferUsage.STATIC_DRAW,
  });
}

function createVertexArray(context, meshResource, instanceAttributes) {
  const instanceBuffer = createInstanceBuffer(
    context,
    instanceAttributes.values,
  );

  return new VertexArray({
    context: context,
    attributes: [
      {
        index: attributeLocations.a_position,
        vertexBuffer: meshResource.positionBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
      },
      {
        index: attributeLocations.a_normal,
        vertexBuffer: meshResource.normalBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
      },
      {
        index: attributeLocations.a_st,
        vertexBuffer: meshResource.stBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
      },
      {
        index: attributeLocations.a_windWeight,
        vertexBuffer: meshResource.windWeightBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 1,
      },
      {
        index: attributeLocations.a_instanceTranslation,
        vertexBuffer: instanceBuffer,
        componentDatatype: ComponentDatatype.UNSIGNED_SHORT,
        componentsPerAttribute: 3,
        normalize: true,
        offsetInBytes: INSTANCE_TRANSLATION_OFFSET_IN_BYTES,
        strideInBytes: INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
        instanceDivisor: 1,
      },
      {
        index: attributeLocations.a_instanceScale,
        vertexBuffer: instanceBuffer,
        componentDatatype: ComponentDatatype.UNSIGNED_SHORT,
        componentsPerAttribute: 3,
        normalize: true,
        offsetInBytes: INSTANCE_SCALE_OFFSET_IN_BYTES,
        strideInBytes: INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
        instanceDivisor: 1,
      },
      {
        index: attributeLocations.a_instanceRotationWind,
        vertexBuffer: instanceBuffer,
        componentDatatype: ComponentDatatype.UNSIGNED_SHORT,
        componentsPerAttribute: 2,
        normalize: true,
        offsetInBytes: INSTANCE_ROTATION_WIND_OFFSET_IN_BYTES,
        strideInBytes: INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
        instanceDivisor: 1,
      },
      {
        index: attributeLocations.a_instanceColor,
        vertexBuffer: instanceBuffer,
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 4,
        normalize: true,
        offsetInBytes: INSTANCE_COLOR_OFFSET_IN_BYTES,
        strideInBytes: INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
        instanceDivisor: 1,
      },
    ],
    indexBuffer: meshResource.indexBuffer,
  });
}

function createCommand(options) {
  const {
    primitive,
    context,
    shaderProgram,
    meshResource,
    instanceCount,
    instanceAttributes,
    baseColor,
    barkTextureRecord,
    barkTextureScale,
    assetColorTexture,
    cutoutType,
    alphaCutoff,
    roundedLeafNormals,
    maximumDistance,
    boundingSphere,
    lodNearDistance,
    lodFarDistance,
    minimumLodRatio,
  } = options;

  if (instanceCount === 0 || !defined(meshResource)) {
    return undefined;
  }

  const vertexArray = createVertexArray(
    context,
    meshResource,
    instanceAttributes,
  );

  const uniformMap = {
    u_time: function () {
      return nowSeconds() - primitive._startTime;
    },
    u_windDirection: function () {
      return primitive.windDirection;
    },
    u_windStrength: function () {
      return primitive.windStrength;
    },
    u_windFrequency: function () {
      return primitive.windFrequency;
    },
    u_windScale: function () {
      return primitive.windScale;
    },
    u_baseColor: function () {
      return baseColor;
    },
    u_barkColorTexture: function () {
      return getBarkTexture(barkTextureRecord, context);
    },
    u_barkTextureScale: function () {
      return barkTextureScale ?? defaultBarkTextureScale;
    },
    u_useBarkTexture: function () {
      return isBarkTextureReady(barkTextureRecord) ? 1 : 0;
    },
    u_assetColorTexture: function () {
      return assetColorTexture ?? context.defaultTexture;
    },
    u_useAssetColorTexture: function () {
      return defined(assetColorTexture) ? 1 : 0;
    },
    u_cutoutType: function () {
      return cutoutType;
    },
    u_alphaCutoff: function () {
      return alphaCutoff;
    },
    u_roundedLeafNormals: function () {
      return roundedLeafNormals ? 1 : 0;
    },
    u_instanceTranslationMinimum: function () {
      return instanceAttributes.translationMinimum;
    },
    u_instanceTranslationScale: function () {
      return instanceAttributes.translationDecodeScale;
    },
    u_instanceScaleMinimum: function () {
      return instanceAttributes.scaleMinimum;
    },
    u_instanceScaleScale: function () {
      return instanceAttributes.scaleDecodeScale;
    },
  };

  const command = new DrawCommand({
    boundingVolume: boundingSphere ?? primitive._boundingSphere,
    modelMatrix: primitive.modelMatrix,
    pass: Pass.OPAQUE,
    shaderProgram: shaderProgram,
    renderState: primitive._renderState,
    vertexArray: vertexArray,
    count: meshResource.indexCount,
    instanceCount: instanceCount,
    primitiveType: PrimitiveType.TRIANGLES,
    uniformMap: uniformMap,
    owner: primitive,
    cull: true,
    occlude: true,
  });

  return {
    command: command,
    vertexArray: vertexArray,
    boundingSphere: boundingSphere,
    instanceCount: instanceCount,
    gpuMemoryBytes: instanceAttributes.byteLength,
    maximumDistance: maximumDistance,
    lodNearDistance: lodNearDistance,
    lodFarDistance: lodFarDistance,
    minimumLodRatio: minimumLodRatio,
  };
}

function createCommandRecord(options) {
  return {
    meshResource: options.meshResource,
    instances: options.instances,
    colorMode: options.colorMode,
    baseColor: options.baseColor,
    barkTextureRecord: options.barkTextureRecord,
    barkTextureScale: options.barkTextureScale,
    assetColorTexture: options.assetColorTexture,
    cutoutType: options.cutoutType,
    alphaCutoff: options.alphaCutoff,
    roundedLeafNormals: options.roundedLeafNormals ?? false,
    boundingSphere: options.boundingSphere,
    instanceCount: options.instances.length,
    maximumDistance: options.maximumDistance,
    lodNearDistance: options.lodNearDistance,
    lodFarDistance: options.lodFarDistance,
    minimumLodRatio: options.minimumLodRatio,
    cellX: options.cellX,
    cellY: options.cellY,
    estimatedGpuMemoryBytes:
      options.instances.length * INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES,
    instanceAttributes: undefined,
    instanceAttributesPromise: undefined,
    instanceAttributesError: undefined,
    command: undefined,
    vertexArray: undefined,
    lastUsedFrame: -1,
    gpuMemoryBytes: 0,
    tile: undefined,
  };
}

function destroyCommandRecordResources(record, resources) {
  if (!defined(record) || !defined(record.vertexArray)) {
    return false;
  }

  const gpuMemoryBytes = record.gpuMemoryBytes;
  record.vertexArray = record.vertexArray.destroy();
  record.command = undefined;
  record.gpuMemoryBytes = 0;

  if (defined(resources)) {
    resources.cachedCommandCount = Math.max(
      0,
      resources.cachedCommandCount - 1,
    );
    resources.instanceGpuMemoryBytes = Math.max(
      0,
      resources.instanceGpuMemoryBytes - gpuMemoryBytes,
    );
  }
  if (defined(record.tile)) {
    record.tile.cachedCommandCount = Math.max(
      0,
      record.tile.cachedCommandCount - 1,
    );
  }

  return true;
}

let createInstanceAttributesTaskProcessor;
let createVegetationInstancesTaskProcessor;
let createInstanceAttributesTaskProcessorUrl;
let createVegetationInstancesTaskProcessorUrl;

function getCreateInstanceAttributesTaskProcessor() {
  const workerUrl = getEzTreeWorkerUrl("createEzTreeInstanceAttributes");
  if (
    !defined(createInstanceAttributesTaskProcessor) ||
    createInstanceAttributesTaskProcessorUrl !== workerUrl
  ) {
    if (defined(createInstanceAttributesTaskProcessor)) {
      createInstanceAttributesTaskProcessor.destroy();
    }
    createInstanceAttributesTaskProcessor = new TaskProcessor(
      workerUrl,
      Math.max(FeatureDetection.hardwareConcurrency - 1, 1),
    );
    createInstanceAttributesTaskProcessorUrl = workerUrl;
  }
  return createInstanceAttributesTaskProcessor;
}

function getCreateVegetationInstancesTaskProcessor() {
  const workerUrl = getEzTreeWorkerUrl("createEzTreeVegetationInstances");
  if (
    !defined(createVegetationInstancesTaskProcessor) ||
    createVegetationInstancesTaskProcessorUrl !== workerUrl
  ) {
    if (defined(createVegetationInstancesTaskProcessor)) {
      createVegetationInstancesTaskProcessor.destroy();
    }
    createVegetationInstancesTaskProcessor = new TaskProcessor(
      workerUrl,
      1,
    );
    createVegetationInstancesTaskProcessorUrl = workerUrl;
  }
  return createVegetationInstancesTaskProcessor;
}

function setCommandRecordInstanceAttributes(record, attributes) {
  record.instanceAttributes = cloneEzTreeInstanceAttributes(attributes);
  record.instances = undefined;
  record.colorMode = undefined;
}

function createCommandRecordInstanceAttributes(record) {
  setCommandRecordInstanceAttributes(
    record,
    createEzTreeInstanceAttributes(record.instances, record.colorMode),
  );
  return true;
}

function scheduleCommandRecordInstanceAttributes(record, primitive) {
  if (defined(record.instanceAttributes)) {
    return true;
  }

  if (defined(record.instanceAttributesError)) {
    record.instanceAttributesError = undefined;
    return createCommandRecordInstanceAttributes(record);
  }

  if (defined(record.instanceAttributesPromise)) {
    return false;
  }

  if (
    !getEzTreeUseWorkers() ||
    !primitive.workerPacking ||
    !FeatureDetection.supportsWebWorkers() ||
    !defined(record.instances)
  ) {
    return createCommandRecordInstanceAttributes(record);
  }

  const taskProcessor = getCreateInstanceAttributesTaskProcessor();
  const promise = taskProcessor.scheduleTask({
    instances: record.instances,
    colorMode: record.colorMode,
  });

  if (!defined(promise)) {
    return false;
  }

  record.instanceAttributesPromise = promise
    .then(function (attributes) {
      setCommandRecordInstanceAttributes(record, attributes);
      record.instanceAttributesPromise = undefined;
    })
    .catch(function (error) {
      record.instanceAttributesError = error;
      record.instanceAttributesPromise = undefined;
    });
  return false;
}

function ensureCommandRecordResources(
  record,
  primitive,
  context,
  shaderProgram,
  resources,
) {
  if (defined(record.command)) {
    return true;
  }

  if (!scheduleCommandRecordInstanceAttributes(record, primitive)) {
    return false;
  }

  const commandRecord = createCommand({
    primitive: primitive,
    context: context,
    shaderProgram: shaderProgram,
    meshResource: record.meshResource,
    instanceCount: record.instanceCount,
    instanceAttributes: record.instanceAttributes,
    baseColor: record.baseColor,
    barkTextureRecord: record.barkTextureRecord,
    barkTextureScale: record.barkTextureScale,
    assetColorTexture: record.assetColorTexture,
    cutoutType: record.cutoutType,
    alphaCutoff: record.alphaCutoff,
    roundedLeafNormals: record.roundedLeafNormals,
    maximumDistance: record.maximumDistance,
    boundingSphere: record.boundingSphere,
    lodNearDistance: record.lodNearDistance,
    lodFarDistance: record.lodFarDistance,
    minimumLodRatio: record.minimumLodRatio,
  });

  if (!defined(commandRecord)) {
    return false;
  }

  record.command = commandRecord.command;
  record.vertexArray = commandRecord.vertexArray;
  record.gpuMemoryBytes = commandRecord.gpuMemoryBytes;
  if (defined(resources)) {
    resources.cachedCommandCount++;
    resources.instanceGpuMemoryBytes += record.gpuMemoryBytes;
  }
  if (defined(record.tile)) {
    record.tile.cachedCommandCount++;
  }
  return true;
}

class CreateCommandRecordResourcesJob {
  constructor() {
    this.record = undefined;
    this.primitive = undefined;
    this.context = undefined;
    this.shaderProgram = undefined;
    this.resources = undefined;
    this.ready = false;
  }

  set(record, primitive, context, shaderProgram) {
    this.record = record;
    this.primitive = primitive;
    this.context = context;
    this.shaderProgram = shaderProgram;
    this.resources = primitive._resources;
    this.ready = false;
  }

  execute() {
    this.ready = ensureCommandRecordResources(
      this.record,
      this.primitive,
      this.context,
      this.shaderProgram,
      this.resources,
    );
  }
}

const scratchCommandRecordResourcesJob = new CreateCommandRecordResourcesJob();

function processCommandRecordResources(
  record,
  primitive,
  frameState,
  shaderProgram,
) {
  if (!primitive.asynchronous || !defined(frameState.jobScheduler)) {
    return ensureCommandRecordResources(
      record,
      primitive,
      frameState.context,
      shaderProgram,
      primitive._resources,
    );
  }

  const job = scratchCommandRecordResourcesJob;
  job.set(record, primitive, frameState.context, shaderProgram);
  if (!frameState.jobScheduler.execute(job, JobType.BUFFER)) {
    return false;
  }

  return job.ready;
}

function computeBoundingSphere(primitive, instances) {
  if (instances.length === 0) {
    return new BoundingSphere(
      Matrix4.getTranslation(primitive.modelMatrix, new Cartesian3()),
      0.0,
    );
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const translation = new Cartesian3();
  const scale = new Cartesian3();

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    getInstanceTranslation(instance, translation);
    normalizeScale(instance.scale, scale);
    const radius = getInstanceRadius(instance, scale);
    minX = Math.min(minX, translation.x - radius);
    minY = Math.min(minY, translation.y - radius);
    minZ = Math.min(minZ, translation.z);
    maxX = Math.max(maxX, translation.x + radius);
    maxY = Math.max(maxY, translation.y + radius);
    maxZ = Math.max(maxZ, translation.z + radius);
  }

  const localCenter = Cartesian3.fromElements(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
    new Cartesian3(),
  );
  const half = Cartesian3.fromElements(
    (maxX - minX) * 0.5,
    (maxY - minY) * 0.5,
    (maxZ - minZ) * 0.5,
    new Cartesian3(),
  );
  const radius = Cartesian3.magnitude(half);
  const worldCenter = Matrix4.multiplyByPoint(
    primitive.modelMatrix,
    localCenter,
    new Cartesian3(),
  );
  return new BoundingSphere(worldCenter, radius);
}

function getCameraDistanceToBoundingSphere(camera, sphere) {
  if (!defined(camera) || !defined(sphere)) {
    return 0.0;
  }
  return Math.max(
    0.0,
    Cartesian3.distance(camera.positionWC, sphere.center) - sphere.radius,
  );
}

function isBoundingSphereBeyondDistance(camera, sphere, maximumDistance) {
  if (
    !defined(camera) ||
    !defined(sphere) ||
    !Number.isFinite(maximumDistance)
  ) {
    return false;
  }

  const limit = maximumDistance + sphere.radius;
  return (
    Cartesian3.distanceSquared(camera.positionWC, sphere.center) > limit * limit
  );
}

function getLodInstanceCount(record, distance) {
  if (defined(record.maximumDistance) && distance > record.maximumDistance) {
    return 0;
  }

  const nearDistance = record.lodNearDistance;
  const farDistance = record.lodFarDistance;
  if (
    !defined(nearDistance) ||
    !defined(farDistance) ||
    farDistance <= nearDistance
  ) {
    return record.instanceCount;
  }

  const minimumRatio = CesiumMath.clamp(
    record.minimumLodRatio ?? 1.0,
    0.0,
    1.0,
  );
  const t = CesiumMath.clamp(
    (distance - nearDistance) / (farDistance - nearDistance),
    0.0,
    1.0,
  );
  const ratio = 1.0 - (1.0 - minimumRatio) * t;
  const instanceCount = Math.ceil(record.instanceCount * ratio);
  if (instanceCount === 0) {
    return 0;
  }

  return Math.min(record.instanceCount, Math.max(1, instanceCount));
}

const scratchPreloadBoundingSphere = new BoundingSphere();

function isBoundingSphereVisible(frameState, boundingSphere, radiusOffset) {
  if (!defined(frameState.cullingVolume) || !defined(boundingSphere)) {
    return true;
  }

  if (defined(radiusOffset) && radiusOffset > 0.0) {
    BoundingSphere.clone(boundingSphere, scratchPreloadBoundingSphere);
    scratchPreloadBoundingSphere.radius += radiusOffset;
    boundingSphere = scratchPreloadBoundingSphere;
  }

  return (
    frameState.cullingVolume.computeVisibility(boundingSphere) !==
    Intersect.OUTSIDE
  );
}

function releaseStaleCommandRecord(
  record,
  frameNumber,
  cacheFrames,
  resources,
) {
  if (
    defined(record.vertexArray) &&
    frameNumber - record.lastUsedFrame > cacheFrames
  ) {
    destroyCommandRecordResources(record, resources);
    return true;
  }
  return false;
}

function releaseStaleTileRecords(
  tile,
  resources,
  frameNumber,
  cacheFrames,
  maximumDestroys,
) {
  if (
    maximumDestroys <= 0 ||
    tile.cachedCommandCount === 0 ||
    frameNumber - tile.lastUsedFrame <= cacheFrames
  ) {
    return 0;
  }

  const records = tile.records;
  let destroyedCount = 0;
  let index = tile.nextDestroyIndex;
  for (let i = 0; i < records.length && destroyedCount < maximumDestroys; i++) {
    const record = records[index];
    index = (index + 1) % records.length;
    if (
      releaseStaleCommandRecord(record, frameNumber, cacheFrames, resources)
    ) {
      destroyedCount++;
    }
  }
  tile.nextDestroyIndex = index;

  return destroyedCount;
}

function trimCommandRecordCache(
  resources,
  maximumCachedCommands,
  frameNumber,
  maximumDestroys,
) {
  if (
    !Number.isFinite(maximumCachedCommands) ||
    resources.cachedCommandCount <= maximumCachedCommands
  ) {
    return 0;
  }

  const cachedRecords = [];
  for (let i = 0; i < resources.records.length; i++) {
    const record = resources.records[i];
    if (defined(record.vertexArray)) {
      cachedRecords.push(record);
    }
  }

  let destroyCount = resources.cachedCommandCount - maximumCachedCommands;
  if (destroyCount <= 0) {
    return 0;
  }
  maximumDestroys = Number.isFinite(maximumDestroys)
    ? Math.max(0, maximumDestroys)
    : Number.POSITIVE_INFINITY;
  destroyCount = Math.min(destroyCount, maximumDestroys);

  cachedRecords.sort(function (left, right) {
    return left.lastUsedFrame - right.lastUsedFrame;
  });

  let destroyedCount = 0;
  for (let i = 0; i < cachedRecords.length && destroyCount > 0; i++) {
    const record = cachedRecords[i];
    if (record.lastUsedFrame === frameNumber) {
      continue;
    }
    destroyCommandRecordResources(record, resources);
    destroyCount--;
    destroyedCount++;
  }

  return destroyedCount;
}

function updateStatistics(primitive) {
  const resources = primitive._resources;
  const statistics = primitive._statistics;
  if (!defined(resources)) {
    statistics.totalCommands = 0;
    statistics.totalTiles = 0;
    statistics.cachedCommands = 0;
    statistics.gpuMemoryBytes = 0;
    statistics.packedCpuMemoryBytes = 0;
    statistics.pendingWorkerTasks = 0;
    return;
  }

  const cachedCommands = resources.cachedCommandCount;
  const gpuMemoryBytes =
    resources.meshGpuMemoryBytes + resources.instanceGpuMemoryBytes;
  let packedCpuMemoryBytes = 0;
  let pendingWorkerTasks = 0;
  for (let i = 0; i < resources.records.length; i++) {
    const record = resources.records[i];
    if (defined(record.instanceAttributes)) {
      packedCpuMemoryBytes += record.instanceAttributes.byteLength;
    }
    if (defined(record.instanceAttributesPromise)) {
      pendingWorkerTasks++;
    }
  }
  if (!resources.gltfRecordsBuilt) {
    pendingWorkerTasks += resources.gltfAssetRecords.length;
  }

  statistics.totalCommands = resources.records.length;
  statistics.totalTiles = resources.tiles.length;
  statistics.cachedCommands = cachedCommands;
  statistics.gpuMemoryBytes = gpuMemoryBytes;
  statistics.packedCpuMemoryBytes = packedCpuMemoryBytes;
  statistics.pendingWorkerTasks = pendingWorkerTasks;
}

function groupTreeInstances(instances) {
  const groups = new Map();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    if (instance.kind !== "tree") {
      continue;
    }
    const preset = instance.preset ?? "Oak Medium";
    let group = groups.get(preset);
    if (!defined(group)) {
      group = [];
      groups.set(preset, group);
    }
    group.push(instance);
  }
  return groups;
}

function groupInstancesByCell(instances, cellSize) {
  const groups = new Map();
  const translation = new Cartesian3();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    getInstanceTranslation(instance, translation);
    const cellX = Math.floor(translation.x / cellSize);
    const cellY = Math.floor(translation.y / cellSize);
    const key = `${cellX},${cellY}`;
    let group = groups.get(key);
    if (!defined(group)) {
      group = {
        instances: [],
        cellX: cellX,
        cellY: cellY,
      };
      groups.set(key, group);
    }
    group.instances.push(instance);
  }
  return groups;
}

function createRecordTile() {
  return {
    records: [],
    boundingSpheres: [],
    boundingSphere: undefined,
    maximumDistance: 0.0,
    cachedCommandCount: 0,
    lastUsedFrame: -1,
    nextDestroyIndex: 0,
  };
}

function getRecordMaximumDistance(record) {
  return record.maximumDistance ?? Number.POSITIVE_INFINITY;
}

function buildRecordTiles(records, primitive) {
  const tileSize = Math.max(primitive.lodCellSize, primitive.cullingTileSize);
  if (!Number.isFinite(tileSize) || tileSize <= 0.0) {
    const tile = createRecordTile();
    tile.records = records.slice();
    tile.boundingSphere = primitive._boundingSphere;
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      record.tile = tile;
      tile.maximumDistance = Math.max(
        tile.maximumDistance,
        getRecordMaximumDistance(record),
      );
    }
    return [tile];
  }

  const groups = new Map();
  const cellsPerTile = Math.max(
    1,
    Math.round(tileSize / primitive.lodCellSize),
  );
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const tileX = Math.floor(record.cellX / cellsPerTile);
    const tileY = Math.floor(record.cellY / cellsPerTile);
    const key = `${tileX},${tileY}`;
    let tile = groups.get(key);
    if (!defined(tile)) {
      tile = createRecordTile();
      groups.set(key, tile);
    }

    record.tile = tile;
    tile.records.push(record);
    tile.boundingSpheres.push(record.boundingSphere);
    tile.maximumDistance = Math.max(
      tile.maximumDistance,
      getRecordMaximumDistance(record),
    );
  }

  const tiles = [];
  groups.forEach(function (tile) {
    tile.boundingSphere = BoundingSphere.fromBoundingSpheres(
      tile.boundingSpheres,
      new BoundingSphere(),
    );
    tile.boundingSpheres = undefined;
    tiles.push(tile);
  });

  return tiles;
}

function collectInstances(instances, kind) {
  const result = [];
  for (let i = 0; i < instances.length; i++) {
    if (instances[i].kind === kind) {
      result.push(instances[i]);
    }
  }
  return result;
}

function collectInstancesByAsset(instances, kind, fallbackAsset) {
  const groups = new Map();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    if (instance.kind !== kind) {
      continue;
    }

    const asset = instance.asset ?? fallbackAsset;
    let group = groups.get(asset);
    if (!defined(group)) {
      group = [];
      groups.set(asset, group);
    }
    group.push(instance);
  }
  return groups;
}

function addMeshResource(resources, context, source) {
  const meshResource = createMeshResource(context, source);
  if (defined(meshResource)) {
    resources.meshResources.push(meshResource);
    resources.meshGpuMemoryBytes += meshResource.byteLength;
  }
  return meshResource;
}

function addCommandRecord(resources, record) {
  if (defined(record.meshResource) && record.instances.length > 0) {
    resources.records.push(record);
  }
}

function createColorFromFactor(factor, result) {
  result = result ?? new Color();
  result.red = factor[0] ?? 1.0;
  result.green = factor[1] ?? 1.0;
  result.blue = factor[2] ?? 1.0;
  result.alpha = factor[3] ?? 1.0;
  return result;
}

function multiplyColors(left, right, result) {
  result = result ?? new Color();
  result.red = left.red * right.red;
  result.green = left.green * right.green;
  result.blue = left.blue * right.blue;
  result.alpha = left.alpha * right.alpha;
  return result;
}

function pushGltfAssetRecord(resources, asset, path, wind) {
  const record = createEzTreeGltfAssetRecord({
    path: path,
    wind: wind,
  });
  resources.gltfAssetRecords.push({
    asset: asset,
    record: record,
  });
  resources.gltfAssetMap.set(asset, record);
  return record;
}

function addGltfAssetCommandRecords(options) {
  const {
    primitive,
    resources,
    context,
    assetRecord,
    instances,
    colorMode,
    baseColor,
    baseColorMultiplier,
    cutoutType,
    alphaCutoff,
    maximumDistance,
    lodNearDistance,
    lodFarDistance,
    minimumLodRatio,
  } = options;

  if (!defined(assetRecord) || !defined(assetRecord.primitives)) {
    return;
  }

  const cellGroups = groupInstancesByCell(instances, primitive.lodCellSize);
  for (let i = 0; i < assetRecord.primitives.length; i++) {
    const assetPrimitive = assetRecord.primitives[i];
    const meshResource = addMeshResource(
      resources,
      context,
      assetPrimitive.geometry,
    );
    const materialColor = createColorFromFactor(
      assetPrimitive.baseColorFactor,
      new Color(),
    );
    const commandBaseColor = defined(baseColor)
      ? multiplyColors(baseColor, materialColor, new Color())
      : multiplyColors(
          baseColorMultiplier ?? Color.WHITE,
          materialColor,
          new Color(),
        );
    const commandAlphaCutoff =
      alphaCutoff ??
      (assetPrimitive.alphaMode === "MASK" ? assetPrimitive.alphaCutoff : 0.0);

    cellGroups.forEach(function (cellGroup) {
      addCommandRecord(
        resources,
        createCommandRecord({
          meshResource: meshResource,
          instances: cellGroup.instances,
          colorMode: colorMode,
          baseColor: commandBaseColor,
          assetColorTexture: assetPrimitive.colorTexture,
          cutoutType: cutoutType,
          alphaCutoff: commandAlphaCutoff,
          roundedLeafNormals: false,
          maximumDistance: maximumDistance,
          boundingSphere: computeBoundingSphere(primitive, cellGroup.instances),
          lodNearDistance: lodNearDistance,
          lodFarDistance: lodFarDistance,
          minimumLodRatio: minimumLodRatio,
          cellX: cellGroup.cellX,
          cellY: cellGroup.cellY,
        }),
      );
    });
  }
}

function addGroundAssetRecords(primitive, context, resources) {
  const grassInstances = collectInstances(primitive._instances, "grass");
  const grassAsset = resources.gltfAssetMap.get("grass");
  if (grassInstances.length > 0) {
    addGltfAssetCommandRecords({
      primitive: primitive,
      resources: resources,
      context: context,
      assetRecord: grassAsset,
      instances: grassInstances,
      colorMode: {
        property: "color",
        fallbackColor: Color.LIME,
      },
      baseColor: Color.WHITE,
      cutoutType: CUTOUT_GRASS,
      alphaCutoff: 0.5,
      maximumDistance: primitive.maximumGrassDistance,
      lodNearDistance: primitive.grassLodNearDistance,
      lodFarDistance: primitive.grassLodFarDistance,
      minimumLodRatio: primitive.grassMinimumLodRatio,
    });
  }

  const flowerGroups = collectInstancesByAsset(
    primitive._instances,
    "flower",
    "flower_white",
  );
  flowerGroups.forEach(function (instances, asset) {
    addGltfAssetCommandRecords({
      primitive: primitive,
      resources: resources,
      context: context,
      assetRecord: resources.gltfAssetMap.get(asset),
      instances: instances,
      colorMode: {
        property: "color",
        fallbackColor: Color.WHITE,
        variationProperty: "colorVariation",
        variationDefault: 1.0,
      },
      baseColorMultiplier: Color.WHITE,
      cutoutType: CUTOUT_NONE,
      alphaCutoff: 0.0,
      maximumDistance: primitive.maximumFlowerDistance,
      lodNearDistance: primitive.flowerLodNearDistance,
      lodFarDistance: primitive.flowerLodFarDistance,
      minimumLodRatio: primitive.flowerMinimumLodRatio,
    });
  });

  const rockGroups = collectInstancesByAsset(
    primitive._instances,
    "rock",
    "rock1",
  );
  rockGroups.forEach(function (instances, asset) {
    addGltfAssetCommandRecords({
      primitive: primitive,
      resources: resources,
      context: context,
      assetRecord: resources.gltfAssetMap.get(asset),
      instances: instances,
      colorMode: {
        property: "color",
        fallbackColor: Color.WHITE,
        variationProperty: "colorVariation",
        variationDefault: 1.0,
      },
      baseColorMultiplier: Color.WHITE,
      cutoutType: CUTOUT_NONE,
      alphaCutoff: 0.0,
      maximumDistance: primitive.maximumRockDistance,
      lodNearDistance: primitive.rockLodNearDistance,
      lodFarDistance: primitive.rockLodFarDistance,
      minimumLodRatio: primitive.rockMinimumLodRatio,
    });
  });
}

function processGltfAssetRecords(primitive, frameState) {
  const resources = primitive._resources;
  if (!defined(resources) || resources.gltfRecordsBuilt) {
    return true;
  }

  const assetRecords = resources.gltfAssetRecords;
  let ready = true;
  for (let i = 0; i < assetRecords.length; i++) {
    const assetRecord = assetRecords[i].record;
    if (!defined(assetRecord.error)) {
      ready =
        processEzTreeGltfAssetRecord(assetRecord, frameState.context) && ready;
    }
  }

  if (!ready) {
    return false;
  }

  addGroundAssetRecords(primitive, frameState.context, resources);
  resources.tiles = buildRecordTiles(resources.records, primitive);
  resources.gltfRecordsBuilt = true;
  updateStatistics(primitive);
  return true;
}

function destroyResources(primitive) {
  const resources = primitive._resources;
  if (!defined(resources)) {
    return;
  }

  for (let i = 0; i < resources.records.length; i++) {
    destroyCommandRecordResources(resources.records[i], resources);
  }
  for (let i = 0; i < resources.meshResources.length; i++) {
    destroyMeshResource(resources.meshResources[i]);
  }
  resources.barkTextureRecords.forEach(destroyBarkTextureRecord);
  for (let i = 0; i < resources.gltfAssetRecords.length; i++) {
    destroyEzTreeGltfAssetRecord(resources.gltfAssetRecords[i].record);
  }
  resources.shaderProgram =
    resources.shaderProgram && resources.shaderProgram.destroy();
  primitive._resources = undefined;
  primitive._renderState = undefined;
  updateStatistics(primitive);
}

function buildResources(primitive, context) {
  if (!context.instancedArrays) {
    return;
  }

  primitive._boundingSphere = computeBoundingSphere(
    primitive,
    primitive._instances,
  );
  primitive._renderState = RenderState.fromCache({
    cull: {
      enabled: false,
    },
    depthTest: {
      enabled: true,
    },
    depthMask: true,
  });

  const shaderProgram = ShaderProgram.fromCache({
    context: context,
    vertexShaderSource: EzTreeInstancedVS,
    fragmentShaderSource: EzTreeVegetationFS,
    attributeLocations: attributeLocations,
  });

  const resources = {
    shaderProgram: shaderProgram,
    meshResources: [],
    meshGpuMemoryBytes: 0,
    instanceGpuMemoryBytes: 0,
    cachedCommandCount: 0,
    pendingTextureCount: 0,
    barkTextureRecords: new Map(),
    gltfAssetRecords: [],
    gltfAssetMap: new Map(),
    gltfRecordsBuilt: false,
    records: [],
    tiles: undefined,
  };

  const treeGroups = groupTreeInstances(primitive._instances);

  treeGroups.forEach(function (instances, presetName) {
    const options = loadPreset(presetName);
    if (defined(primitive.roundedLeafNormals)) {
      options.leaves.roundedNormals = primitive.roundedLeafNormals;
    }
    const treeGeometry = generateTreeGeometry(options);
    const branchMeshResource = addMeshResource(
      resources,
      context,
      treeGeometry.branches,
    );
    const leafMeshResource = addMeshResource(
      resources,
      context,
      treeGeometry.leaves,
    );
    const branchTint = colorFromInteger(options.bark.tint, new Color());
    const barkTextureRecord = options.bark.textured
      ? getBarkTextureRecord(resources, context, options.bark.type)
      : undefined;
    const barkTextureScale = barkTextureScaleFromOptions(options);
    const leafTint = leafColorFromOptions(options, new Color());
    const treeCellGroups = groupInstancesByCell(
      instances,
      primitive.lodCellSize,
    );

    treeCellGroups.forEach(function (cellGroup) {
      const cellInstances = cellGroup.instances;
      const boundingSphere = computeBoundingSphere(primitive, cellInstances);
      addCommandRecord(
        resources,
        createCommandRecord({
          meshResource: branchMeshResource,
          instances: cellInstances,
          colorMode: {
            property: "branchColor",
            fallbackColor: branchTint,
            variationProperty: "colorVariation",
            variationDefault: 1.0,
          },
          baseColor: Color.WHITE,
          barkTextureRecord: barkTextureRecord,
          barkTextureScale: barkTextureScale,
          cutoutType: CUTOUT_NONE,
          alphaCutoff: 0.0,
          roundedLeafNormals: false,
          maximumDistance: primitive.maximumTreeBranchDistance,
          boundingSphere: boundingSphere,
          lodNearDistance: primitive.treeBranchLodNearDistance,
          lodFarDistance: primitive.treeBranchLodFarDistance,
          minimumLodRatio: primitive.treeBranchMinimumLodRatio,
          cellX: cellGroup.cellX,
          cellY: cellGroup.cellY,
        }),
      );

      addCommandRecord(
        resources,
        createCommandRecord({
          meshResource: leafMeshResource,
          instances: cellInstances,
          colorMode: {
            property: "leafColor",
            fallbackColor: leafTint,
            variationProperty: "colorVariation",
            variationDefault: 1.0,
          },
          baseColor: Color.WHITE,
          cutoutType: CUTOUT_LEAF,
          alphaCutoff: options.leaves.alphaTest ?? 0.25,
          roundedLeafNormals: options.leaves.roundedNormals !== false,
          maximumDistance: primitive.maximumTreeLeafDistance,
          boundingSphere: boundingSphere,
          lodNearDistance: primitive.treeLeafLodNearDistance,
          lodFarDistance: primitive.treeLeafLodFarDistance,
          minimumLodRatio: primitive.treeLeafMinimumLodRatio,
          cellX: cellGroup.cellX,
          cellY: cellGroup.cellY,
        }),
      );
    });
  });

  const grassInstances = collectInstances(primitive._instances, "grass");
  if (grassInstances.length > 0) {
    pushGltfAssetRecord(resources, "grass", gltfAssetPaths.grass, true);
  }

  const flowerGroups = collectInstancesByAsset(
    primitive._instances,
    "flower",
    "flower_white",
  );
  if (flowerGroups.has("flower_white")) {
    pushGltfAssetRecord(
      resources,
      "flower_white",
      gltfAssetPaths.flowerWhite,
      true,
    );
  }
  if (flowerGroups.has("flower_blue")) {
    pushGltfAssetRecord(
      resources,
      "flower_blue",
      gltfAssetPaths.flowerBlue,
      true,
    );
  }
  if (flowerGroups.has("flower_yellow")) {
    pushGltfAssetRecord(
      resources,
      "flower_yellow",
      gltfAssetPaths.flowerYellow,
      true,
    );
  }

  const rockGroups = collectInstancesByAsset(
    primitive._instances,
    "rock",
    "rock1",
  );
  if (rockGroups.has("rock1")) {
    pushGltfAssetRecord(resources, "rock1", gltfAssetPaths.rock1, false);
  }
  if (rockGroups.has("rock2")) {
    pushGltfAssetRecord(resources, "rock2", gltfAssetPaths.rock2, false);
  }
  if (rockGroups.has("rock3")) {
    pushGltfAssetRecord(resources, "rock3", gltfAssetPaths.rock3, false);
  }

  resources.gltfRecordsBuilt = resources.gltfAssetRecords.length === 0;
  resources.tiles = buildRecordTiles(resources.records, primitive);
  primitive._resources = resources;
  primitive._needsRebuild = false;
  updateStatistics(primitive);
}

/**
 * Instanced procedural trees, grass, flowers, and rocks generated from the EzTree
 * algorithm and rendered with Cesium draw commands.
 *
 * @alias EzTreePrimitive
 * @constructor
 *
 * @param {object} [options]
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Local ENU-to-world transform.
 * @param {object[]} [options.instances=[]] Vegetation instances in local ENU meters.
 * @param {boolean} [options.show=true] Whether the primitive is shown.
 * @param {number} [options.lodCellSize=180.0] Local grid cell size used for culling and GPU resource streaming.
 * @param {number} [options.cullingTileSize=720.0] Coarse tile size used to skip groups of LOD cells during view culling.
 * @param {number} [options.maximumCachedCommands=256] Maximum number of offscreen command resources retained on the GPU.
 * @param {number} [options.gpuResourceCacheFrames=90] Number of frames to retain unused command resources before releasing them.
 * @param {number} [options.maximumCommandBuildsPerFrame=8] Maximum number of command resources uploaded in one frame.
 * @param {number} [options.maximumCommandDestroysPerFrame=32] Maximum number of command resources released in one frame.
 * @param {number} [options.maximumUploadBytesPerFrame=524288] Approximate maximum instance buffer bytes uploaded in one frame.
 * @param {number} [options.gpuPreloadRadius=240.0] Extra culling radius used to preload cells just outside the view.
 * @param {number} [options.statisticsUpdateInterval=30] Number of frames between expensive statistics refreshes.
 * @param {boolean} [options.asynchronous=true] Whether buffer creation is time-sliced with Cesium's job scheduler.
 * @param {boolean} [options.workerPacking=true] Whether instance attributes are quantized in a TaskProcessor worker when available.
 * @param {boolean} [options.roundedLeafNormals=true] Whether tree leaf normals imply a rounded canopy shape.
 * @param {number} [options.maximumRockDistance=2800.0] Maximum camera distance for rock rendering.
 * @param {number} [options.rockMinimumLodRatio=0.35] Minimum rock instance ratio at the far LOD distance.
 */
function EzTreePrimitive(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  this.show = options.show ?? true;
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  this.debugShowBoundingVolume = options.debugShowBoundingVolume ?? false;
  this.windDirection = Cartesian2.clone(
    options.windDirection ?? new Cartesian2(1.0, 0.35),
  );
  this.windStrength = options.windStrength ?? 0.35;
  this.windFrequency = options.windFrequency ?? 1.1;
  this.windScale = options.windScale ?? 55.0;
  this.lodCellSize = options.lodCellSize ?? 180.0;
  this.cullingTileSize = options.cullingTileSize ?? DEFAULT_CULLING_TILE_SIZE;
  this.maximumTreeBranchDistance = options.maximumTreeBranchDistance ?? 6000.0;
  this.treeBranchLodNearDistance = options.treeBranchLodNearDistance ?? 1200.0;
  this.treeBranchLodFarDistance =
    options.treeBranchLodFarDistance ?? this.maximumTreeBranchDistance;
  this.treeBranchMinimumLodRatio = options.treeBranchMinimumLodRatio ?? 0.35;
  this.maximumTreeLeafDistance = options.maximumTreeLeafDistance ?? 4000.0;
  this.treeLeafLodNearDistance = options.treeLeafLodNearDistance ?? 800.0;
  this.treeLeafLodFarDistance =
    options.treeLeafLodFarDistance ?? this.maximumTreeLeafDistance;
  this.treeLeafMinimumLodRatio = options.treeLeafMinimumLodRatio ?? 0.2;
  this.maximumGrassDistance = options.maximumGrassDistance ?? 2500.0;
  this.grassLodNearDistance = options.grassLodNearDistance ?? 250.0;
  this.grassLodFarDistance =
    options.grassLodFarDistance ?? this.maximumGrassDistance;
  this.grassMinimumLodRatio = options.grassMinimumLodRatio ?? 0.08;
  this.maximumFlowerDistance = options.maximumFlowerDistance ?? 1800.0;
  this.flowerLodNearDistance = options.flowerLodNearDistance ?? 180.0;
  this.flowerLodFarDistance =
    options.flowerLodFarDistance ?? this.maximumFlowerDistance;
  this.flowerMinimumLodRatio = options.flowerMinimumLodRatio ?? 0.12;
  this.maximumRockDistance = options.maximumRockDistance ?? 2800.0;
  this.rockLodNearDistance = options.rockLodNearDistance ?? 600.0;
  this.rockLodFarDistance =
    options.rockLodFarDistance ?? this.maximumRockDistance;
  this.rockMinimumLodRatio = options.rockMinimumLodRatio ?? 0.35;
  this.maximumCachedCommands =
    options.maximumCachedCommands ?? DEFAULT_MAXIMUM_CACHED_COMMANDS;
  this.gpuResourceCacheFrames =
    options.gpuResourceCacheFrames ?? DEFAULT_GPU_RESOURCE_CACHE_FRAMES;
  this.maximumCommandBuildsPerFrame =
    options.maximumCommandBuildsPerFrame ??
    DEFAULT_MAXIMUM_COMMAND_BUILDS_PER_FRAME;
  this.maximumCommandDestroysPerFrame =
    options.maximumCommandDestroysPerFrame ??
    DEFAULT_MAXIMUM_COMMAND_DESTROYS_PER_FRAME;
  this.maximumUploadBytesPerFrame =
    options.maximumUploadBytesPerFrame ??
    DEFAULT_MAXIMUM_UPLOAD_BYTES_PER_FRAME;
  this.gpuPreloadRadius =
    options.gpuPreloadRadius ?? DEFAULT_GPU_PRELOAD_RADIUS;
  this.statisticsUpdateInterval =
    options.statisticsUpdateInterval ?? DEFAULT_STATISTICS_UPDATE_INTERVAL;
  this.asynchronous = options.asynchronous ?? true;
  this.workerPacking = options.workerPacking ?? DEFAULT_WORKER_PACKING;
  this.roundedLeafNormals = options.roundedLeafNormals ?? true;

  this._instances = (options.instances ?? []).slice();
  this._resources = undefined;
  this._renderState = undefined;
  this._boundingSphere = undefined;
  this._startTime = nowSeconds();
  this._needsRebuild = true;
  this._lastStatisticsFrame = -1;
  this._statistics = {
    totalCommands: 0,
    totalTiles: 0,
    cachedCommands: 0,
    gpuMemoryBytes: 0,
    packedCpuMemoryBytes: 0,
    pendingWorkerTasks: 0,
  };
}

Object.defineProperties(EzTreePrimitive.prototype, {
  instances: {
    get: function () {
      return this._instances;
    },
  },
  boundingSphere: {
    get: function () {
      return this._boundingSphere;
    },
  },
  statistics: {
    get: function () {
      return this._statistics;
    },
  },
});

/**
 * Replaces the primitive's vegetation instances.
 *
 * @param {object[]} [instances] Vegetation instances in local ENU meters.
 */
EzTreePrimitive.prototype.setInstances = function (instances) {
  this._instances = (instances ?? []).slice();
  this._needsRebuild = true;
  destroyResources(this);
};

/**
 * Updates the primitive's draw commands.
 *
 * @param {object} frameState The frame state.
 */
EzTreePrimitive.prototype.update = function (frameState) {
  if (!this.show || this._instances.length === 0 || !frameState.passes.render) {
    return;
  }

  if (this._needsRebuild || !defined(this._resources)) {
    destroyResources(this);
    buildResources(this, frameState.context);
  }

  const resources = this._resources;
  if (!defined(resources)) {
    return;
  }

  const gltfReady = processGltfAssetRecords(this, frameState);
  if (!gltfReady && resources.records.length === 0) {
    if (defined(frameState.afterRender)) {
      frameState.afterRender.push(function () {
        return true;
      });
    }
    return;
  }

  const frameNumber = frameState.frameNumber ?? 0;
  const cacheFrames = Math.max(0, this.gpuResourceCacheFrames);
  const maximumCommandBuildsPerFrame = Math.max(
    1,
    this.maximumCommandBuildsPerFrame,
  );
  const maximumCommandDestroysPerFrame = Math.max(
    0,
    this.maximumCommandDestroysPerFrame,
  );
  const maximumUploadBytesPerFrame = Math.max(
    0,
    this.maximumUploadBytesPerFrame,
  );
  const gpuPreloadRadius = Math.max(0.0, this.gpuPreloadRadius);
  const hasUploadByteBudget =
    Number.isFinite(maximumUploadBytesPerFrame) &&
    maximumUploadBytesPerFrame > 0;
  let commandBuilds = 0;
  let commandDestroys = 0;
  let uploadBytes = 0;
  let needsMoreFrames = false;

  const tryBuildCommand = (record) => {
    if (defined(record.command)) {
      return true;
    }

    if (commandBuilds >= maximumCommandBuildsPerFrame) {
      needsMoreFrames = true;
      return false;
    }

    if (
      hasUploadByteBudget &&
      commandBuilds > 0 &&
      uploadBytes + record.estimatedGpuMemoryBytes > maximumUploadBytesPerFrame
    ) {
      needsMoreFrames = true;
      return false;
    }

    const instanceAttributesPromise = record.instanceAttributesPromise;
    if (
      !processCommandRecordResources(
        record,
        this,
        frameState,
        resources.shaderProgram,
      )
    ) {
      if (
        !defined(instanceAttributesPromise) &&
        defined(record.instanceAttributesPromise)
      ) {
        commandBuilds++;
        uploadBytes += record.estimatedGpuMemoryBytes;
      }
      needsMoreFrames = true;
      return false;
    }

    commandBuilds++;
    uploadBytes += record.gpuMemoryBytes;
    return true;
  };

  const preloadRecords = [];
  const processVisibleRecord = (record) => {
    const boundingSphere = record.boundingSphere ?? this._boundingSphere;
    const cameraDistance = getCameraDistanceToBoundingSphere(
      frameState.camera,
      boundingSphere,
    );
    const instanceCount = getLodInstanceCount(record, cameraDistance);
    const isVisible =
      instanceCount > 0 &&
      isBoundingSphereVisible(frameState, boundingSphere, 0.0);
    const shouldPreload =
      !isVisible &&
      instanceCount > 0 &&
      gpuPreloadRadius > 0.0 &&
      isBoundingSphereVisible(frameState, boundingSphere, gpuPreloadRadius);

    if (!isVisible) {
      if (shouldPreload) {
        preloadRecords.push(record);
        return;
      }

      if (
        commandDestroys < maximumCommandDestroysPerFrame &&
        releaseStaleCommandRecord(record, frameNumber, cacheFrames, resources)
      ) {
        commandDestroys++;
      }
      return;
    }

    if (!tryBuildCommand(record)) {
      return;
    }

    record.lastUsedFrame = frameNumber;
    if (defined(record.tile)) {
      record.tile.lastUsedFrame = frameNumber;
    }
    record.command.instanceCount = instanceCount;
    record.command.boundingVolume = boundingSphere;
    record.command.modelMatrix = this.modelMatrix;
    record.command.debugShowBoundingVolume = this.debugShowBoundingVolume;
    frameState.commandList.push(record.command);
  };

  const processPreloadRecord = (record) => {
    const boundingSphere = record.boundingSphere ?? this._boundingSphere;
    const cameraDistance = getCameraDistanceToBoundingSphere(
      frameState.camera,
      boundingSphere,
    );
    const instanceCount = getLodInstanceCount(record, cameraDistance);
    if (
      instanceCount === 0 ||
      !isBoundingSphereVisible(frameState, boundingSphere, gpuPreloadRadius)
    ) {
      return;
    }

    if (tryBuildCommand(record)) {
      record.lastUsedFrame = frameNumber;
      if (defined(record.tile)) {
        record.tile.lastUsedFrame = frameNumber;
      }
    }
  };

  const preloadTiles = [];
  const tiles = resources.tiles;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const boundingSphere = tile.boundingSphere ?? this._boundingSphere;

    if (
      isBoundingSphereBeyondDistance(
        frameState.camera,
        boundingSphere,
        tile.maximumDistance,
      )
    ) {
      commandDestroys += releaseStaleTileRecords(
        tile,
        resources,
        frameNumber,
        cacheFrames,
        maximumCommandDestroysPerFrame - commandDestroys,
      );
      continue;
    }

    const isVisible = isBoundingSphereVisible(frameState, boundingSphere, 0.0);
    const shouldPreload =
      !isVisible &&
      gpuPreloadRadius > 0.0 &&
      isBoundingSphereVisible(frameState, boundingSphere, gpuPreloadRadius);

    if (!isVisible) {
      if (shouldPreload) {
        preloadTiles.push(tile);
      } else {
        commandDestroys += releaseStaleTileRecords(
          tile,
          resources,
          frameNumber,
          cacheFrames,
          maximumCommandDestroysPerFrame - commandDestroys,
        );
      }
      continue;
    }

    const records = tile.records;
    for (let j = 0; j < records.length; j++) {
      processVisibleRecord(records[j]);
    }
  }

  for (let i = 0; i < preloadRecords.length; i++) {
    if (commandBuilds >= maximumCommandBuildsPerFrame) {
      break;
    }
    processPreloadRecord(preloadRecords[i]);
  }

  for (let i = 0; i < preloadTiles.length; i++) {
    if (commandBuilds >= maximumCommandBuildsPerFrame) {
      break;
    }
    const records = preloadTiles[i].records;
    for (let j = 0; j < records.length; j++) {
      if (commandBuilds >= maximumCommandBuildsPerFrame) {
        break;
      }
      processPreloadRecord(records[j]);
    }
  }

  trimCommandRecordCache(
    resources,
    Math.max(0, this.maximumCachedCommands),
    frameNumber,
    maximumCommandDestroysPerFrame - commandDestroys,
  );

  if (resources.pendingTextureCount > 0 || !resources.gltfRecordsBuilt) {
    needsMoreFrames = true;
  }

  if (needsMoreFrames && defined(frameState.afterRender)) {
    frameState.afterRender.push(function () {
      return true;
    });
  }

  const statisticsUpdateInterval = Math.max(1, this.statisticsUpdateInterval);
  if (
    this._lastStatisticsFrame < 0 ||
    frameNumber - this._lastStatisticsFrame >= statisticsUpdateInterval
  ) {
    updateStatistics(this);
    this._lastStatisticsFrame = frameNumber;
  }
};

/**
 * Returns true if this object was destroyed.
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 */
EzTreePrimitive.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the WebGL resources held by this object.
 *
 * @returns {undefined}
 */
EzTreePrimitive.prototype.destroy = function () {
  destroyResources(this);
  return destroyObject(this);
};

/**
 * Creates random vegetation instances for {@link EzTreePrimitive}.
 *
 * @param {object} [options] Vegetation distribution options.
 * @param {number} [options.seed=0] The random seed.
 * @param {number} [options.width=120.0] The generated area width, in local meters.
 * @param {number} [options.depth=120.0] The generated area depth, in local meters.
 * @param {number} [options.treeDensity] Tree density in instances per hectare.
 * @param {number} [options.grassDensity] Grass density in instances per hectare.
 * @param {number} [options.flowerDensity] Flower density in instances per hectare.
 * @param {number} [options.rockDensity] Rock density in instances per hectare.
 * @param {number} [options.treeCount] The number of tree instances. Overrides tree density.
 * @param {number} [options.grassCount] The number of grass instances. Overrides grass density.
 * @param {number} [options.flowerCount] The number of flower instances. Overrides flower density.
 * @param {number} [options.rockCount] The number of rock instances. Overrides rock density.
 * @param {number} [options.grassPatchScale=100.0] Approximate grass patch size in meters.
 * @param {number} [options.grassPatchiness=0.7] Grass patch fill ratio. 1.0 keeps grass uniform.
 * @param {number} [options.maximumGrassCount=60000] Maximum generated grass instances.
 * @param {number} [options.maximumFlowerCount=8000] Maximum generated flower instances.
 * @param {number} [options.maximumRockCount=5000] Maximum generated rock instances.
 * @returns {object[]} The generated vegetation instances.
 */
EzTreePrimitive.createVegetationInstances = createEzTreeVegetationInstances;

/**
 * Creates random vegetation instances in a TaskProcessor worker when available.
 *
 * @param {object} [options] Vegetation distribution options.
 * @returns {Promise<object[]>} A promise resolving to generated vegetation instances.
 */
EzTreePrimitive.createVegetationInstancesAsync = function (options) {
  if (!getEzTreeUseWorkers() || !FeatureDetection.supportsWebWorkers()) {
    return Promise.resolve(createEzTreeVegetationInstances(options));
  }

  const taskProcessor = getCreateVegetationInstancesTaskProcessor();
  const promise = taskProcessor.scheduleTask(options ?? Frozen.EMPTY_OBJECT);
  if (!defined(promise)) {
    return Promise.resolve(createEzTreeVegetationInstances(options));
  }

  return promise.catch(function () {
    return createEzTreeVegetationInstances(options);
  });
};

/**
 * Built-in tree presets used by {@link EzTreePrimitive}.
 *
 * @type {object}
 */
EzTreePrimitive.TreePreset = TreePreset;

/**
 * Creates an {@link EzTreeOptions} object from a built-in tree preset.
 *
 * @type {Function}
 */
EzTreePrimitive.loadPreset = loadPreset;

export default EzTreePrimitive;
