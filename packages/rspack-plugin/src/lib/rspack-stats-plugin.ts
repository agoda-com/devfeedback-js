import { Compiler, Stats, StatsCompilation } from '@rspack/core';
import type { Compilation } from '@rspack/core';
import { WebSocketServer, Server as WebSocketServerType } from 'ws';
import path from 'node:path';
import { createServer, Server as HttpServerType } from 'node:http';
import {
  debugError,
  debugLog,
  flushSpool,
  getCommonMetadata,
  onAbort,
  sendBuildData,
  sendCommandData,
} from 'agoda-devfeedback-common';
import { clientRuntimeSource } from './rspack-client-runtime';
import type {
  CommandBuildData,
  RspackBuildData,
  DevFeedbackEvent,
} from 'agoda-devfeedback-common';
import { getBundleStats } from './bootstrap-chunk-size';

export interface RspackBuildStatsPluginOptions {
  customIdentifier?: string;
  /** Production builds report `bundleStats` with this budget for the chunk named `bootstrap`. */
  bootstrapBundleSizeLimitKb?: number;
}

interface ClientReadyMessage {
  type: 'clientReady';
  elapsedMs?: number;
  domContentLoaded?: number;
  firstContentfulPaint?: number;
}

class RspackBuildStatsPlugin {
  private customIdentifier: string;
  private bootstrapBundleSizeLimitKb: number | undefined;
  private devFeedbackBuffer: DevFeedbackEvent[] = [];
  private wsServer: WebSocketServerType;
  private httpServer: HttpServerType;
  private toolVersion: string = '';
  private watchStart: number | undefined;
  private firstWatchCompileReported = false;
  private abortRegistered = false;
  private flushedOnce = false;
  private wsPort: Promise<number | undefined>;
  /** start of the rebuild in progress, or of the last one; HMR spans are timed from here */
  private lastWatchRun: number | undefined;
  private watchRunCount = 0;
  /** the rebuild an `rspackhmr` event was last sent for: one per rebuild, however many tabs */
  private hmrReportedFor: number | undefined;
  private clientReadyReported = false;
  private lastBuild: Pick<
    RspackBuildData,
    'compilationHash' | 'nbrOfCachedModules' | 'nbrOfRebuiltModules'
  > = { compilationHash: null, nbrOfCachedModules: 0, nbrOfRebuiltModules: 0 };

  /**
   * Accepts the identifier positionally, like the webpack and Vite plugins
   * (`new RspackBuildStatsPlugin('my-build')`), or in the options object.
   */
  constructor(options: string | RspackBuildStatsPluginOptions = {}) {
    const { customIdentifier, bootstrapBundleSizeLimitKb } =
      typeof options === 'string' ? { customIdentifier: options } : (options ?? {});
    this.customIdentifier = customIdentifier || process.env.npm_lifecycle_event || '';
    this.bootstrapBundleSizeLimitKb = bootstrapBundleSizeLimitKb;
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });
    this.wsPort = this.setupWebSocketServer();
  }

  apply(compiler: Compiler) {
    const pluginName = 'RspackBuildStatsPlugin';

    // Set the toolVersion from the compiler
    this.toolVersion = compiler.rspack?.version || '';
    compiler.hooks.compile.tap(pluginName, () => {
      this.devFeedbackBuffer = [];
    });

    compiler.hooks.done.tapAsync(pluginName, async (stats, callback) => {
      const statsJson = stats.toJson({
        preset: 'none',
        modules: true,
      });
      await this.processStats(stats, statsJson);
      callback();
    });

    compiler.hooks.watchRun.tap(pluginName, () => {
      this.devFeedbackBuffer = [];
      this.lastWatchRun = Date.now();
      this.watchRunCount++;
      if (this.watchStart === undefined) this.watchStart = this.lastWatchRun;
      debugLog('[RspackBuildStatsPlugin] Watching for changes...');
      this.registerAbortHandler();
    });

    compiler.hooks.failed.tap(pluginName, (error) => {
      debugError('[RspackBuildStatsPlugin] Compilation failed:', error);
    });

    this.injectClientRuntime(compiler, pluginName);

    // Cleanup
    compiler.hooks.shutdown.tap(pluginName, () => {
      this.wsServer.close();
      this.httpServer.close();
    });
  }

  /**
   * Give the browser a way to report back, in watch mode only: production, SSR and
   * one-off builds must stay untouched. `compiler.watchMode` is still false when
   * `apply` runs under `rspack serve`, so the check happens per compilation;
   * `thisCompilation` skips child compilations (e.g. the HTML plugin's) for free.
   *
   * A runtime module rather than an HTML tag, so it works without an HTML plugin.
   */
  private injectClientRuntime(compiler: Compiler, pluginName: string) {
    const RuntimeModule = compiler.rspack?.RuntimeModule;
    if (typeof RuntimeModule !== 'function') {
      debugLog('[RspackBuildStatsPlugin] RuntimeModule unavailable; no client events');
      return;
    }

    // Fixed for the life of the process (the port never changes), so it is held here
    // rather than on the module: instance fields can collide with the base class's
    // own properties, and Rspack 2 has a getter-only `source`.
    let clientCode = '';

    class DevFeedbackRuntimeModule extends RuntimeModule {
      constructor() {
        // last, so the HMR runtime has set up `__webpack_require__.i` before this runs
        super('devfeedback', RuntimeModule.STAGE_TRIGGER);
      }

      override generate(): string {
        return clientCode;
      }
    }

    compiler.hooks.watchRun.tapPromise(pluginName, async () => {
      // the server is listening long before the first compile; this never really waits
      const port = await this.wsPort;
      clientCode = port ? clientRuntimeSource(port) : '';
    });

    compiler.hooks.thisCompilation.tap(pluginName, (compilation: Compilation) => {
      if (!compiler.watchMode) return;
      compilation.hooks.additionalTreeRuntimeRequirements.tap(pluginName, (chunk) => {
        if (!clientCode) return;
        try {
          compilation.addRuntimeModule(chunk, new DevFeedbackRuntimeModule());
        } catch (err) {
          debugError('[RspackBuildStatsPlugin] Could not inject client runtime:', err);
        }
      });
    });
  }

  /** Ctrl-C during watch is a developer giving up on a rebuild; that is worth recording. */
  private registerAbortHandler() {
    if (this.abortRegistered) return;
    this.abortRegistered = true;
    onAbort((signal): CommandBuildData => ({
      ...getCommonMetadata(
        this.watchStart ? Date.now() - this.watchStart : 0,
        this.customIdentifier,
      ),
      type: 'command',
      phase: 'devserver',
      command: 'rspack watch',
      exitCode: 130,
      success: false,
      signal,
    }));
  }

  private setupWebSocketServer(): Promise<number | undefined> {
    const port = new Promise<number | undefined>((resolve) => {
      this.httpServer.once('error', (err) => {
        debugError('[DevFeedback] WebSocket server failed:', err);
        resolve(undefined);
      });
      this.httpServer.listen(0, () => {
        const address = this.httpServer.address();
        const port = typeof address === 'object' ? address?.port : undefined;
        debugLog(`[DevFeedback] WebSocket server on port ${port}`);
        resolve(port);
      });
    });

    this.wsServer.on('connection', (socket) => {
      socket.on('message', (rawMsg: string) => {
        this.handleIncomingWebSocketMessage(rawMsg);
      });
    });

    return port;
  }

  private async processStats(stats: Stats, statsJson: StatsCompilation) {
    this.recordEvent(stats, { type: 'compileDone' });

    const startTime = stats.startTime;
    const endTime = stats.endTime;
    const timeTaken = startTime && endTime ? endTime - startTime : -1;

    this.lastBuild = {
      compilationHash: stats.hash || '',
      nbrOfCachedModules: this.getCachedModulesCount(statsJson),
      nbrOfRebuiltModules: this.getRebuiltModulesCount(statsJson),
    };

    const buildStats: RspackBuildData = {
      ...getCommonMetadata(timeTaken, this.customIdentifier),
      type: 'rspack',
      ...this.lastBuild,
      toolVersion: this.toolVersion,
      devFeedback: this.devFeedbackBuffer,
    };
    // a dev build's chunk sizes say nothing about the production budget
    if (this.watchStart === undefined) {
      buildStats.bundleStats = getBundleStats([stats], this.bootstrapBundleSizeLimitKb);
    }

    await sendBuildData(buildStats);

    // In watch mode the first completed compile is the moment the developer can use
    // the app; it is also the first safe point to deliver anything the install or a
    // previous Ctrl-C left in the spool.
    if (this.watchStart !== undefined && !this.firstWatchCompileReported) {
      this.firstWatchCompileReported = true;
      await sendCommandData({
        ...getCommonMetadata(Date.now() - this.watchStart, this.customIdentifier),
        type: 'command',
        phase: 'devserver',
        command: 'rspack watch',
        exitCode: 0,
        success: true,
      });
    }

    // once per process only — every rebuild must stay free of extra filesystem work
    if (!this.flushedOnce) {
      this.flushedOnce = true;
      void flushSpool();
    }
  }

  private recordEvent(stats: Stats, partial: Omit<DevFeedbackEvent, 'elapsedMs'>) {
    const now = Date.now();
    const startTime = stats.startTime || now;
    const elapsedMs = now - startTime;
    const fileNormalized = partial.file ? this.normalizePath(partial.file) : undefined;

    this.devFeedbackBuffer.push({
      ...partial,
      file: fileNormalized,
      elapsedMs,
    });
  }

  /**
   * Client events arrive after `done`, so they cannot ride along in `devFeedback[]`:
   * that buffer has already been sent and is wiped by the next `watchRun`. Each one is
   * sent as its own event instead. Anything else, malformed or not, is ignored.
   */
  private handleIncomingWebSocketMessage(rawMsg: string) {
    try {
      const parsed = JSON.parse(String(rawMsg)) as { type?: unknown } | null;
      if (parsed?.type === 'clientReady') {
        this.handleClientReady(parsed as ClientReadyMessage);
      } else if (parsed?.type === 'hmrApplied') {
        this.handleHmrApplied();
      } else {
        debugLog('[DevFeedback] Ignoring unknown client message');
      }
    } catch (err) {
      debugError('[DevFeedback] Error handling incoming message:', err);
    }
  }

  /**
   * Time to a usable app, from the first `watchRun` — the same origin as `devserver`.
   * Once per process: a reload or a second tab is not a new dev server start.
   */
  private handleClientReady(msg: ClientReadyMessage) {
    if (this.clientReadyReported || this.watchStart === undefined) return;
    this.clientReadyReported = true;
    debugLog(`[DevFeedback] Client event: clientReady, elapsedMs=${msg.elapsedMs}`);

    void sendCommandData({
      ...getCommonMetadata(Date.now() - this.watchStart, this.customIdentifier),
      type: 'command',
      phase: 'clientready',
      command: 'rspack watch',
      exitCode: 0,
      success: true,
      domContentLoadedMs: finiteOrUndefined(msg.domContentLoaded),
      firstContentfulPaintMs: finiteOrUndefined(msg.firstContentfulPaint),
    });
  }

  /**
   * Edit → update applied in the browser, timed on this side against the rebuild's
   * `watchRun`: browser and plugin share a clock, and nothing baked into the runtime
   * can go stale. One event per rebuild, however many tabs or runtimes report it.
   */
  private handleHmrApplied() {
    const rebuildStart = this.lastWatchRun;
    // the first watchRun is the initial compile; there is nothing to hot-apply yet
    if (rebuildStart === undefined || this.watchRunCount < 2) return;
    if (this.hmrReportedFor === rebuildStart) return;
    this.hmrReportedFor = rebuildStart;

    const timeTaken = Date.now() - rebuildStart;
    debugLog(`[DevFeedback] Client event: hmrApplied, ${timeTaken}ms after watchRun`);

    void sendBuildData({
      ...getCommonMetadata(timeTaken, this.customIdentifier),
      type: 'rspackhmr',
      toolVersion: this.toolVersion,
      ...this.lastBuild,
    });
  }

  private normalizePath(filePath: string): string {
    return path.relative(process.cwd(), path.normalize(filePath));
  }

  private getCachedModulesCount(stats: StatsCompilation): number {
    return stats.modules?.filter((m) => m.cached).length ?? 0;
  }

  private getRebuiltModulesCount(stats: StatsCompilation): number {
    return stats.modules?.filter((m) => m.built).length ?? 0;
  }
}

const finiteOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export { RspackBuildStatsPlugin };
