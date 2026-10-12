import type { BundleStats } from 'agoda-devfeedback-common';
import { debugWarn } from 'agoda-devfeedback-common';

/** The slice of a Stats object this needs; Rsbuild and Rspack ship separate typings. */
interface StatsWithCompilation {
  compilation: {
    namedChunks: ReadonlyMap<string, { files: ReadonlySet<string> }>;
    getAsset(name: string): { source: { size(): number } } | void;
  };
}

const BOOTSTRAP_CHUNK_NAME = 'bootstrap';

/**
 * Size of the emitted JavaScript for the chunk named `bootstrap`, matching what the
 * Vite plugin measures (the chunk's code, not its CSS or other assets). Reads the
 * compilation directly instead of serializing stats, so it costs nothing measurable.
 */
export function getBootstrapChunkSizeBytes(
  stats: StatsWithCompilation[],
): number | undefined {
  try {
    for (const { compilation } of stats) {
      const chunk = compilation.namedChunks.get(BOOTSTRAP_CHUNK_NAME);
      if (!chunk) continue;
      let size = 0;
      for (const file of chunk.files) {
        if (!/\.[cm]?js$/.test(file)) continue;
        size += compilation.getAsset(file)?.source.size() ?? 0;
      }
      return size;
    }
  } catch (err) {
    debugWarn('[DevFeedback] Failed to measure bootstrap chunk size:', err);
  }
  return undefined;
}

export function getBundleStats(
  stats: StatsWithCompilation[],
  bootstrapBundleSizeLimitKb: number | undefined,
): BundleStats {
  return {
    bootstrapChunkSizeBytes: getBootstrapChunkSizeBytes(stats),
    bootstrapChunkSizeLimitBytes:
      bootstrapBundleSizeLimitKb != null ? bootstrapBundleSizeLimitKb * 1000 : undefined,
  };
}
