export interface CommonMetadata {
  id: string;
  userName: string;
  cpuCount: number;
  hostname: string;
  platform: string;
  os: string;
  timeTaken: number;
  branch: string;
  projectName: string;
  repository: string;
  repositoryName: string;
  timestamp: number | null;
  builtAt: string | null;
  totalMemory: number;
  cpuModels: string[];
  cpuSpeed: number[];
  nodeVersion: string;
  v8Version: string;
  commitSha: string;
  customIdentifier: string | null;
}

export interface RspackBuildData extends CommonMetadata {
  type: 'rspack' | 'rsbuild' | 'webpack';
  toolVersion: string | null;
  compilationHash: string | null;
  nbrOfCachedModules: number;
  nbrOfRebuiltModules: number;
  devFeedback?: DevFeedbackEvent[];
}

export interface WebpackBuildData extends Omit<RspackBuildData, 'type'> {
  type: 'webpack';
}

export interface DevFeedbackEvent {
  // e.g. "fileChange", "compileStart", "hmrApplied", "domUpdated"
  type: string;
  // The amount of time since some reference point, in milliseconds
  elapsedMs: number;
  // optional, e.g. a file path
  file?: string;
}

export interface ViteBundleStats {
  bootstrapChunkSizeBytes?: number;
  bootstrapChunkSizeLimitBytes?: number;
}

export interface ViteBuildData extends CommonMetadata {
  type: 'vite';
  viteVersion: string | null;
  bundleStats?: ViteBundleStats;
}
