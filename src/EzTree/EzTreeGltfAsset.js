import AttributeCompression from "@cesium/engine/Source/Core/AttributeCompression.js";
import BoundingSphere from "@cesium/engine/Source/Core/BoundingSphere.js";
import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import ComponentDatatype from "@cesium/engine/Source/Core/ComponentDatatype.js";
import loadImageFromTypedArray from "@cesium/engine/Source/Core/loadImageFromTypedArray.js";
import PrimitiveType from "@cesium/engine/Source/Core/PrimitiveType.js";
import Resource from "@cesium/engine/Source/Core/Resource.js";
import defined from "@cesium/engine/Source/Core/defined.js";
import PixelFormat from "@cesium/engine/Source/Core/PixelFormat.js";
import PixelDatatype from "@cesium/engine/Source/Renderer/PixelDatatype.js";
import Sampler from "@cesium/engine/Source/Renderer/Sampler.js";
import Texture from "@cesium/engine/Source/Renderer/Texture.js";
import TextureMagnificationFilter from "@cesium/engine/Source/Renderer/TextureMagnificationFilter.js";
import TextureMinificationFilter from "@cesium/engine/Source/Renderer/TextureMinificationFilter.js";
import TextureWrap from "@cesium/engine/Source/Renderer/TextureWrap.js";
import DracoLoader from "@cesium/engine/Source/Scene/DracoLoader.js";
import parseGlb from "@cesium/engine/Source/Scene/GltfPipeline/parseGlb.js";
import { getEzTreeAssetUrl } from "../configuration.js";

const GLTF_COMPONENT_BYTE_SIZE = Object.freeze({
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
});

const GLTF_COMPONENT_ARRAY_TYPE = Object.freeze({
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
});

const GLTF_ATTRIBUTE_COMPONENTS = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
});

const mipmapSampler = Object.freeze(
  new Sampler({
    wrapS: TextureWrap.CLAMP_TO_EDGE,
    wrapT: TextureWrap.CLAMP_TO_EDGE,
    minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    magnificationFilter: TextureMagnificationFilter.LINEAR,
  }),
);

const linearSampler = Object.freeze(
  new Sampler({
    wrapS: TextureWrap.CLAMP_TO_EDGE,
    wrapT: TextureWrap.CLAMP_TO_EDGE,
    minificationFilter: TextureMinificationFilter.LINEAR,
    magnificationFilter: TextureMagnificationFilter.LINEAR,
  }),
);

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function createTexture(context, image) {
  const canMipmap = isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
  const texture = new Texture({
    context: context,
    source: image,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    sampler: canMipmap ? mipmapSampler : linearSampler,
    flipY: false,
  });

  if (canMipmap) {
    texture.generateMipmap();
  }

  return texture;
}

function getComponentCount(type) {
  return GLTF_ATTRIBUTE_COMPONENTS[type] ?? 1;
}

function getAccessorByteOffset(gltf, accessor) {
  const bufferView = gltf.bufferViews[accessor.bufferView];
  return (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
}

function readComponent(dataView, byteOffset, componentType) {
  switch (componentType) {
    case ComponentDatatype.BYTE:
      return dataView.getInt8(byteOffset);
    case ComponentDatatype.UNSIGNED_BYTE:
      return dataView.getUint8(byteOffset);
    case ComponentDatatype.SHORT:
      return dataView.getInt16(byteOffset, true);
    case ComponentDatatype.UNSIGNED_SHORT:
      return dataView.getUint16(byteOffset, true);
    case ComponentDatatype.UNSIGNED_INT:
      return dataView.getUint32(byteOffset, true);
    case ComponentDatatype.FLOAT:
      return dataView.getFloat32(byteOffset, true);
  }

  return 0;
}

function readAccessor(gltf, source, accessorId) {
  const accessor = gltf.accessors[accessorId];
  if (!defined(accessor) || !defined(accessor.bufferView)) {
    return undefined;
  }

  const bufferView = gltf.bufferViews[accessor.bufferView];
  const componentCount = getComponentCount(accessor.type);
  const componentType = accessor.componentType;
  const ComponentArrayType = GLTF_COMPONENT_ARRAY_TYPE[componentType];
  const componentByteSize = GLTF_COMPONENT_BYTE_SIZE[componentType];
  const byteOffset = getAccessorByteOffset(gltf, accessor);
  const byteStride = bufferView.byteStride;
  const count = accessor.count * componentCount;
  const packedByteStride = componentByteSize * componentCount;

  if (
    defined(ComponentArrayType) &&
    (!defined(byteStride) || byteStride === packedByteStride)
  ) {
    return new ComponentArrayType(
      source.buffer,
      source.byteOffset + byteOffset,
      count,
    );
  }

  const values = new ComponentArrayType(count);
  const dataView = new DataView(source.buffer, source.byteOffset);
  const stride = byteStride ?? packedByteStride;
  let outputIndex = 0;

  for (let i = 0; i < accessor.count; i++) {
    const vertexByteOffset = byteOffset + i * stride;
    for (let j = 0; j < componentCount; j++) {
      values[outputIndex++] = readComponent(
        dataView,
        vertexByteOffset + j * componentByteSize,
        componentType,
      );
    }
  }

  return values;
}

function normalizeInteger(value, componentType) {
  switch (componentType) {
    case ComponentDatatype.BYTE:
      return Math.max(value / 127.0, -1.0);
    case ComponentDatatype.UNSIGNED_BYTE:
      return value / 255.0;
    case ComponentDatatype.SHORT:
      return Math.max(value / 32767.0, -1.0);
    case ComponentDatatype.UNSIGNED_SHORT:
      return value / 65535.0;
  }

  return value;
}

function getQuantizationRange(quantization) {
  return Math.pow(2.0, quantization.quantizationBits) - 1.0;
}

const decodedOctScratch = new Cartesian3();

function decodedOctAttributeToFloat32(
  decodedAttribute,
  count,
  expectedComponentCount,
) {
  const values = decodedAttribute.array;
  const componentCount = decodedAttribute.data.componentsPerAttribute;
  const quantization = decodedAttribute.data.quantization;
  const range = getQuantizationRange(quantization);
  const output = new Float32Array(count * expectedComponentCount);

  for (let i = 0; i < count; i++) {
    const sourceIndex = i * componentCount;
    AttributeCompression.octDecodeInRange(
      values[sourceIndex],
      values[sourceIndex + 1],
      range,
      decodedOctScratch,
    );

    const outputIndex = i * expectedComponentCount;
    output[outputIndex] = decodedOctScratch.z;
    if (expectedComponentCount > 1) {
      output[outputIndex + 1] = decodedOctScratch.x;
    }
    if (expectedComponentCount > 2) {
      output[outputIndex + 2] = decodedOctScratch.y;
    }
  }

  return output;
}

function decodedQuantizedAttributeToFloat32(
  decodedAttribute,
  count,
  expectedComponentCount,
) {
  const quantization = decodedAttribute.data.quantization;
  if (quantization.octEncoded) {
    return decodedOctAttributeToFloat32(
      decodedAttribute,
      count,
      expectedComponentCount,
    );
  }

  const values = decodedAttribute.array;
  const componentCount = decodedAttribute.data.componentsPerAttribute;
  const minValues = quantization.minValues ?? [];
  const range = quantization.range ?? 1.0;
  const normalizationRange = getQuantizationRange(quantization);
  const output = new Float32Array(count * expectedComponentCount);

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < expectedComponentCount; j++) {
      const sourceComponent = Math.min(j, componentCount - 1);
      const sourceIndex = i * componentCount + sourceComponent;
      const minValue =
        minValues[Math.min(sourceComponent, minValues.length - 1)] ?? 0.0;
      output[i * expectedComponentCount + j] =
        minValue + (values[sourceIndex] / normalizationRange) * range;
    }
  }

  return output;
}

function decodedAttributeToFloat32(
  decodedAttribute,
  accessor,
  expectedComponentCount,
) {
  const values = decodedAttribute.array;
  const componentCount = decodedAttribute.data.componentsPerAttribute;
  const count = accessor?.count ?? values.length / componentCount;

  if (defined(decodedAttribute.data.quantization)) {
    return decodedQuantizedAttributeToFloat32(
      decodedAttribute,
      count,
      expectedComponentCount,
    );
  }

  const output = new Float32Array(count * expectedComponentCount);
  const normalized =
    decodedAttribute.data.normalized === true || accessor?.normalized === true;
  const componentType = decodedAttribute.data.componentDatatype;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < expectedComponentCount; j++) {
      const sourceIndex = i * componentCount + Math.min(j, componentCount - 1);
      const value = values[sourceIndex] ?? 0.0;
      output[i * expectedComponentCount + j] = normalized
        ? normalizeInteger(value, componentType)
        : value;
    }
  }

  return output;
}

function accessorToFloat32(gltf, source, accessorId, expectedComponentCount) {
  const accessor = gltf.accessors[accessorId];
  const values = readAccessor(gltf, source, accessorId);
  const componentCount = getComponentCount(accessor.type);
  const outputComponentCount = expectedComponentCount ?? componentCount;
  const output = new Float32Array(accessor.count * outputComponentCount);

  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < outputComponentCount; j++) {
      const sourceIndex = i * componentCount + Math.min(j, componentCount - 1);
      const value = values[sourceIndex] ?? 0.0;
      output[i * outputComponentCount + j] = accessor.normalized
        ? normalizeInteger(value, accessor.componentType)
        : value;
    }
  }

  return output;
}

function accessorToIndices(gltf, source, accessorId, vertexCount) {
  if (!defined(accessorId)) {
    const ArrayType = getIndexArrayType(vertexCount, vertexCount);
    const indices = new ArrayType(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }
    return indices;
  }

  const sourceIndices = readAccessor(gltf, source, accessorId);
  return getIndexArrayType(vertexCount, sourceIndices.length).from(
    sourceIndices,
  );
}

function getIndexArrayType(vertexCount, indexCount) {
  return vertexCount > 65535 || indexCount > 65535 ? Uint32Array : Uint16Array;
}

function createFallbackNormals(vertexCount) {
  const normals = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    normals[i * 3 + 1] = 1.0;
  }
  return normals;
}

function createFallbackTextureCoordinates(vertexCount) {
  return new Float32Array(vertexCount * 2);
}

function createWindWeights(positions, enabled) {
  const vertexCount = positions.length / 3;
  const windWeights = new Float32Array(vertexCount);
  if (!enabled) {
    return windWeights;
  }

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < positions.length; i += 3) {
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
  }

  const height = maxY - minY;
  if (height <= 0.0) {
    return windWeights;
  }

  for (let i = 0; i < vertexCount; i++) {
    windWeights[i] = Math.min(
      1.0,
      Math.max(0.0, (positions[i * 3 + 1] - minY) / height),
    );
  }

  return windWeights;
}

function createGeometry(record, primitiveRecord) {
  const gltf = record.gltf;
  const primitive = primitiveRecord.primitive;
  const positions = accessorToFloat32(
    gltf,
    record.source,
    primitive.attributes.POSITION,
    3,
  );
  let normals = defined(primitive.attributes.NORMAL)
    ? accessorToFloat32(gltf, record.source, primitive.attributes.NORMAL, 3)
    : undefined;
  let st = defined(primitive.attributes.TEXCOORD_0)
    ? accessorToFloat32(gltf, record.source, primitive.attributes.TEXCOORD_0, 2)
    : undefined;
  const indices = accessorToIndices(
    gltf,
    record.source,
    primitive.indices,
    positions.length / 3,
  );

  const vertexCount = positions.length / 3;
  normals = normals ?? createFallbackNormals(vertexCount);
  st = st ?? createFallbackTextureCoordinates(vertexCount);

  return {
    positions: positions,
    normals: normals,
    st: st,
    windWeights: createWindWeights(positions, record.wind),
    indices: indices,
    boundingSphere: BoundingSphere.fromVertices(positions),
  };
}

function dracoAttributeToFloat32(
  gltf,
  primitiveRecord,
  semantic,
  expectedComponentCount,
) {
  const primitive = primitiveRecord.primitive;
  const accessorId = primitive.attributes[semantic];
  if (!defined(accessorId)) {
    return undefined;
  }

  const decodedAttribute = primitiveRecord.dracoData.attributeData[semantic];
  if (!defined(decodedAttribute)) {
    return undefined;
  }

  return decodedAttributeToFloat32(
    decodedAttribute,
    gltf.accessors[accessorId],
    expectedComponentCount,
  );
}

function createDracoGeometry(record, primitiveRecord) {
  const gltf = record.gltf;
  const primitive = primitiveRecord.primitive;
  const positions = dracoAttributeToFloat32(
    gltf,
    primitiveRecord,
    "POSITION",
    3,
  );

  if (!defined(positions)) {
    throw new Error(
      "Draco-compressed EzTree glb primitives must include POSITION.",
    );
  }

  let normals = dracoAttributeToFloat32(gltf, primitiveRecord, "NORMAL", 3);
  let st = dracoAttributeToFloat32(gltf, primitiveRecord, "TEXCOORD_0", 2);
  const vertexCount = positions.length / 3;
  const decodedIndices = primitiveRecord.dracoData.indexArray?.typedArray;
  const indices = defined(decodedIndices)
    ? getIndexArrayType(vertexCount, decodedIndices.length).from(decodedIndices)
    : accessorToIndices(gltf, record.source, primitive.indices, vertexCount);

  normals = normals ?? createFallbackNormals(vertexCount);
  st = st ?? createFallbackTextureCoordinates(vertexCount);

  return {
    positions: positions,
    normals: normals,
    st: st,
    windWeights: createWindWeights(positions, record.wind),
    indices: indices,
    boundingSphere: BoundingSphere.fromVertices(positions),
  };
}

function getImageIdFromTexture(gltf, textureId) {
  const texture = gltf.textures?.[textureId];
  if (!defined(texture)) {
    return undefined;
  }

  return texture.source ?? texture.extensions?.EXT_texture_webp?.source;
}

function createMaterial(record, materialId) {
  const gltf = record.gltf;
  const material = gltf.materials?.[materialId];
  const metallicRoughness = material?.pbrMetallicRoughness;
  const baseColorTextureInfo = metallicRoughness?.baseColorTexture;
  const baseColorFactor = metallicRoughness?.baseColorFactor ?? [
    1.0, 1.0, 1.0, 1.0,
  ];
  const textureId = baseColorTextureInfo?.index;
  const imageId = defined(textureId)
    ? getImageIdFromTexture(gltf, textureId)
    : undefined;

  return {
    baseColorFactor: baseColorFactor,
    imageRecord: defined(imageId) ? record.imageRecords[imageId] : undefined,
    alphaMode: material?.alphaMode ?? "OPAQUE",
    alphaCutoff: material?.alphaCutoff ?? 0.5,
  };
}

function getBufferViewBytes(gltf, source, bufferViewId) {
  const bufferView = gltf.bufferViews[bufferViewId];
  const byteOffset = bufferView.byteOffset ?? 0;
  return source.subarray(byteOffset, byteOffset + bufferView.byteLength);
}

function createImageRecords(gltf, source) {
  const images = gltf.images ?? [];
  return images.map(function (image) {
    return {
      bytes: getBufferViewBytes(gltf, source, image.bufferView),
      mimeType: image.mimeType,
      image: undefined,
      texture: undefined,
      promise: undefined,
      error: undefined,
    };
  });
}

function collectScenePrimitives(gltf, nodeId, result) {
  const node = gltf.nodes[nodeId];
  if (defined(node.mesh)) {
    const mesh = gltf.meshes[node.mesh];
    for (let i = 0; i < mesh.primitives.length; i++) {
      const primitive = mesh.primitives[i];
      if (
        (primitive.mode ?? PrimitiveType.TRIANGLES) === PrimitiveType.TRIANGLES
      ) {
        result.push(primitive);
      }
    }
  }

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    collectScenePrimitives(gltf, children[i], result);
  }
}

function createPrimitiveRecords(record) {
  const gltf = record.gltf;
  const scene = gltf.scenes[gltf.scene ?? 0];
  const scenePrimitives = [];
  for (let i = 0; i < scene.nodes.length; i++) {
    collectScenePrimitives(gltf, scene.nodes[i], scenePrimitives);
  }

  return scenePrimitives.map(function (primitive) {
    return {
      primitive: primitive,
      material: createMaterial(record, primitive.material),
      geometry: undefined,
      dracoData: undefined,
      dracoPromise: undefined,
      dracoError: undefined,
    };
  });
}

function parseRecord(record, arrayBuffer) {
  const gltf = parseGlb(new Uint8Array(arrayBuffer));
  const source = gltf.buffers[0].extras._pipeline.source;
  record.gltf = gltf;
  record.source = source;
  record.imageRecords = createImageRecords(gltf, source);
  record.primitiveRecords = createPrimitiveRecords(record);
}

function processImageRecord(record, context) {
  if (defined(record.texture)) {
    return true;
  }

  if (defined(record.error)) {
    return true;
  }

  if (defined(record.image)) {
    record.texture = createTexture(context, record.image);
    record.image = undefined;
    return true;
  }

  if (!defined(record.promise)) {
    record.promise = loadImageFromTypedArray({
      uint8Array: record.bytes,
      format: record.mimeType,
      flipY: false,
      skipColorSpaceConversion: false,
    })
      .then(function (image) {
        record.image = image;
      })
      .catch(function (error) {
        record.error = error;
      });
  }

  return false;
}

function processDracoPrimitiveRecord(record, primitiveRecord, draco) {
  if (defined(primitiveRecord.dracoError)) {
    record.error = primitiveRecord.dracoError;
    return false;
  }

  if (defined(primitiveRecord.dracoData)) {
    try {
      primitiveRecord.geometry = createDracoGeometry(record, primitiveRecord);
    } catch (error) {
      record.error = error;
      return false;
    }
    primitiveRecord.dracoData = undefined;
    return true;
  }

  if (defined(primitiveRecord.dracoPromise)) {
    return false;
  }

  const gltf = record.gltf;
  const bufferView = gltf.bufferViews[draco.bufferView];
  const compressedBytes = getBufferViewBytes(
    gltf,
    record.source,
    draco.bufferView,
  );
  let decodePromise;

  try {
    decodePromise = DracoLoader.decodeBufferView({
      array: new Uint8Array(compressedBytes),
      bufferView: bufferView,
      compressedAttributes: draco.attributes,
      dequantizeInShader: false,
      attributesToSkipTransform: [],
    });
  } catch (error) {
    record.error = error;
    return false;
  }

  if (!defined(decodePromise)) {
    return false;
  }

  primitiveRecord.dracoPromise = decodePromise
    .then(function (dracoData) {
      primitiveRecord.dracoPromise = undefined;
      if (record.destroyed) {
        return;
      }
      primitiveRecord.dracoData = dracoData;
    })
    .catch(function (error) {
      primitiveRecord.dracoPromise = undefined;
      if (record.destroyed) {
        return;
      }
      primitiveRecord.dracoError = error;
    });

  return false;
}

function processPrimitiveRecord(record, primitiveRecord) {
  if (defined(primitiveRecord.geometry)) {
    return true;
  }

  const primitive = primitiveRecord.primitive;
  const draco = primitive.extensions?.KHR_draco_mesh_compression;
  if (!defined(draco)) {
    primitiveRecord.geometry = createGeometry(record, primitiveRecord);
    return true;
  }

  return processDracoPrimitiveRecord(record, primitiveRecord, draco);
}

function finalizePrimitives(record) {
  record.primitives = record.primitiveRecords.map(function (primitiveRecord) {
    const material = primitiveRecord.material;
    return {
      geometry: primitiveRecord.geometry,
      baseColorFactor: material.baseColorFactor,
      colorTexture: material.imageRecord?.texture,
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff,
    };
  });
}

function createEzTreeGltfAssetRecord(options) {
  const path = options.path;
  const record = {
    path: path,
    wind: options.wind ?? false,
    promise: undefined,
    error: undefined,
    destroyed: false,
    gltf: undefined,
    source: undefined,
    imageRecords: [],
    primitiveRecords: [],
    primitives: undefined,
  };

  const resource = Resource.createIfNeeded(getEzTreeAssetUrl(path));
  record.promise = resource
    .fetchArrayBuffer()
    .then(function (arrayBuffer) {
      if (record.destroyed) {
        return;
      }
      parseRecord(record, arrayBuffer);
    })
    .catch(function (error) {
      record.error = error;
    });

  return record;
}

function processEzTreeGltfAssetRecord(record, context) {
  if (defined(record.primitives)) {
    return true;
  }

  if (defined(record.error)) {
    return false;
  }

  if (!defined(record.gltf)) {
    return false;
  }

  let ready = true;
  for (let i = 0; i < record.primitiveRecords.length; i++) {
    const imageRecord = record.primitiveRecords[i].material.imageRecord;
    if (defined(imageRecord)) {
      ready = processImageRecord(imageRecord, context) && ready;
    }
    ready = processPrimitiveRecord(record, record.primitiveRecords[i]) && ready;
  }

  if (!ready) {
    return false;
  }

  finalizePrimitives(record);
  return true;
}

function destroyEzTreeGltfAssetRecord(record) {
  if (!defined(record)) {
    return;
  }

  record.destroyed = true;
  for (let i = 0; i < record.imageRecords.length; i++) {
    const imageRecord = record.imageRecords[i];
    imageRecord.texture = imageRecord.texture && imageRecord.texture.destroy();
  }
}

const EzTreeGltfAsset = Object.freeze({
  createEzTreeGltfAssetRecord: createEzTreeGltfAssetRecord,
  destroyEzTreeGltfAssetRecord: destroyEzTreeGltfAssetRecord,
  processEzTreeGltfAssetRecord: processEzTreeGltfAssetRecord,
});

export {
  createEzTreeGltfAssetRecord,
  destroyEzTreeGltfAssetRecord,
  processEzTreeGltfAssetRecord,
};
export default EzTreeGltfAsset;
