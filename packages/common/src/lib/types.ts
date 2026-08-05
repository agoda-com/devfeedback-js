export interface CommonMetadata {
  id: string;
  sessionId: string;
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
  type: 'rspack' | 'rsbuild';
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
  type: 'vite' | 'vitehmr';
  viteVersion: string | null;
  bundleStats?: ViteBundleStats;
  file: string | null;
}

/** A phase of the local dev cycle that is measured as a single span. */
export type CommandPhase =
  | 'install'
  | 'codegen'
  | 'typecheck'
  | 'lint'
  | 'test'
  | 'build'
  | 'devserver'
  | 'clientready';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface CommandBuildData extends CommonMetadata {
  type: 'command';
  phase: CommandPhase;
  command: string;
  exitCode: number;
  success: boolean;

  // install-specific, all optional
  packageManager?: PackageManager;
  packageManagerVersion?: string;
  /** node_modules absent beforehand */
  coldInstall?: boolean;
  /** lockfile hash before vs after */
  lockfileChanged?: boolean;
  /**
   * Where the install measurement came from:
   *  - 'preinstall'  exact span, root preinstall hook ran (most accurate)
   *  - 'postinstall' inferred from the package manager process start time
   *  - 'npm-timing'  scraped from npm's own ~/.npm/_logs/*-timing.json
   */
  measurementSource?: 'preinstall' | 'postinstall' | 'npm-timing';
  /** raw per-phase timers from `npm install --timing`, milliseconds */
  npmTimers?: Record<string, number>;

  // dev server specific, all optional
  /** Vite only: did this start (re)run dependency prebundling? undefined when unknown */
  prebundled?: boolean;

  // client-ready specific, all optional
  domContentLoadedMs?: number;
  firstContentfulPaintMs?: number;

  // outcome detail, all optional
  /** 'SIGINT' = developer gave up waiting */
  signal?: string;
  errorCount?: number;

  /** set by the spool when an event is delivered late */
  spooledAt?: number;
}
