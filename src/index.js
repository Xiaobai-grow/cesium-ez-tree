import BarkType from "./EzTree/EzTreeBarkType.js";
import Billboard from "./EzTree/EzTreeBillboard.js";
import EzTreeEnums, {
  BarkType as EzTreeBarkType,
  Billboard as EzTreeBillboard,
  LeafType as EzTreeLeafType,
  TreeType as EzTreeType,
} from "./EzTree/EzTreeEnums.js";
import EzTreeGenerator, {
  createFlowerGeometry,
  createGrassGeometry,
  generateTreeGeometry,
} from "./EzTree/EzTreeGenerator.js";
import EzTreeOptions, {
  cloneOptions,
  mergeOptions,
} from "./EzTree/EzTreeOptions.js";
import EzTreePreset from "./EzTree/EzTreePreset.js";
import EzTreePrimitive from "./EzTree/EzTreePrimitive.js";
import EzTreeRNG from "./EzTree/EzTreeRNG.js";
import EzTreeLeafTypeDefault from "./EzTree/EzTreeLeafType.js";
import EzTreeTreeTypeDefault from "./EzTree/EzTreeType.js";
import createEzTreeVegetationInstances from "./EzTree/EzTreeVegetationInstances.js";
import loadEzTreePreset from "./EzTree/loadEzTreePreset.js";
import { TreePreset, loadPreset } from "./EzTree/EzTreePresets.js";
import {
  configureEzTree,
  getEzTreeConfiguration,
} from "./configuration.js";

function installEzTree(Cesium) {
  if (Cesium === undefined || Cesium === null) {
    throw new Error("installEzTree requires a Cesium namespace object.");
  }

  Cesium.EzTreePrimitive = EzTreePrimitive;
  Cesium.EzTreeOptions = EzTreeOptions;
  Cesium.EzTreeGenerator = EzTreeGenerator;
  Cesium.EzTreePreset = EzTreePreset;
  Cesium.loadEzTreePreset = loadEzTreePreset;
  Cesium.EzTreeEnums = EzTreeEnums;

  return Cesium;
}

const api = Object.freeze({
  BarkType,
  Billboard,
  EzTreeBarkType,
  EzTreeBillboard,
  EzTreeEnums,
  EzTreeGenerator,
  EzTreeLeafType: EzTreeLeafTypeDefault,
  EzTreeOptions,
  EzTreePreset,
  EzTreePrimitive,
  EzTreeRNG,
  EzTreeTreeType: EzTreeTreeTypeDefault,
  LeafType: EzTreeLeafType,
  TreePreset,
  TreeType: EzTreeType,
  cloneOptions,
  configureEzTree,
  createEzTreeVegetationInstances,
  createFlowerGeometry,
  createGrassGeometry,
  generateTreeGeometry,
  getEzTreeConfiguration,
  installEzTree,
  loadEzTreePreset,
  loadPreset,
  mergeOptions,
});

export {
  BarkType,
  Billboard,
  EzTreeBarkType,
  EzTreeBillboard,
  EzTreeEnums,
  EzTreeGenerator,
  EzTreeLeafTypeDefault as EzTreeLeafType,
  EzTreeOptions,
  EzTreePreset,
  EzTreePrimitive,
  EzTreeRNG,
  EzTreeTreeTypeDefault as EzTreeTreeType,
  EzTreeLeafType as LeafType,
  TreePreset,
  EzTreeType as TreeType,
  cloneOptions,
  configureEzTree,
  createEzTreeVegetationInstances,
  createFlowerGeometry,
  createGrassGeometry,
  generateTreeGeometry,
  getEzTreeConfiguration,
  installEzTree,
  loadEzTreePreset,
  loadPreset,
  mergeOptions,
};

export default api;
