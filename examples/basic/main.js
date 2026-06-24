import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  EzTreePrimitive,
  configureEzTree,
} from "../../src/index.js";
import "./style.css";

Cesium.buildModuleUrl.setBaseUrl("/cesium/");

configureEzTree({
  assetBaseUrl: new URL("../../assets/", import.meta.url).href,
  useWorkers: false,
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: "//data.mars3d.cn/tile/img/{z}/{x}/{y}.jpg",
    }),
  ),
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  animation: false,
  timeline: false,
  shouldAnimate: true,
});

viewer.scene.debugShowFramesPerSecond = true;

const center = Cesium.Cartesian3.fromDegrees(-122.38985, 37.61864, 0.5);
const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);

const instances = await EzTreePrimitive.createVegetationInstancesAsync({
  width: 420.0,
  depth: 320.0,
  seed: 12,
  treeDensity: 18,
  grassDensity: 650,
  flowerDensity: 45,
  rockDensity: 8,
  treeScale: 0.58,
  grassScale: 1.0,
  grassPatchScale: 100.0,
  grassPatchiness: 0.7,
  maximumGrassCount: 60000,
  maximumFlowerCount: 8000,
  maximumRockCount: 5000,
});

const primitive = viewer.scene.primitives.add(
  new EzTreePrimitive({
    modelMatrix,
    instances,
    windStrength: 0.1,
    windFrequency: 0.8,
    windScale: 85.0,
    roundedLeafNormals: true,
    lodCellSize: 480.0,
    cullingTileSize: 1440.0,
    maximumTreeBranchDistance: 3200.0,
    maximumTreeLeafDistance: 2600.0,
    maximumGrassDistance: 800.0,
    maximumFlowerDistance: 600.0,
    maximumRockDistance: 1800.0,
    maximumCachedCommands: 256,
    gpuResourceCacheFrames: 45,
    maximumCommandBuildsPerFrame: 8,
    maximumCommandDestroysPerFrame: 16,
    maximumUploadBytesPerFrame: 512 * 1024,
    gpuPreloadRadius: 240.0,
    statisticsUpdateInterval: 30,
    workerPacking: false,
  }),
);

const counts = instances.reduce(
  (result, instance) => {
    result[instance.kind] += 1;
    return result;
  },
  { tree: 0, grass: 0, flower: 0, rock: 0 },
);

document.getElementById("status").textContent =
  `${counts.tree} trees, ${counts.grass} grass, ${counts.flower} flowers, ${counts.rock} rocks`;

viewer.camera.lookAt(
  center,
  new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(45.0),
    Cesium.Math.toRadians(-35.0),
    900.0,
  ),
);
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

window.ezTreePrimitive = primitive;
