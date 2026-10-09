/** A Stats-shaped object whose compilation has the given named chunks and asset sizes. */
export const createMockCompilation = (
  chunks: Record<string, string[]>,
  assetSizes: Record<string, number>,
) => ({
  compilation: {
    namedChunks: new Map(
      Object.entries(chunks).map(([name, files]) => [name, { files: new Set(files) }]),
    ),
    getAsset: (file: string) =>
      file in assetSizes ? { source: { size: () => assetSizes[file] } } : undefined,
  },
});
