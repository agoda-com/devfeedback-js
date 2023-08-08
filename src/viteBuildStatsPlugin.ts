import type { ViteBuildData } from './types';
import { type Plugin } from 'vite';
import { getCommonMetadata, sendBuildData } from './common';

export function viteBuildStatsPlugin(
  customIdentifier: string | undefined = process.env.npm_lifecycle_event,
): Plugin {
  let buildStart: number;
  let buildEnd: number;
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
    closeBundle: async function () {
      const buildStats: ViteBuildData = {
        ...getCommonMetadata(buildEnd - buildStart, customIdentifier),
        type: 'vite',
        viteVersion: rollupVersion ?? null,
      };

      sendBuildData(buildStats);
    },
  };
}
