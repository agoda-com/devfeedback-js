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

export interface WebpackBuildData extends CommonMetadata {
  type: 'webpack';
  webpackVersion: string | null;
  compilationHash: string | null;
  nbrOfCachedModules: number;
  nbrOfRebuiltModules: number;
  bundleSize: number;
}

export interface ViteBuildData extends CommonMetadata {
  type: 'vite';
  viteVersion: string | null;
  bundleSize: number;
}
