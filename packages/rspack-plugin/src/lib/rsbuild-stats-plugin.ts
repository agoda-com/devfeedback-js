/* eslint-disable @typescript-eslint/no-explicit-any */
import { RsbuildPlugin, RsbuildPluginAPI } from '@rsbuild/core';
import { WebSocketServer } from 'ws';
import path from 'path';
import { createServer } from 'http';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import type { RspackBuildData, DevFeedbackEvent } from 'agoda-devfeedback-common';
import { Rspack, rspack } from '@rsbuild/core';

export const RsbuildBuildStatsPlugin: RsbuildPlugin = {
  name: 'RsbuildBuildStatsPlugin',
  async setup(api: RsbuildPluginAPI) {
    const customIdentifier = process.env.npm_lifecycle_event;
    let devFeedbackBuffer: DevFeedbackEvent[] = [];

    // Retrieve the Rsbuild core version from the context
    const rspackVersion = api.context.version;

    // Start a tiny HTTP + WebSocket server for dev feedback
    const httpServer = createServer();
    const wsServer = new WebSocketServer({ server: httpServer });

    httpServer.listen(0, () => {
      const port = (httpServer.address() as any)?.port;
      console.log(`[DevFeedback] WebSocket server on port ${port}`);
    });

    wsServer.on('connection', (socket) => {
      socket.on('message', (rawMsg: string) => {
        handleIncomingWebSocketMessage(rawMsg);
      });
    });

    // Hook into the build start (production)
    api.onBeforeBuild(() => {
      devFeedbackBuffer = [];
    });

    // Hook into the build end (production)
    api.onAfterBuild(async (params) => {
      const { stats } = params;
      if (!stats) {
        console.warn('[RsbuildBuildStatsPlugin] Warning: Stats object is undefined.');
        return;
      }
      await processStats(stats);
    });

    // Hook into the dev server start
    api.onBeforeStartDevServer(() => {
      console.log('[RsbuildBuildStatsPlugin] Development server is starting...');
      devFeedbackBuffer = [];
    });

    // Hook into the dev server compile done
    api.onDevCompileDone(async (params) => {
      const { stats } = params;
      if (!stats) {
        console.warn('[RsbuildBuildStatsPlugin] Warning: Stats object is undefined.');
        return;
      }
      await processStats(stats);
    });

    // Hook into the close build phase for cleanup
    api.onCloseBuild(() => {
      wsServer.close();
      httpServer.close();
    });

    // Shared function to process stats
    async function processStats(stats: Rspack.Stats | Rspack.MultiStats) {
      recordEvent(stats, { type: 'compileDone' });

      // Calculate timeTaken
      const startTime = getStartTime(stats);
      const endTime = getEndTime(stats);
      const timeTaken = startTime !== null && endTime !== null ? endTime - startTime : -1;

      // Collect build stats
      const buildStats: RspackBuildData = {
        ...getCommonMetadata(timeTaken, customIdentifier), // Pass timeTaken to getCommonMetadata
        type: 'rsbuild',
        compilationHash: getHash(stats),
        toolVersion: rspackVersion, // Use the version from api.context.version
        nbrOfCachedModules: getCachedModulesCount(stats),
        nbrOfRebuiltModules: getRebuiltModulesCount(stats),
        devFeedback: devFeedbackBuffer,
      };

      // Send everything to your existing endpoint
      sendBuildData(buildStats);
    }

    // Helper function to record events
    function recordEvent(
      stats: Rspack.Stats | Rspack.MultiStats,
      partial: Omit<DevFeedbackEvent, 'elapsedMs'>,
    ) {
      const now = Date.now();
      const startTime = getStartTime(stats);
      const elapsedMs = startTime !== null ? now - startTime : 0; // Use stats.startTime if available
      const fileNormalized = partial.file ? normalizePath(partial.file) : undefined;

      devFeedbackBuffer.push({
        ...partial,
        file: fileNormalized,
        elapsedMs,
      });
    }

    // Handle incoming WebSocket messages
    function handleIncomingWebSocketMessage(rawMsg: string) {
      try {
        const parsed = JSON.parse(rawMsg) as DevFeedbackEvent;
        devFeedbackBuffer.push(parsed);
        console.log(
          `[DevFeedback] Client event: ${parsed.type}, elapsedMs=${parsed.elapsedMs}`,
        );
      } catch (err) {
        // Ignore parse errors
        console.error('[DevFeedback] Error parsing incoming WebSocket message:', err);
      }
    }

    // Normalize file paths
    function normalizePath(filePath: string): string {
      return path.relative(process.cwd(), path.normalize(filePath));
    }

    // Extract start time from Stats or MultiStats
    function getStartTime(stats?: Rspack.Stats | Rspack.MultiStats): number | null {
      if (!stats) return null;
      if (stats instanceof rspack.MultiStats) {
        const startTimes = stats.stats
          .map((s) => s.startTime ?? null)
          .filter((t) => t !== null);
        return startTimes.length > 0 ? Math.min(...startTimes) : null;
      }
      return stats.startTime ?? null;
    }

    // Extract end time from Stats or MultiStats
    function getEndTime(stats?: Rspack.Stats | Rspack.MultiStats): number | null {
      if (!stats) return null;
      if (stats instanceof rspack.MultiStats) {
        const endTimes = stats.stats
          .map((s) => s.endTime ?? null)
          .filter((t) => t !== null);
        return endTimes.length > 0 ? Math.max(...endTimes) : null;
      }
      return stats.endTime ?? null;
    }

    // Extract hash from Stats or MultiStats
    function getHash(stats?: Rspack.Stats | Rspack.MultiStats): string | null {
      if (!stats) return null;
      if (stats instanceof rspack.MultiStats) {
        return stats.hash;
      }
      return stats.hash ?? null;
    }

    // Count cached modules
    function getCachedModulesCount(stats?: Rspack.Stats | Rspack.MultiStats): number {
      if (!stats) return 0;
      if (stats instanceof rspack.MultiStats) {
        return stats.stats.reduce(
          (sum, s) => sum + (s.toJson().modules?.filter((m) => m.cached).length ?? 0),
          0,
        );
      }
      return stats.toJson().modules?.filter((m) => m.cached).length ?? 0;
    }

    // Count rebuilt modules
    function getRebuiltModulesCount(stats?: Rspack.Stats | Rspack.MultiStats): number {
      if (!stats) return 0;
      if (stats instanceof rspack.MultiStats) {
        return stats.stats.reduce(
          (sum, s) => sum + (s.toJson().modules?.filter((m) => m.built).length ?? 0),
          0,
        );
      }
      return stats.toJson().modules?.filter((m) => m.built).length ?? 0;
    }
  },
};
