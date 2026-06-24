export interface EzTreeConfiguration {
  assetBaseUrl?: string;
  workerBaseUrl?: string;
  workerUrls?: Record<string, string>;
  useWorkers?: boolean;
}

export interface EzTreePrimitiveOptions {
  show?: boolean;
  modelMatrix?: unknown;
  instances?: EzTreeVegetationInstance[];
  windStrength?: number;
  windFrequency?: number;
  windScale?: number;
  lodCellSize?: number;
  cullingTileSize?: number;
  asynchronous?: boolean;
  workerPacking?: boolean;
  roundedLeafNormals?: boolean;
  maximumTreeBranchDistance?: number;
  maximumTreeLeafDistance?: number;
  maximumGrassDistance?: number;
  maximumFlowerDistance?: number;
  maximumRockDistance?: number;
  maximumCachedCommands?: number;
  gpuResourceCacheFrames?: number;
  maximumCommandBuildsPerFrame?: number;
  maximumCommandDestroysPerFrame?: number;
  maximumUploadBytesPerFrame?: number;
  gpuPreloadRadius?: number;
  statisticsUpdateInterval?: number;
  debugShowBoundingVolume?: boolean;
}

export interface EzTreeVegetationOptions {
  seed?: number;
  width?: number;
  depth?: number;
  treePreset?: string;
  treeDensity?: number;
  grassDensity?: number;
  flowerDensity?: number;
  rockDensity?: number;
  treeCount?: number;
  grassCount?: number;
  flowerCount?: number;
  rockCount?: number;
  treeScale?: number;
  grassScale?: number;
  flowerScale?: number;
  rockScale?: number;
  grassPatchScale?: number;
  grassPatchiness?: number;
  maximumGrassCount?: number;
  maximumFlowerCount?: number;
  maximumRockCount?: number;
  minimumTreeSpacing?: number;
}

export interface EzTreeVegetationInstance {
  kind: "tree" | "grass" | "flower" | "rock";
  preset?: string;
  asset?: string;
  translation?: { x: number; y: number; z: number };
  position?: { x: number; y: number; z: number };
  scale?: number | { x: number; y: number; z: number };
  rotation?: number;
  windWeight?: number;
  color?: unknown;
  branchColor?: unknown;
  leafColor?: unknown;
  colorVariation?: number;
}

export interface EzTreeStatistics {
  totalCommands: number;
  totalTiles: number;
  cachedCommands: number;
  gpuMemoryBytes: number;
  packedCpuMemoryBytes: number;
  pendingWorkerTasks: number;
}

export class EzTreePrimitive {
  constructor(options?: EzTreePrimitiveOptions);
  readonly instances: EzTreeVegetationInstance[];
  readonly boundingSphere: unknown;
  readonly statistics: EzTreeStatistics;
  setInstances(instances?: EzTreeVegetationInstance[]): void;
  update(frameState: unknown): void;
  isDestroyed(): boolean;
  destroy(): undefined;
  static createVegetationInstances(
    options?: EzTreeVegetationOptions,
  ): EzTreeVegetationInstance[];
  static createVegetationInstancesAsync(
    options?: EzTreeVegetationOptions,
  ): Promise<EzTreeVegetationInstance[]>;
  static TreePreset: Record<string, unknown>;
  static loadPreset(name?: string): EzTreeOptions;
}

export class EzTreeOptions {
  constructor(options?: Record<string, unknown>);
  static clone(options?: Record<string, unknown>): EzTreeOptions;
  static merge(target: Record<string, unknown>, source?: Record<string, unknown>): Record<string, unknown>;
}

export class EzTreeGenerator {
  constructor(options?: EzTreeOptions | Record<string, unknown>);
  generate(): unknown;
}

export const BarkType: Record<string, string>;
export const Billboard: Record<string, string>;
export const EzTreeBarkType: Record<string, string>;
export const EzTreeBillboard: Record<string, string>;
export const EzTreeEnums: Record<string, unknown>;
export const EzTreeLeafType: Record<string, string>;
export const EzTreePreset: Record<string, unknown>;
export const EzTreeRNG: unknown;
export const EzTreeTreeType: Record<string, string>;
export const LeafType: Record<string, string>;
export const TreePreset: Record<string, unknown>;
export const TreeType: Record<string, string>;

export function configureEzTree(options?: EzTreeConfiguration): EzTreeConfiguration;
export function getEzTreeConfiguration(): Required<EzTreeConfiguration>;
export function installEzTree<T extends Record<string, unknown>>(Cesium: T): T;
export function createEzTreeVegetationInstances(
  options?: EzTreeVegetationOptions,
): EzTreeVegetationInstance[];
export function createFlowerGeometry(): unknown;
export function createGrassGeometry(): unknown;
export function generateTreeGeometry(options?: EzTreeOptions | Record<string, unknown>): unknown;
export function loadEzTreePreset(name?: string): EzTreeOptions;
export function loadPreset(name?: string): EzTreeOptions;
export function cloneOptions(options?: Record<string, unknown>): EzTreeOptions;
export function mergeOptions(target: Record<string, unknown>, source?: Record<string, unknown>): Record<string, unknown>;

declare const api: {
  EzTreePrimitive: typeof EzTreePrimitive;
  EzTreeOptions: typeof EzTreeOptions;
  configureEzTree: typeof configureEzTree;
  installEzTree: typeof installEzTree;
};

export default api;
