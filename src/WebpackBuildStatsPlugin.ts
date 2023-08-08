import { getCommonMetadata, sendBuildData } from './common';
import type { WebpackBuildData } from './types';
import type { Compiler, Stats, StatsCompilation } from 'webpack';

export class WebpackBuildStatsPlugin {
  private readonly customIdentifier: string | undefined;
  constructor(customIdentifier: string | undefined = process.env.npm_lifecycle_event) {
    this.customIdentifier = customIdentifier;
  }

  apply(compiler: Compiler) {
    compiler.hooks.done.tap('AgodaBuildStatsPlugin', async (stats: Stats) => {
      const jsonStats: StatsCompilation = stats.toJson();

      const buildStats: WebpackBuildData = {
        ...getCommonMetadata(jsonStats.time ?? -1, this.customIdentifier),
        type: 'webpack',
        compilationHash: jsonStats.hash ?? null,
        webpackVersion: jsonStats.version ?? null,
        nbrOfCachedModules: jsonStats.modules?.filter((m) => m.cached).length ?? 0,
        nbrOfRebuiltModules: jsonStats.modules?.filter((m) => m.built).length ?? 0,
      };

      sendBuildData(buildStats);
    });
  }
}
