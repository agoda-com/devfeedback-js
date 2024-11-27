import { getCommonMetadata, sendBuildData } from './common';
import type { WebpackBuildData } from './types';
import type { Compiler, Stats, StatsCompilation } from 'webpack';

export class WebpackBuildStatsPlugin {
  private readonly customIdentifier: string | undefined;
  constructor(customIdentifier: string | undefined = process.env.npm_lifecycle_event) {
    this.customIdentifier = customIdentifier;
  }

  apply(compiler: Compiler) {
    compiler.hooks.done.tapPromise('AgodaBuildStatsPlugin', async (stats: Stats) => {
      let nbrOfCachedModules = 0, nbrOfRebuiltModules = 0;
      // https://github.com/webpack/webpack/blob/f4092a60598a73447687fa6e6375bb4786bfcbe3/lib/stats/DefaultStatsFactoryPlugin.js#L1142
      const compilation = stats.compilation;
      for (const module of compilation.modules) {
        if (!compilation.builtModules.has(module) && !compilation.codeGeneratedModules.has(module)) {
          nbrOfCachedModules += 1;
        } else {
          nbrOfRebuiltModules += 1;
        }
      }
      const buildStats: WebpackBuildData = {
        ...getCommonMetadata(stats.endTime - stats.startTime ?? -1, this.customIdentifier),
        type: 'webpack',
        compilationHash: stats.hash ?? null,
        webpackVersion: compiler.webpack.version ?? null,
        nbrOfCachedModules,
        nbrOfRebuiltModules,
      };

      await sendBuildData(buildStats);
    });
  }
}
