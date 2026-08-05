import { Compiler, Stats, StatsCompilation } from '@rspack/core';
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
import type {
  CommandBuildData,
  RspackBuildData,
  DevFeedbackEvent,
} from 'agoda-devfeedback-common';

class RspackBuildStatsPlugin {
  private customIdentifier: string;
  private devFeedbackBuffer: DevFeedbackEvent[] = [];
  private wsServer: WebSocketServerType;
  private httpServer: HttpServerType;
  private toolVersion: string = '';
  private watchStart: number | undefined;
  private firstWatchCompileReported = false;
  private abortRegistered = false;
  private flushedOnce = false;

  constructor(options: { customIdentifier?: string } = {}) {
    this.customIdentifier =
      options.customIdentifier || process.env.npm_lifecycle_event || '';
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });
    this.setupWebSocketServer();
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
      if (this.watchStart === undefined) this.watchStart = Date.now();
      debugLog('[RspackBuildStatsPlugin] Watching for changes...');
      this.registerAbortHandler();
    });

    compiler.hooks.failed.tap(pluginName, (error) => {
      debugError('[RspackBuildStatsPlugin] Compilation failed:', error);
    });

    // Cleanup
    compiler.hooks.shutdown.tap(pluginName, () => {
      this.wsServer.close();
      this.httpServer.close();
    });
  }

  /** Ctrl-C during watch is a developer giving up on a rebuild; that is worth recording. */
  private registerAbortHandler() {
    if (this.abortRegistered) return;
    this.abortRegistered = true;
    onAbort(
      (signal): CommandBuildData => ({
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
      }),
    );
  }

  private setupWebSocketServer() {
    this.httpServer.listen(0, () => {
      const address = this.httpServer.address();
      const port = typeof address === 'object' ? address?.port : null;
      debugLog(`[DevFeedback] WebSocket server on port ${port}`);
    });

    this.wsServer.on('connection', (socket) => {
      socket.on('message', (rawMsg: string) => {
        this.handleIncomingWebSocketMessage(rawMsg);
      });
    });
  }

  private async processStats(stats: Stats, statsJson: StatsCompilation) {
    this.recordEvent(stats, { type: 'compileDone' });

    const startTime = stats.startTime;
    const endTime = stats.endTime;
    const timeTaken = startTime && endTime ? endTime - startTime : -1;

    const buildStats: RspackBuildData = {
      ...getCommonMetadata(timeTaken, this.customIdentifier),
      type: 'rspack',
      compilationHash: stats.hash || '',
      toolVersion: this.toolVersion,
      nbrOfCachedModules: this.getCachedModulesCount(statsJson),
      nbrOfRebuiltModules: this.getRebuiltModulesCount(statsJson),
      devFeedback: this.devFeedbackBuffer,
    };

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

  private handleIncomingWebSocketMessage(rawMsg: string) {
    try {
      const parsed = JSON.parse(rawMsg) as DevFeedbackEvent;
      this.devFeedbackBuffer.push(parsed);
      debugLog(
        `[DevFeedback] Client event: ${parsed.type}, elapsedMs=${parsed.elapsedMs}`,
      );
    } catch (err) {
      // Ignore parse errors
      debugError('[DevFeedback] Error parsing incoming message:', err);
    }
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

export { RspackBuildStatsPlugin };
