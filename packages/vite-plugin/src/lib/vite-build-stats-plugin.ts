import { type Plugin, ViteDevServer } from 'vite';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { Blob } from 'node:buffer';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'http';

import type { ViteBuildData, ViteBundleStats } from 'agoda-devfeedback-common';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';

interface TimingEntry {
  file: string;
  changeDetectedAt: number;
}

interface ClientMessage {
  file: string;
  clientTimestamp: number;
}

export interface ViteTimingPlugin extends Plugin {
  _TEST_getChangeMap?: () => Map<string, TimingEntry>;
}

export function viteBuildStatsPlugin(
  customIdentifier: string | undefined = process.env.npm_lifecycle_event,
  bootstrapBundleSizeLimitKb?: number,
): ViteTimingPlugin {
  let buildStart: number;
  let buildEnd: number;
  let bootstrapChunkSizeBytes: number | undefined = undefined;
  let rollupVersion: string | undefined = undefined;
  const changeMap = new Map<string, TimingEntry>();

  const normalizePath = (filePath: string): string => {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  };

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
                fetch('/__vite_timing_hmr_complete', {
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
    `,
  };

  const plugin: ViteTimingPlugin = {
    name: 'vite-plugin-agoda-build-reporter',

    configureServer(server: ViteDevServer) {
      server.watcher.on('change', (file: string) => {
        const timestamp = Date.now();
        const relativePath = normalizePath(path.relative(process.cwd(), file));

        changeMap.set(relativePath, {
          file: relativePath,
          changeDetectedAt: timestamp,
        });
      });

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (req.url === '/__vite_timing_hmr_complete') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', async () => {
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
              console.error('[vite-timing] Error processing timing data:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : 'Unknown error',
                }),
              );
            }
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
    },
  };

  if (process.env.NODE_ENV === 'test') {
    plugin._TEST_getChangeMap = () => changeMap;
  }

  return plugin;
}
