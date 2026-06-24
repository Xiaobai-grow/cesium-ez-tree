import Cartesian3 from "@cesium/engine/Source/Core/Cartesian3.js";
import Color from "@cesium/engine/Source/Core/Color.js";
import Frozen from "@cesium/engine/Source/Core/Frozen.js";
import CesiumMath from "@cesium/engine/Source/Core/Math.js";
import defined from "@cesium/engine/Source/Core/defined.js";

const MAXIMUM_QUANTIZED_USHORT = 65535.0;
const MAXIMUM_QUANTIZED_UBYTE = 255.0;

export const INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES = 20;
export const INSTANCE_TRANSLATION_OFFSET_IN_BYTES = 0;
export const INSTANCE_SCALE_OFFSET_IN_BYTES = 6;
export const INSTANCE_ROTATION_WIND_OFFSET_IN_BYTES = 12;
export const INSTANCE_COLOR_OFFSET_IN_BYTES = 16;

function normalizeScale(scale, result) {
  if (typeof scale === "number") {
    return Cartesian3.fromElements(scale, scale, scale, result);
  }
  if (defined(scale)) {
    return Cartesian3.clone(scale, result);
  }
  return Cartesian3.clone(Cartesian3.ONE, result);
}

function getInstanceTranslation(instance, result) {
  return Cartesian3.clone(
    instance.translation ?? instance.position ?? Cartesian3.ZERO,
    result,
  );
}

function quantizeUnsignedShort(value, minimum, scale) {
  if (scale === 0.0) {
    return 0;
  }

  return Math.round(
    CesiumMath.clamp((value - minimum) / scale, 0.0, 1.0) *
      MAXIMUM_QUANTIZED_USHORT,
  );
}

function quantizeUnsignedByte(value) {
  return Math.round(
    CesiumMath.clamp(value, 0.0, 1.0) * MAXIMUM_QUANTIZED_UBYTE,
  );
}

function getWindPhase(value) {
  const phase = value - Math.floor(value);
  return phase < 0.0 ? phase + 1.0 : phase;
}

function cloneColorComponents(color, fallback, result) {
  const source = defined(color) ? color : fallback;
  result.red = source.red;
  result.green = source.green;
  result.blue = source.blue;
  result.alpha = source.alpha ?? 1.0;
  return result;
}

function getInstanceColor(instance, colorMode, result) {
  colorMode = colorMode ?? Frozen.EMPTY_OBJECT;
  const fallback = colorMode.fallbackColor ?? Color.WHITE;
  const property = colorMode.property;
  const color = defined(property) ? instance[property] : instance.color;
  cloneColorComponents(color, fallback, result);

  const variationProperty = colorMode.variationProperty;
  if (defined(variationProperty)) {
    const scalar =
      instance[variationProperty] ?? colorMode.variationDefault ?? 1.0;
    result.red *= scalar;
    result.green *= scalar;
    result.blue *= scalar;
  }

  return result;
}

function cloneCartesian3FromComponents(source, result) {
  return Cartesian3.fromElements(source.x, source.y, source.z, result);
}

function createEmptyAttributes() {
  return {
    values: new Uint8Array(0),
    translationMinimum: Cartesian3.clone(Cartesian3.ZERO),
    translationDecodeScale: Cartesian3.clone(Cartesian3.ZERO),
    scaleMinimum: Cartesian3.clone(Cartesian3.ZERO),
    scaleDecodeScale: Cartesian3.clone(Cartesian3.ZERO),
    byteLength: 0,
  };
}

/**
 * Creates packed, quantized instance attributes for EzTree vegetation.
 *
 * @param {object[]} instances Vegetation instances.
 * @param {object} colorMode Color extraction options.
 * @returns {object} Packed attributes and decode uniforms.
 *
 * @private
 */
export default function createEzTreeInstanceAttributes(instances, colorMode) {
  const length = instances.length;
  if (length === 0) {
    return createEmptyAttributes();
  }

  const values = new Uint8Array(length * INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES);
  const words = new Uint16Array(values.buffer);
  const translationMinimum = new Cartesian3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const translationMaximum = new Cartesian3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  const scaleMinimum = new Cartesian3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const scaleMaximum = new Cartesian3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  const translationScratch = new Cartesian3();
  const scaleScratch = new Cartesian3();
  const colorScratch = new Color();

  for (let i = 0; i < length; i++) {
    const instance = instances[i];
    const translation = getInstanceTranslation(instance, translationScratch);
    const scale = normalizeScale(instance.scale, scaleScratch);

    translationMinimum.x = Math.min(translationMinimum.x, translation.x);
    translationMinimum.y = Math.min(translationMinimum.y, translation.y);
    translationMinimum.z = Math.min(translationMinimum.z, translation.z);
    translationMaximum.x = Math.max(translationMaximum.x, translation.x);
    translationMaximum.y = Math.max(translationMaximum.y, translation.y);
    translationMaximum.z = Math.max(translationMaximum.z, translation.z);
    scaleMinimum.x = Math.min(scaleMinimum.x, scale.x);
    scaleMinimum.y = Math.min(scaleMinimum.y, scale.y);
    scaleMinimum.z = Math.min(scaleMinimum.z, scale.z);
    scaleMaximum.x = Math.max(scaleMaximum.x, scale.x);
    scaleMaximum.y = Math.max(scaleMaximum.y, scale.y);
    scaleMaximum.z = Math.max(scaleMaximum.z, scale.z);
  }

  const translationDecodeScale = Cartesian3.subtract(
    translationMaximum,
    translationMinimum,
    new Cartesian3(),
  );
  const scaleDecodeScale = Cartesian3.subtract(
    scaleMaximum,
    scaleMinimum,
    new Cartesian3(),
  );

  for (let i = 0; i < length; i++) {
    const instance = instances[i];
    const translation = getInstanceTranslation(instance, translationScratch);
    const scale = normalizeScale(instance.scale, scaleScratch);
    const rotation = instance.rotation ?? instance.heading ?? 0.0;
    const color = getInstanceColor(instance, colorMode, colorScratch);
    const wordOffset = (i * INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES) / 2;
    const byteOffset = i * INSTANCE_ATTRIBUTE_STRIDE_IN_BYTES;
    const angle = CesiumMath.zeroToTwoPi(rotation) * CesiumMath.ONE_OVER_TWO_PI;
    const windPhase = getWindPhase(instance.windPhase ?? i * 0.173);

    words[wordOffset] = quantizeUnsignedShort(
      translation.x,
      translationMinimum.x,
      translationDecodeScale.x,
    );
    words[wordOffset + 1] = quantizeUnsignedShort(
      translation.y,
      translationMinimum.y,
      translationDecodeScale.y,
    );
    words[wordOffset + 2] = quantizeUnsignedShort(
      translation.z,
      translationMinimum.z,
      translationDecodeScale.z,
    );
    words[wordOffset + 3] = quantizeUnsignedShort(
      scale.x,
      scaleMinimum.x,
      scaleDecodeScale.x,
    );
    words[wordOffset + 4] = quantizeUnsignedShort(
      scale.y,
      scaleMinimum.y,
      scaleDecodeScale.y,
    );
    words[wordOffset + 5] = quantizeUnsignedShort(
      scale.z,
      scaleMinimum.z,
      scaleDecodeScale.z,
    );
    words[wordOffset + 6] = Math.round(angle * MAXIMUM_QUANTIZED_USHORT);
    words[wordOffset + 7] = Math.round(windPhase * MAXIMUM_QUANTIZED_USHORT);
    values[byteOffset + INSTANCE_COLOR_OFFSET_IN_BYTES] = quantizeUnsignedByte(
      color.red,
    );
    values[byteOffset + INSTANCE_COLOR_OFFSET_IN_BYTES + 1] =
      quantizeUnsignedByte(color.green);
    values[byteOffset + INSTANCE_COLOR_OFFSET_IN_BYTES + 2] =
      quantizeUnsignedByte(color.blue);
    values[byteOffset + INSTANCE_COLOR_OFFSET_IN_BYTES + 3] =
      quantizeUnsignedByte(color.alpha);
  }

  return {
    values: values,
    translationMinimum: translationMinimum,
    translationDecodeScale: translationDecodeScale,
    scaleMinimum: scaleMinimum,
    scaleDecodeScale: scaleDecodeScale,
    byteLength: values.byteLength,
  };
}

export function cloneEzTreeInstanceAttributes(attributes, result) {
  result = result ?? {};
  result.values = attributes.values;
  result.translationMinimum = cloneCartesian3FromComponents(
    attributes.translationMinimum,
    result.translationMinimum ?? new Cartesian3(),
  );
  result.translationDecodeScale = cloneCartesian3FromComponents(
    attributes.translationDecodeScale,
    result.translationDecodeScale ?? new Cartesian3(),
  );
  result.scaleMinimum = cloneCartesian3FromComponents(
    attributes.scaleMinimum,
    result.scaleMinimum ?? new Cartesian3(),
  );
  result.scaleDecodeScale = cloneCartesian3FromComponents(
    attributes.scaleDecodeScale,
    result.scaleDecodeScale ?? new Cartesian3(),
  );
  result.byteLength = attributes.byteLength ?? attributes.values.byteLength;
  return result;
}
