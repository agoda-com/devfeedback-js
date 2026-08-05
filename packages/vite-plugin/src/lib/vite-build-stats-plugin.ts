import { type Plugin, type ResolvedConfig, ViteDevServer } from 'vite';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { Blob } from 'node:buffer';
import path from 'node:path';
import { statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'http';

import type {
  CommandBuildData,
  ViteBuildData,
  ViteBundleStats,
} from 'agoda-devfeedback-common';
import {
  debugError,
  flushSpool,
  getCommonMetadata,
  onAbort,
  sendBuildData,
  sendCommandData,
} from 'agoda-devfeedback-common';

interface TimingEntry {
  file: string;
  changeDetectedAt: number;
}

interface ClientMessage {
  file: string;
  clientTimestamp: number;
}

interface ClientReadyMessage {
  elapsedMs?: number;
  domContentLoaded?: number;
  firstContentfulPaint?: number;
}

export interface ViteTimingPlugin extends Plugin {
  _TEST_getChangeMap?: () => Map<string, TimingEntry>;
}

const HMR_COMPLETE_PATH = '/__vite_timing_hmr_complete';
const CLIENT_READY_PATH = '/__vite_timing_ready';

export function viteBuildStatsPlugin(
  customIdentifier: string | undefined = process.env.npm_lifecycle_event,
  bootstrapBundleSizeLimitKb?: number,
): ViteTimingPlugin {
  let buildStart: number;
  let buildEnd: number;
  let bootstrapChunkSizeBytes: number | undefined = undefined;
  let rollupVersion: string | undefined = undefined;
  let root: string | undefined = undefined;
  let depsMetaMtimeBefore: number | undefined = undefined;
  let clientReadyReported = false;
  const changeMap = new Map<string, TimingEntry>();

  const normalizePath = (filePath: string): string => {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  };

  /**
   * Dependency prebundling is usually the dominant cold-start cost, and its metadata
   * file is rewritten only when prebundling actually ran. Strictly best effort — under
   * Rolldown-based Vite the file may not exist at all, so the flag stays undefined
   * rather than guessing. Never reach into server internals for this.
   */
  const depsMetaMtime = (): number | undefined => {
    try {
      return statSync(
        path.join(root ?? process.cwd(), 'node_modules/.vite/deps/_metadata.json'),
      ).mtimeMs;
    } catch {
      return undefined;
    }
  };

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
    });

  const clientScript = {
    virtualHmrModule: `
      import { createHotContext as __vite__createHotContext } from '/@vite/client';
      const hot = __vite__createHotContext('/@vite-timing/hmr');
      if (hot) {
        hot.on('vite:afterUpdate', (data) => {
          if (Array.isArray(data.updates)) {
            data.updates.forEach(update => {
              if (update.path) {
                const endTime = Date.now();
                fetch('${HMR_COMPLETE_PATH}', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Silent': 'true'
                  },
                  body: JSON.stringify({
                    file: update.path,
                    clientTimestamp: endTime
                  })
                }).catch(err => console.error('[vite-timing] Failed to send metrics:', err));
              }
            });
          }
        });
      }

      // time to app usable: reported once, from an idle callback, so it never competes
      // with the app's own startup work
      (('requestIdleCallback' in window) ? requestIdleCallback : setTimeout)(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        fetch('${CLIENT_READY_PATH}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Silent': 'true' },
          body: JSON.stringify({
            elapsedMs: performance.now(),
            domContentLoaded: nav && nav.domContentLoadedEventEnd,
            firstContentfulPaint: fcp && fcp.startTime,
          }),
        }).catch(() => {});
      }, 0);
    `,
  };

  const plugin: ViteTimingPlugin = {
    name: 'vite-plugin-agoda-build-reporter',

    configResolved(config: ResolvedConfig) {
      root = config.root;
      depsMetaMtimeBefore = depsMetaMtime();
    },

    configureServer(server: ViteDevServer) {
      const serverStart = Date.now();

      // In dev mode closeBundle never fires, so without this the single number a
      // developer actually waits for — time to a usable dev server — is never measured.
      server.httpServer?.once('listening', () => {
        const after = depsMetaMtime();
        const prebundled =
          depsMetaMtimeBefore === undefined && after === undefined
            ? undefined
            : after !== depsMetaMtimeBefore;

        void sendCommandData({
          ...getCommonMetadata(Date.now() - serverStart, customIdentifier),
          type: 'command',
          phase: 'devserver',
          command: 'vite dev',
          exitCode: 0,
          success: true,
          ...(prebundled === undefined ? {} : { prebundled }),
        });

        // deliver whatever install, or a previous Ctrl-C, left behind
        void flushSpool(root);
      });

      // A dev server the developer gave up on is data, not an absence of data.
      onAbort(
        (signal): CommandBuildData => ({
          ...getCommonMetadata(Date.now() - serverStart, customIdentifier),
          type: 'command',
          phase: 'devserver',
          command: 'vite dev',
          exitCode: 130,
          success: false,
          signal,
        }),
        root,
      );

      server.watcher.on('change', (file: string) => {
        const timestamp = Date.now();
        const relativePath = normalizePath(path.relative(process.cwd(), file));

        changeMap.set(relativePath, {
          file: relativePath,
          changeDetectedAt: timestamp,
        });
      });

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (req.url === HMR_COMPLETE_PATH) {
          void readBody(req).then(async (body) => {
            try {
              const { file, clientTimestamp } = JSON.parse(body) as ClientMessage;
              const normalizedFile = normalizePath(file);

              const entry = changeMap.get(normalizedFile);
              if (entry) {
                const totalTime = clientTimestamp - entry.changeDetectedAt;

                const metricsData: ViteBuildData = {
                  ...getCommonMetadata(totalTime, customIdentifier),
                  type: 'vitehmr',
                  viteVersion: rollupVersion ?? null,
                  bundleStats: {
                    bootstrapChunkSizeBytes: undefined,
                    bootstrapChunkSizeLimitBytes: undefined,
                  },
                  file: entry.file,
                };

                await sendBuildData(metricsData);
                changeMap.delete(normalizedFile);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: false,
                    reason: 'No timing entry found for file',
                    file: normalizedFile,
                    availableFiles: Array.from(changeMap.keys()),
                  }),
                );
              }
            } catch (err) {
              debugError('[vite-timing] Error processing timing data:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : 'Unknown error',
                }),
              );
            }
          });
        } else if (req.url === CLIENT_READY_PATH) {
          void readBody(req).then(async (body) => {
            try {
              // one report per server run: a reload is not a new dev server start
              if (!clientReadyReported) {
                clientReadyReported = true;
                const payload = JSON.parse(body) as ClientReadyMessage;
                await sendCommandData({
                  ...getCommonMetadata(
                    Math.round(Date.now() - serverStart),
                    customIdentifier,
                  ),
                  type: 'command',
                  phase: 'clientready',
                  command: 'vite dev',
                  exitCode: 0,
                  success: true,
                  domContentLoadedMs: payload.domContentLoaded,
                  firstContentfulPaintMs: payload.firstContentfulPaint,
                });
              }
            } catch (err) {
              debugError('[vite-timing] Error processing client ready data:', err);
            }
            res.writeHead(204);
            res.end();
          });
        } else {
          next();
        }
      });
    },

    resolveId(id: string) {
      if (id === '/@vite-timing/hmr') {
        return id;
      }
      return null;
    },

    load(id: string) {
      if (id === '/@vite-timing/hmr') {
        return clientScript.virtualHmrModule;
      }
      return null;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformIndexHtml(html: string, ctx?: { [key: string]: any }) {
      if (!ctx || ctx.command !== 'build') {
        return html.replace(
          '</head>',
          `<script type="module" src="/@vite-timing/hmr"></script></head>`,
        );
      }
      return html;
    },

    buildStart() {
      buildStart = Date.now();
      rollupVersion = this.meta.rollupVersion;
    },

    buildEnd() {
      buildEnd = Date.now();
    },

    generateBundle(outputOptions: NormalizedOutputOptions, outputBundle: OutputBundle) {
      try {
        for (const [, bundle] of Object.entries(outputBundle)) {
          if (bundle.name === 'bootstrap' && bundle.type === 'chunk') {
            bootstrapChunkSizeBytes = new Blob([bundle.code]).size;
          }
        }
      } catch (err) {
        console.warn('Failed to measure bootstrap chunk size because of error', err);
      }
    },

    closeBundle: async function () {
      const bundleStats: ViteBundleStats = {
        bootstrapChunkSizeBytes: bootstrapChunkSizeBytes,
        bootstrapChunkSizeLimitBytes:
          bootstrapBundleSizeLimitKb != null
            ? bootstrapBundleSizeLimitKb * 1000
            : undefined,
      };

      const buildStats: ViteBuildData = {
        ...getCommonMetadata(buildEnd - buildStart, customIdentifier),
        type: 'vite',
        viteVersion: rollupVersion ?? null,
        bundleStats,
        file: null,
      };

      await sendBuildData(buildStats);

      // a production build is a fine moment to deliver a stale install event
      void flushSpool(root);
    },
  };

  if (process.env.NODE_ENV === 'test') {
    plugin._TEST_getChangeMap = () => changeMap;
  }

  return plugin;
}
