import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import GUI from "lil-gui";
import {
  EzTreeGeoJSON,
  EzTreePrimitive,
  configureEzTree,
} from "../../src/index.js";
import DrawManager from "./DrawManager.js";
import sampleGeoJSON from "./data/sample_geojson.json";
import "./style.css";

const siteBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
const cesiumBaseUrl = import.meta.env.DEV
  ? "/cesium/"
  : new URL("cesium/", siteBaseUrl).href;
const ezTreeAssetBaseUrl = import.meta.env.DEV
  ? new URL(/* @vite-ignore */ "../../assets/", import.meta.url).href
  : new URL("ez-tree-assets/", siteBaseUrl).href;

Cesium.buildModuleUrl.setBaseUrl(cesiumBaseUrl);

configureEzTree({
  assetBaseUrl: ezTreeAssetBaseUrl,
  useWorkers: false,
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      // url: "//data.mars3d.cn/tile/img/{z}/{x}/{y}.jpg",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 18,
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
viewer.scene.globe.depthTestAgainstTerrain = true;

const terrainParams = {
  enabled: false,
};

const terrainUrl =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
let terrainProviderPromise;
let terrainController;

async function setTerrainEnabled(enabled) {
  if (!enabled) {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    return;
  }

  try {
    terrainProviderPromise ??= Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
      terrainUrl,
    );
    const provider = await terrainProviderPromise;
    if (terrainParams.enabled) {
      viewer.terrainProvider = provider;
    }
  } catch (error) {
    terrainProviderPromise = undefined;
    terrainParams.enabled = false;
    terrainController?.updateDisplay();
    console.warn("地形加载失败", error);
  }
}

const statusEl = document.getElementById("status");
function updateStatus(text) {
  statusEl.textContent = text;
}

// 初始视角中心（南京附近）
const initialCenter = Cesium.Cartesian3.fromDegrees(118.858371, 32.070139, 0.0);

// 渲染参数（所有植被 primitive 共享）
const renderOptions = {
  windStrength: 1.1, // 风力强度（顶点摆动幅度）
  windFrequency: 0.8, // 风的频率
  windScale: 85.0, // 风的尺度（影响相位偏移的噪声尺度）
  roundedLeafNormals: true, // 树叶法线是否呈现圆润树冠形状
  lodCellSize: 480.0, // 局部网格单元大小，用于裁剪和 GPU 资源流式加载
  cullingTileSize: 1440.0, // 粗粒度瓦片大小，用于视锥裁剪时跳过成组 LOD 单元
  maximumTreeBranchDistance: 3200.0, // 树枝渲染的最大相机距离
  maximumTreeLeafDistance: 2600.0, // 树叶渲染的最大相机距离
  maximumGrassDistance: 800.0, // 草地渲染的最大相机距离
  maximumFlowerDistance: 600.0, // 花朵渲染的最大相机距离
  maximumRockDistance: 1800.0, // 岩石渲染的最大相机距离
  maximumCachedCommands: 256, // GPU 上保留的离屏命令资源最大数量
  gpuResourceCacheFrames: 45, // 未使用的命令资源在释放前保留的帧数
  maximumCommandBuildsPerFrame: 8, // 单帧上传的命令资源最大数量
  maximumCommandDestroysPerFrame: 16, // 单帧释放的命令资源最大数量
  maximumUploadBytesPerFrame: 512 * 1024, // 单帧上传的实例缓冲区字节数上限
  gpuPreloadRadius: 240.0, // 视锥外预加载单元所用的额外裁剪半径
  statisticsUpdateInterval: 30, // 两次统计刷新之间的帧数
  workerPacking: false, // 是否在 worker 中量化实例属性
};

function createPrimitive(modelMatrix) {
  return new EzTreePrimitive({
    modelMatrix,
    instances: [],
    ...renderOptions,
  });
}

// 手动绘制用的植被 primitive（初始无实例，绘制完成后再填充）
const primitive = viewer.scene.primitives.add(
  createPrimitive(Cesium.Transforms.eastNorthUpToFixedFrame(initialCenter)),
);

// 当前 GeoJSON 植被图层
let geoJSONLayer;
let geoJSONLoadId = 0;

// 植被分布参数（lil-gui 绑定）
const vegetationParams = {
  seed: 12,
  // 类型开关
  tree: true,
  grass: true,
  flower: true,
  rock: true,
  // 各类型密度（每公顷实例数）
  treeDensity: 18,
  grassDensity: 1000,
  flowerDensity: 100,
  rockDensity: 2,
  // 缩放
  treeScale: 0.58,
  grassScale: 1.0,
  // 树种
  treePreset: "Mixed",
  // 树是否贴合地形（只 clamp kind === "tree" 的实例）
  clampToTerrain: true,
};

const treePresetOptions = [
  "Mixed",
  "Oak Medium",
  "Pine Medium",
  "Aspen Medium",
  "Bush 2",
];

function polygonCenter(lonLats) {
  let lon = 0.0;
  let lat = 0.0;
  for (const vertex of lonLats) {
    lon += vertex[0];
    lat += vertex[1];
  }
  return { lon: lon / lonLats.length, lat: lat / lonLats.length };
}

/**
 * 由 GeoJSON feature 的 properties 与全局参数合并出生成选项。
 * properties 里可用 `treeDensity` / `grassDensity` / `flowerDensity` /
 * `rockDensity` / `treeScale` / `grassScale` / `seed` 覆盖全局值；密度为 0 表示不生成该类型。
 */
function resolveDensity(props, kind) {
  const densityKey = `${kind}Density`;
  const override = props[densityKey];
  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }
  return vegetationParams[kind] ? vegetationParams[densityKey] : 0;
}

function buildVegetationOptions(properties) {
  const props = properties || {};
  const num = (key, fallback) =>
    typeof props[key] === "number" && Number.isFinite(props[key])
      ? props[key]
      : fallback;
  const str = (key, fallback) =>
    typeof props[key] === "string" ? props[key] : fallback;

  const options = {
    seed: num("seed", vegetationParams.seed),
    treeDensity: resolveDensity(props, "tree"),
    grassDensity: resolveDensity(props, "grass"),
    flowerDensity: resolveDensity(props, "flower"),
    rockDensity: resolveDensity(props, "rock"),
    treeScale: num("treeScale", vegetationParams.treeScale),
    grassScale: num("grassScale", vegetationParams.grassScale),
    treePreset: str("treePreset", vegetationParams.treePreset),
    grassPatchScale: 10.0,
    grassPatchiness: 0.7,
    maximumGrassCount: 6000000,
    maximumFlowerCount: 80000,
    maximumRockCount: 5000,
  };

  if (Array.isArray(props.presets)) {
    options.presets = props.presets;
  }

  return options;
}

// ---------- 地形贴合 ----------

/**
 * 把实例中的树贴到地形表面（只处理 kind === "tree"）。
 * 用 Cesium.sampleTerrainMostDetailed 查询每个树位点的地形高度，
 * 并把局部 ENU 的 z 更新为地形高度。
 */
async function clampTreesToTerrain(instances, modelMatrix) {
  if (!terrainParams.enabled || !viewer.terrainProvider) return instances;

  const treeIndices = [];
  const cartographics = [];
  for (let i = 0; i < instances.length; i++) {
    if (instances[i].kind !== "tree") continue;
    treeIndices.push(i);

    // 局部 ENU → 世界 ECEF → 经纬度（sampleTerrain* 需要 Cartographic，而非 Cartesian3）
    const world = Cesium.Matrix4.multiplyByPoint(
      modelMatrix,
      instances[i].translation,
      new Cesium.Cartesian3(),
    );
    cartographics.push(Cesium.Cartographic.fromCartesian(world));
  }

  if (cartographics.length === 0) return instances;

  try {
    await Cesium.sampleTerrainMostDetailed(
      viewer.terrainProvider,
      cartographics,
    );

    const inverseModelMatrix = Cesium.Matrix4.inverse(
      modelMatrix,
      new Cesium.Matrix4(),
    );
    const world = new Cesium.Cartesian3();
    const local = new Cesium.Cartesian3();
    for (let i = 0; i < cartographics.length; i++) {
      const cartographic = cartographics[i];
      // 采样失败时 height 为 undefined，跳过该点
      if (typeof cartographic.height !== "number") continue;

      // 经纬度 + 地形高度 → 世界 ECEF → 局部 ENU
      Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height,
        undefined,
        world,
      );
      Cesium.Matrix4.multiplyByPoint(inverseModelMatrix, world, local);
      instances[treeIndices[i]].translation.z = local.z;
    }
  } catch (error) {
    console.error("地形采样失败，跳过树贴合地形：", error);
  }

  return instances;
}

/**
 * 以经纬度多边形在指定 primitive 内生成植被实例。
 * polygon 可为外环 [经度, 纬度] 数组，或 { positions, holes }（holes 为内环/孔洞）。
 */
async function generateIntoPrimitive(primitive, polygon, options) {
  const outer = Array.isArray(polygon) ? polygon : polygon.positions;
  const { lon, lat } = polygonCenter(outer);
  const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(lon, lat, 0.0),
  );

  let instances = await EzTreePrimitive.createVegetationInstancesAsync({
    modelMatrix, // 把经纬度多边形转换到局部 ENU 米
    polygon, // 边界（外环，或 { positions, holes }）
    ...options,
  });

  if (vegetationParams.clampToTerrain) {
    instances = await clampTreesToTerrain(instances, modelMatrix);
  }

  primitive.modelMatrix = modelMatrix;
  primitive.setInstances(instances);
  return instances;
}

function countInstances(instances) {
  return instances.reduce(
    (result, instance) => {
      result[instance.kind] += 1;
      return result;
    },
    { tree: 0, grass: 0, flower: 0, rock: 0 },
  );
}

function formatCounts(counts) {
  return `${counts.tree} trees, ${counts.grass} grass, ${counts.flower} flowers, ${counts.rock} rocks`;
}

// ---------- 手动绘制 ----------

async function generateFromShape(shape) {
  if (!shape || !Array.isArray(shape.lonLats) || shape.lonLats.length < 3) {
    updateStatus("图形顶点不足，无法生成植被。");
    return;
  }

  updateStatus("正在生成植被…");
  const instances = await generateIntoPrimitive(
    primitive,
    shape.lonLats,
    buildVegetationOptions(null),
  );
  updateStatus(formatCounts(countInstances(instances)));
}

// ---------- GeoJSON ----------

function clearGeoJSONLayer() {
  geoJSONLoadId++;
  if (geoJSONLayer) {
    geoJSONLayer.destroy();
    geoJSONLayer = undefined;
  }
}

async function loadGeoJSON(geojson) {
  clearGeoJSONLayer();
  const loadId = geoJSONLoadId;

  const layer = await EzTreeGeoJSON.load(geojson, {
    viewer,
    ...buildVegetationOptions(null),
    tree: vegetationParams.tree,
    grass: vegetationParams.grass,
    flower: vegetationParams.flower,
    rock: vegetationParams.rock,
    clampToTerrain: vegetationParams.clampToTerrain && terrainParams.enabled,
    primitiveOptions: renderOptions,
  });
  if (loadId !== geoJSONLoadId) {
    layer.destroy();
    return;
  }
  geoJSONLayer = layer;

  updateStatus(
    `已从 ${layer.polygonCount} 个面、${layer.pointCount} 个点生成：${formatCounts(layer.counts)}`,
  );
}

// 公交站点数据地址（Point 类型的 GeoJSON，作为树的坐标点）
const busStopUrl = "./data/bus_stop.json";

async function loadBusStopTrees() {
  updateStatus("正在加载公交站点数据…");
  try {
    const response = await fetch(busStopUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const geojson = await response.json();
    await loadGeoJSON(geojson);
  } catch (error) {
    updateStatus(`公交站点加载失败：${error.message}`);
  }
}

// ---------- 模拟点位 ----------

const simulateParams = {
  centerLon: 118.858371,
  centerLat: 32.070139,
  interval: 40,
  rows: 100,
  cols: 100,
};

/** 以中心点、间隔（米）、行/列数生成等间距网格点位（[经度, 纬度]） */
function createSimulatedPoints() {
  const { centerLon, centerLat, interval, rows, cols } = simulateParams;
  const metersPerLon = 111320 * Math.cos(Cesium.Math.toRadians(centerLat));
  const metersPerLat = 110540;

  const points = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dx = (col - (cols - 1) / 2) * interval; // 东
      const dy = (row - (rows - 1) / 2) * interval; // 北
      points.push([
        centerLon + dx / metersPerLon,
        centerLat + dy / metersPerLat,
      ]);
    }
  }
  return points;
}

async function generateSimulatedPoints() {
  const points = createSimulatedPoints();
  if (points.length === 0) {
    updateStatus("行数/列数至少为 1。");
    return;
  }

  updateStatus(`正在按 ${points.length} 个模拟点位生成树木…`);
  await loadGeoJSON({
    type: "MultiPoint",
    coordinates: points,
  });
}

// 隐藏的文件选择器，用于加载本地 GeoJSON 文件
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".geojson,.json,application/geo+json";
fileInput.style.display = "none";
document.body.appendChild(fileInput);
fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  try {
    await loadGeoJSON(JSON.parse(await file.text()));
  } catch (error) {
    updateStatus(`GeoJSON 解析失败：${error.message}`);
  } finally {
    fileInput.value = "";
  }
});

// ---------- 绘制管理器 ----------

const drawManager = new DrawManager({
  viewer,
  onStatus: updateStatus,
  onDrawComplete: (info) => {
    const area = Number.isFinite(info.area)
      ? `（${(info.area / 10000).toFixed(2)} 公顷）`
      : "";
    updateStatus(`${info.type} 绘制完成${area}，正在生成植被…`);
    generateFromShape(info);
  },
});

function clearAll() {
  drawManager.clearAll();
  primitive.setInstances([]);
  clearGeoJSONLayer();
}

// ---------- lil-gui 控制面板 ----------

const gui = new GUI({ title: "植被控制" });

const sceneFolder = gui.addFolder("场景");
terrainController = sceneFolder
  .add(terrainParams, "enabled")
  .name("地形")
  .onChange(setTerrainEnabled);

const vegFolder = gui.addFolder("植被分布");
vegFolder.add(vegetationParams, "tree").name("树");
vegFolder.add(vegetationParams, "grass").name("草");
vegFolder.add(vegetationParams, "flower").name("花");
vegFolder.add(vegetationParams, "rock").name("石头");
vegFolder
  .add(vegetationParams, "treePreset", treePresetOptions)
  .name("树种");
vegFolder.add(vegetationParams, "seed", 0, 1000, 1).name("随机种子");
vegFolder
  .add(vegetationParams, "treeDensity", 0, 200, 1)
  .name("树木密度/公顷");
vegFolder
  .add(vegetationParams, "grassDensity", 0, 2000, 10)
  .name("草地密度/公顷");
vegFolder
  .add(vegetationParams, "flowerDensity", 0, 500, 5)
  .name("花朵密度/公顷");
vegFolder
  .add(vegetationParams, "rockDensity", 0, 50, 1)
  .name("岩石密度/公顷");
vegFolder.add(vegetationParams, "treeScale", 0.1, 2.0, 0.01).name("树木缩放");
vegFolder
  .add(vegetationParams, "grassScale", 0.1, 3.0, 0.05)
  .name("草地缩放");
vegFolder.add(vegetationParams, "clampToTerrain").name("树贴合地形");

const drawFolder = gui.addFolder("绘制");
const drawActions = {
  drawPolygon() {
    drawManager.startDraw("polygon");
  },
  drawRectangle() {
    drawManager.startDraw("rectangle");
  },
  drawCircle() {
    drawManager.startDraw("circle");
  },
  regenerate() {
    if (drawManager.lastShape) {
      generateFromShape(drawManager.lastShape);
    } else {
      updateStatus("请先绘制图形。");
    }
  },
  flyTo() {
    drawManager.flyTo();
  },
  clear() {
    clearAll();
  },
};
drawFolder.add(drawActions, "drawPolygon").name("绘制多边形");
drawFolder.add(drawActions, "drawRectangle").name("绘制矩形");
drawFolder.add(drawActions, "drawCircle").name("绘制圆");
drawFolder.add(drawActions, "regenerate").name("重新生成植被");
drawFolder.add(drawActions, "flyTo").name("飞到图形");
drawFolder.add(drawActions, "clear").name("清除全部");

const geoFolder = gui.addFolder("GeoJSON");
const geoActions = {
  loadSample() {
    loadGeoJSON(sampleGeoJSON);
  },
  loadFile() {
    fileInput.click();
  },
  loadBusStops() {
    loadBusStopTrees();
  },
  clearGeo() {
    clearGeoJSONLayer();
    updateStatus("已清除 GeoJSON 植被。");
  },
};
geoFolder.add(geoActions, "loadSample").name("加载示例 GeoJSON");
geoFolder.add(geoActions, "loadFile").name("加载 GeoJSON 文件");
geoFolder.add(geoActions, "loadBusStops").name("加载公交站点树");
geoFolder.add(geoActions, "clearGeo").name("清除 GeoJSON 植被");

const simulateFolder = gui.addFolder("模拟点位");
simulateFolder.add(simulateParams, "centerLon").name("中心经度");
simulateFolder.add(simulateParams, "centerLat").name("中心纬度");
simulateFolder.add(simulateParams, "interval", 1, 100, 1).name("间隔（米）");
simulateFolder.add(simulateParams, "rows", 1, 500, 1).name("行数");
simulateFolder.add(simulateParams, "cols", 1, 500, 1).name("列数");
const simulateActions = {
  generate() {
    generateSimulatedPoints();
  },
};
simulateFolder.add(simulateActions, "generate").name("生成");

const styleFolder = gui.addFolder("绘制样式");
styleFolder
  .add(drawManager.params, "fillColor")
  .name("填充色")
  .onChange(() => drawManager.applyStyle());
styleFolder
  .add(drawManager.params, "fillOpacity", 0, 1, 0.01)
  .name("填充透明度")
  .onChange(() => drawManager.applyStyle());
styleFolder
  .add(drawManager.params, "outlineColor")
  .name("描边色")
  .onChange(() => drawManager.applyStyle());
styleFolder
  .add(drawManager.params, "outlineWidth", 1, 10, 1)
  .name("描边宽度")
  .onChange(() => drawManager.applyStyle());
styleFolder
  .add(drawManager.params, "showVertices")
  .name("显示顶点")
  .onChange(() => drawManager.applyStyle());
styleFolder
  .add(drawManager.params, "vertexSize", 2, 20, 1)
  .name("顶点大小")
  .onChange(() => drawManager.applyStyle());

viewer.camera.lookAt(
  initialCenter,
  new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(45.0),
    Cesium.Math.toRadians(-35.0),
    900.0,
  ),
);
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

updateStatus(
  "绘制多边形或加载 GeoJSON（面 Polygon / 点 Point / MultiPoint，properties 配置类型与树种）。",
);

window.ezTreePrimitive = primitive;
window.drawManager = drawManager;
