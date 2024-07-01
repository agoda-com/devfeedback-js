import type { ViteBuildData } from './types';
import { type Plugin } from 'vite';
import { getCommonMetadata, sendBuildData } from './common';
import { promises as fs } from 'fs';
import path from 'path';

export function viteBuildStatsPlugin(
  customIdentifier: string | undefined = process.env.npm_lifecycle_event,
): Plugin {
  let buildStart: number;
  let buildEnd: number;
  let rollupVersion: string | undefined = undefined;
  let bundleFiles: Record<string, number> = {};
  let bundleSize: number = 0;

  return {
    name: 'vite-plugin-agoda-build-reporter',
    buildStart: function () {
      buildStart = Date.now();
      rollupVersion = this.meta.rollupVersion;
    },
    buildEnd: function () {
      buildEnd = Date.now();
    },
    writeBundle: async function (options, bundle) {
      for (const [fileName, assetInfo] of Object.entries(bundle)) {
        const filePath = path.join(options.dir || '', fileName);
        try {
          const stats = await fs.stat(filePath);
          bundleFiles[fileName] = stats.size;
          bundleSize += stats.size;
        } catch (err) {
          console.error(`Error reading file size for ${fileName}:`, err);
        }
      }
    },
    closeBundle: async function () {
      const buildStats: ViteBuildData = {
        ...getCommonMetadata(buildEnd - buildStart, customIdentifier),
        type: 'vite',
        viteVersion: rollupVersion ?? null,
        bundleFiles,
        bundleSize,
      };

      sendBuildData(buildStats);
    },
  };
}
