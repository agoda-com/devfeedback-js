import { Compiler, Stats } from '@rspack/core';
import { WebSocketServer, Server as WebSocketServerType } from 'ws';
import path from 'path';
import { createServer, Server as HttpServerType } from 'http';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import type { RspackBuildData, DevFeedbackEvent } from 'agoda-devfeedback-common';

class RspackBuildStatsPlugin {
  private customIdentifier: string;
  private devFeedbackBuffer: DevFeedbackEvent[] = [];
  private wsServer: WebSocketServerType;
  private httpServer: HttpServerType;
  private toolVersion: string = '';

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
      await this.processStats(stats);
      callback();
    });

    compiler.hooks.watchRun.tap(pluginName, () => {
      this.devFeedbackBuffer = [];
      console.log('[RspackBuildStatsPlugin] Watching for changes...');
    });

    compiler.hooks.failed.tap(pluginName, (error) => {
      console.error('[RspackBuildStatsPlugin] Compilation failed:', error);
    });

    // Cleanup
    compiler.hooks.shutdown.tap(pluginName, () => {
      this.wsServer.close();
      this.httpServer.close();
    });
  }

  private setupWebSocketServer() {
    this.httpServer.listen(0, () => {
      const address = this.httpServer.address();
      const port = typeof address === 'object' ? address?.port : null;
      console.log(`[DevFeedback] WebSocket server on port ${port}`);
    });

    this.wsServer.on('connection', (socket) => {
      socket.on('message', (rawMsg: string) => {
        this.handleIncomingWebSocketMessage(rawMsg);
      });
    });
  }

  private async processStats(stats: Stats) {
    this.recordEvent(stats, { type: 'compileDone' });

    const startTime = stats.startTime;
    const endTime = stats.endTime;
    const timeTaken = startTime && endTime ? endTime - startTime : -1;

    const buildStats: RspackBuildData = {
      ...getCommonMetadata(timeTaken, this.customIdentifier),
      type: 'rspack',
      compilationHash: stats.hash || '',
      toolVersion: this.toolVersion,
      nbrOfCachedModules: this.getCachedModulesCount(stats),
      nbrOfRebuiltModules: this.getRebuiltModulesCount(stats),
      devFeedback: this.devFeedbackBuffer,
    };

    await sendBuildData(buildStats);
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
      console.log(
        `[DevFeedback] Client event: ${parsed.type}, elapsedMs=${parsed.elapsedMs}`,
      );
    } catch (err) {
      // Ignore parse errors
      console.error('[DevFeedback] Error parsing incoming message:', err);
    }
  }

  private normalizePath(filePath: string): string {
    return path.relative(process.cwd(), path.normalize(filePath));
  }

  private getCachedModulesCount(stats: Stats): number {
    return stats.toJson().modules?.filter((m) => m.cached).length ?? 0;
  }

  private getRebuiltModulesCount(stats: Stats): number {
    return stats.toJson().modules?.filter((m) => m.built).length ?? 0;
  }
}

export { RspackBuildStatsPlugin };
