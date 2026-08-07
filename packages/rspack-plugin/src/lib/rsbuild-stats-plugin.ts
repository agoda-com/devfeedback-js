/* eslint-disable @typescript-eslint/no-explicit-any */
import { RsbuildPlugin, RsbuildPluginAPI } from '@rsbuild/core';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { createServer } from 'node:http';
import {
  debugError,
  debugLog,
  debugWarn,
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
import { Rspack, rspack } from '@rsbuild/core';

/** client events that arrive between compiles must not grow without bound */
const MAX_CARRIED_EVENTS = 100;

interface ClientReadyMessage {
  type: 'clientReady';
  elapsedMs?: number;
  domContentLoaded?: number;
  firstContentfulPaint?: number;
}

export const RsbuildBuildStatsPlugin: RsbuildPlugin = {
  name: 'RsbuildBuildStatsPlugin',
  async setup(api: RsbuildPluginAPI) {
    const customIdentifier = process.env.npm_lifecycle_event;
    let devFeedbackBuffer: DevFeedbackEvent[] = [];
    let devServerStart = 0;
    let clientReadyReported = false;
    let wsPort: number | undefined;

    // Retrieve the Rsbuild core version from the context
    const rspackVersion = api.context.version;

    // Start a tiny HTTP + WebSocket server for dev feedback
    const httpServer = createServer();
    const wsServer = new WebSocketServer({ server: httpServer });

    httpServer.listen(0, () => {
      wsPort = (httpServer.address() as any)?.port;
      debugLog(`[DevFeedback] WebSocket server on port ${wsPort}`);
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
        debugWarn('[RsbuildBuildStatsPlugin] Warning: Stats object is undefined.');
        return;
      }
      await processStats(stats);
    });

    // Hook into the dev server start
    api.onBeforeStartDevServer(() => {
      debugLog('[RsbuildBuildStatsPlugin] Development server is starting...');
      devServerStart = Date.now();
      clientReadyReported = false;
      // A restart before the first compile completes would otherwise silently drop
      // every client event the previous server collected, so carry them forward.
      devFeedbackBuffer = devFeedbackBuffer.slice(-MAX_CARRIED_EVENTS);
      registerAbortHandler();
    });

    // Time to a usable dev server — the number a developer actually waits for, and the
    // one measurement this plugin never had.
    api.onAfterStartDevServer?.(async () => {
      await sendCommandData({
        ...getCommonMetadata(Date.now() - devServerStart, customIdentifier),
        type: 'command',
        phase: 'devserver',
        command: 'rsbuild dev',
        exitCode: 0,
        success: true,
      });
      void flushSpool();
    });

    // Dev only. Ctrl-C during a production build is a different story and does not
    // belong in the devserver phase.
    let abortRegistered = false;
    function registerAbortHandler() {
      if (abortRegistered) return;
      abortRegistered = true;
      onAbort(
        (signal): CommandBuildData => ({
          ...getCommonMetadata(
            devServerStart ? Date.now() - devServerStart : 0,
            customIdentifier,
          ),
          type: 'command',
          phase: 'devserver',
          command: 'rsbuild dev',
          exitCode: 130,
          success: false,
          signal,
        }),
      );
    }

    // Give the browser a way to report back. The port is only known at runtime, so it
    // has to be injected rather than baked into a static client script.
    api.modifyHTMLTags?.((params: any) => {
      if (!wsPort) return params;
      params.headTags?.push({
        tag: 'script',
        attrs: { type: 'module' },
        children: clientScript(wsPort),
      });
      return params;
    });

    // Hook into the dev server compile done
    api.onDevCompileDone(async (params) => {
      const { stats } = params;
      if (!stats) {
        debugWarn('[RsbuildBuildStatsPlugin] Warning: Stats object is undefined.');
        return;
      }
      await processStats(stats);
    });

    // Hook into the close build phase for cleanup
    api.onCloseBuild(() => {
      wsServer.close();
      httpServer.close();
    });

    function clientScript(port: number): string {
      return `
        (() => {
          try {
            const socket = new WebSocket('ws://' + location.hostname + ':${port}');
            socket.addEventListener('open', () => {
              (('requestIdleCallback' in window) ? requestIdleCallback : setTimeout)(() => {
                const nav = performance.getEntriesByType('navigation')[0];
                const fcp = performance.getEntriesByName('first-contentful-paint')[0];
                // one message, so the server can time the span from dev server start
                // rather than from whenever the browser happened to open the page
                try {
                  socket.send(JSON.stringify({
                    type: 'clientReady',
                    elapsedMs: performance.now(),
                    domContentLoaded: nav && nav.domContentLoadedEventEnd,
                    firstContentfulPaint: fcp && fcp.startTime,
                  }));
                } catch {}
              }, 0);
            });
          } catch {}
        })();
      `;
    }

    // Shared function to process stats
    async function processStats(stats: Rspack.Stats | Rspack.MultiStats) {
      recordEvent(stats, { type: 'compileDone' });

      // Calculate timeTaken
      const startTime = getStartTime(stats);
      const endTime = getEndTime(stats);
      const timeTaken = startTime !== null && endTime !== null ? endTime - startTime : -1;

      // Collect build stats
      const modulesCount = getModulesCount(stats);
      const buildStats: RspackBuildData = {
        ...getCommonMetadata(timeTaken, customIdentifier), // Pass timeTaken to getCommonMetadata
        type: 'rsbuild',
        compilationHash: getHash(stats),
        toolVersion: rspackVersion, // Use the version from api.context.version
        nbrOfCachedModules: modulesCount.cached,
        nbrOfRebuiltModules: modulesCount.rebuilt,
        devFeedback: devFeedbackBuffer,
      };
      devFeedbackBuffer = [];

      // Send everything to your existing endpoint
      await sendBuildData(buildStats);
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
        const parsed = JSON.parse(rawMsg) as DevFeedbackEvent | ClientReadyMessage;
        if (parsed.type === 'clientReady') {
          handleClientReady(parsed as ClientReadyMessage);
          return;
        }
        devFeedbackBuffer.push(parsed as DevFeedbackEvent);
        debugLog(
          `[DevFeedback] Client event: ${parsed.type}, elapsedMs=${parsed.elapsedMs}`,
        );
      } catch (err) {
        // Ignore parse errors
        debugError('[DevFeedback] Error parsing incoming WebSocket message:', err);
      }
    }

    function bufferClientEvent(type: string, elapsedMs?: number) {
      if (typeof elapsedMs !== 'number') return;
      devFeedbackBuffer.push({ type, elapsedMs });
    }

    /**
     * `clientReady` used to exist only as an entry in `devFeedback[]`, timed with
     * `performance.now()` — i.e. from page navigation, excluding everything before the
     * browser opened the page. That is not comparable with Vite's `clientready`, which
     * runs from dev server start. Emit a first-class command event on the same origin
     * as Vite's, and keep the browser-relative numbers as detail.
     */
    function handleClientReady(msg: ClientReadyMessage) {
      bufferClientEvent('clientReady', msg.elapsedMs);
      bufferClientEvent('domContentLoaded', msg.domContentLoaded);
      bufferClientEvent('firstContentfulPaint', msg.firstContentfulPaint);
      debugLog(`[DevFeedback] Client event: clientReady, elapsedMs=${msg.elapsedMs}`);

      // one report per dev server run: a page reload is not a new dev server start,
      // and a production build has no dev server to measure from
      if (clientReadyReported || !devServerStart) return;
      clientReadyReported = true;

      void sendCommandData({
        ...getCommonMetadata(Date.now() - devServerStart, customIdentifier),
        type: 'command',
        phase: 'clientready',
        command: 'rsbuild dev',
        exitCode: 0,
        success: true,
        domContentLoadedMs: msg.domContentLoaded,
        firstContentfulPaintMs: msg.firstContentfulPaint,
      });
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
    function getModulesCount(stats?: Rspack.Stats | Rspack.MultiStats): {
      cached: number;
      rebuilt: number;
    } {
      const counts = {
        cached: 0,
        rebuilt: 0,
      };
      if (!stats) return counts;
      const allStats = stats instanceof rspack.MultiStats ? stats.stats : [stats];
      allStats.forEach((stats) => {
        // without a preset this serializes the entire compilation on every rebuild
        stats.toJson({ preset: 'none', modules: true }).modules?.forEach((module) => {
          if (module.built) {
            counts.rebuilt++;
          } else if (module.cached) {
            counts.cached++;
          }
        });
      });
      return counts;
    }
  },
};
