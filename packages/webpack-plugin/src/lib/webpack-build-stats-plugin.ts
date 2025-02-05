/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Compiler, Stats, StatsCompilation, Compilation } from 'webpack';
import webpack from 'webpack';
import { WebSocketServer } from 'ws';
import path from 'path';
import { createServer, Server } from 'http';

import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import type { WebpackBuildData, DevFeedbackEvent } from 'agoda-devfeedback-common';

export class WebpackBuildStatsPlugin {
  private readonly customIdentifier: string | undefined;

  // Capture the time each new watch-run starts. All server-side events measure from this.
  private buildStartTime = 0;

  // Gather dev feedback events from server + client
  private devFeedbackBuffer: DevFeedbackEvent[] = [];

  // Local WebSocket server
  private wsServer: WebSocketServer;
  private httpServer: Server;

  constructor(customIdentifier: string | undefined = process.env.npm_lifecycle_event) {
    this.customIdentifier = customIdentifier;

    // Start a tiny HTTP + WS server for dev feedback
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });

    this.httpServer.listen(0, () => {
      const port = (this.httpServer.address() as any)?.port;
      console.log(`[DevFeedback] WebSocket server on port ${port}`);
    });

    // On new client connection, wait for messages with dev-feedback events
    this.wsServer.on('connection', (socket) => {
      socket.on('message', (rawMsg: string) => {
        this.handleIncomingWebSocketMessage(rawMsg);
      });
    });
  }

  apply(compiler: Compiler) {
    /**
     * 1) watchRun => This is triggered each time webpack sees file changes & starts a new build.
     *    We'll reset the devFeedbackBuffer, store a new "buildStartTime", and record "fileChange" events if available.
     */
    compiler.hooks.watchRun.tap('WebpackBuildStatsPlugin', (c: any) => {
      this.buildStartTime = Date.now(); // The reference time (ms since epoch)
      this.devFeedbackBuffer = []; // Clear old events for a new build

      // If "modifiedFiles" is available (Rspack style):
      const changedFiles = c.modifiedFiles || [];
      for (const file of changedFiles) {
        this.recordEvent({ type: 'fileChange', file });
      }
    });

    /**
     * 2) compile => record "compileStart"
     */
    compiler.hooks.compile.tap('WebpackBuildStatsPlugin', () => {
      this.recordEvent({ type: 'compileStart' });
    });

    /**
     * 3) done => record "compileDone" and then send build stats with devFeedback
     */
    compiler.hooks.done.tap('WebpackBuildStatsPlugin', async (stats: Stats) => {
      this.recordEvent({ type: 'compileDone' });

      // Original build-stats logic
      const jsonStats: StatsCompilation = stats.toJson();

      const buildStats: WebpackBuildData = {
        ...getCommonMetadata(jsonStats.time ?? -1, this.customIdentifier),
        type: 'webpack',
        compilationHash: jsonStats.hash ?? null,
        toolVersion: jsonStats.version ?? null,
        nbrOfCachedModules: jsonStats.modules?.filter((m) => m.cached).length ?? 0,
        nbrOfRebuiltModules: jsonStats.modules?.filter((m) => m.built).length ?? 0,

        // Attach dev feedback events
        devFeedback: this.devFeedbackBuffer,
      };

      // Send everything to your existing endpoint
      await sendBuildData(buildStats);
    });

    /**
     * 4) Inject client code as a runtime module
     */
    compiler.hooks.compilation.tap(
      'WebpackBuildStatsPlugin',
      (compilation: Compilation) => {
        compilation.hooks.afterChunks.tap('WebpackBuildStatsPlugin', (chunks) => {
          for (const chunk of chunks) {
            if (chunk.canBeInitial()) {
              compilation.addRuntimeModule(
                chunk,
                new DevFeedbackRuntimeModule(() => this.generateClientCode()),
              );
            }
          }
        });
      },
    );
  }

  /**
   * "recordEvent" is a helper for server-side events to unify how we set "elapsedMs".
   * We'll measure offset as (Date.now() - this.buildStartTime).
   */
  private recordEvent(partial: Omit<DevFeedbackEvent, 'elapsedMs'>) {
    const now = Date.now();
    const elapsedMs = now - this.buildStartTime;
    const fileNormalized = partial.file ? this.normalizePath(partial.file) : undefined;

    this.devFeedbackBuffer.push({
      ...partial,
      file: fileNormalized,
      elapsedMs,
    });
  }

  /**
   * Handle client-sent messages. The client snippet can do:
   *    elapsedMs = Date.now() - window.__BUILD_START__
   * And send { type, elapsedMs } in JSON.
   */
  private handleIncomingWebSocketMessage(rawMsg: string) {
    try {
      const parsed = JSON.parse(rawMsg) as DevFeedbackEvent;
      // e.g. { type: 'hmrApplied', elapsedMs: 312, file?: string }

      // Just push into our buffer
      this.devFeedbackBuffer.push(parsed);

      console.log(
        `[DevFeedback] Client event: ${parsed.type}, elapsedMs=${parsed.elapsedMs}`,
      );
    } catch (err) {
      // parse error, ignore
      console.error('[DevFeedback] Error parsing client message:', err);
    }
  }

  /**
   * Generates the snippet that the browser runs. We'll embed the "buildStartTime" so we
   * can do (Date.now() - window.__BUILD_START__) for consistent offsets.
   */
  private generateClientCode(): string {
    const wsPort = (this.wsServer.address() as any)?.port;
    const wsUrl = `ws://localhost:${wsPort}`;
    // Bake in the server's reference time, so client events match server's timeline
    const buildStartTime = this.buildStartTime;

    return `
      (function(){
        window.__BUILD_START__ = ${buildStartTime};

        var ws = new WebSocket('${wsUrl}');
        var moduleUpdateTimer;

        if (module.hot) {
          module.hot.addStatusHandler(function(status) {
            if (status === 'idle' || status === 'ready') {
              clearTimeout(moduleUpdateTimer);
              moduleUpdateTimer = setTimeout(function() {
                var elapsed = Date.now() - window.__BUILD_START__;
                ws.send(JSON.stringify({
                  type: 'hmrApplied',
                  elapsedMs: elapsed
                }));
              }, 50);
            }
          });
        }

        var observer = new MutationObserver(function() {
          clearTimeout(moduleUpdateTimer);
          moduleUpdateTimer = setTimeout(function() {
            var elapsed = Date.now() - window.__BUILD_START__;
            ws.send(JSON.stringify({
              type: 'domUpdated',
              elapsedMs: elapsed
            }));
          }, 50);
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      })();
    `;
  }

  private normalizePath(filePath: string): string {
    return path.relative(process.cwd(), path.normalize(filePath));
  }
  /**
   * Close the underlying servers so tests (or the app) can shut down cleanly.
   */
  public close() {
    // Close WebSocket server
    this.wsServer.close();
    // Close HTTP server
    this.httpServer.close();
  }
}

/**
 * Minimal runtime module class for injecting code at build-time.
 */
class DevFeedbackRuntimeModule extends webpack.RuntimeModule {
  private generateFn: () => string;

  constructor(generateFn: () => string) {
    super('DevFeedbackRuntimeModule');
    this.generateFn = generateFn;
  }

  override generate(): string {
    return this.generateFn();
  }
}
