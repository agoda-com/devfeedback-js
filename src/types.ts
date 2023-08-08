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
}

export interface ViteBuildData extends CommonMetadata {
  type: 'vite';
  viteVersion: string | null;
}

export interface VitestTestFile {
  name: string;
  collectDuration: number | null;
  setupDuration: number | null;
  prepareDuration: number | null;
  environmentLoad: number | null;
  status: 'run' | 'skip' | 'only' | 'todo' | 'pass' | 'fail' | null;
  startTime: number;
  duration: number;
}

export interface VitestTestCase {
  name: string;
  status: 'run' | 'skip' | 'only' | 'todo' | 'pass' | 'fail' | null;
  errorMessage: string[] | null;
  startTime: number;
  duration: number;
  filename: string;
}

export interface VitestTestData extends CommonMetadata {
  type: 'vitest';
  vitestVersion: string | null;
  mode: 'test' | 'benchmark' | 'typecheck';
  maxConcurrency: number;
  watchMode: boolean;
  testEnvironment: string;
  runId: string;
  files: VitestTestFile[];
  testcases: VitestTestCase[];
}
