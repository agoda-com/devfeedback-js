import { type Plugin } from 'vite';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { Blob } from 'node:buffer';

import type { ViteBuildData, ViteBundleStats } from './types';
import { getCommonMetadata, sendBuildData } from './common';

export function viteBuildStatsPlugin(
  customIdentifier: string | undefined = process.env.npm_lifecycle_event,
  bootstrapBundleSizeLimitKb?: number,
): Plugin {
  let buildStart: number;
  let buildEnd: number;
  let bootstrapChunkSizeBytes: number;
  let rollupVersion: string | undefined = undefined;

  return {
    name: 'vite-plugin-agoda-build-reporter',
    buildStart: function () {
      buildStart = Date.now();
      rollupVersion = this.meta.rollupVersion;
    },
    buildEnd: function () {
      buildEnd = Date.now();
    },
    generateBundle: (
      outputOptions: NormalizedOutputOptions,
      outputBundle: OutputBundle
    ) => {
      for (const [_, bundle] of Object.entries(outputBundle)) {
        if (bundle.name === 'bootstrap' && bundle.type === 'chunk') {
          bootstrapChunkSizeBytes = new Blob([bundle.code]).size;
        }
      }
    },
    closeBundle: async function () {
      const bundleStats: ViteBundleStats = {
        bootstrapChunkSizeBytes: bootstrapChunkSizeBytes,
        bootstrapChunkSizeLimitBytes: bootstrapBundleSizeLimitKb != null ? bootstrapBundleSizeLimitKb * 1000 : undefined,
      }

      const buildStats: ViteBuildData = {
        ...getCommonMetadata(buildEnd - buildStart, customIdentifier),
        type: 'vite',
        viteVersion: rollupVersion ?? null,
        bundleStats,
      };

      sendBuildData(buildStats);
    },
  };
}
