import { describe, it, expect, vi } from 'vitest';
import { getBootstrapChunkSizeBytes, getBundleStats } from './bootstrap-chunk-size';
import { createMockCompilation } from '../utils/test-data-generator';

vi.mock('agoda-devfeedback-common', () => ({
  debugWarn: vi.fn(),
}));

describe('getBootstrapChunkSizeBytes', () => {
  it('sums the JavaScript files of the chunk named bootstrap', () => {
    const stats = createMockCompilation(
      {
        bootstrap: ['bootstrap.abc.js', 'bootstrap.abc.css', 'bootstrap.abc.mjs'],
        main: ['main.js'],
      },
      {
        'bootstrap.abc.js': 1000,
        'bootstrap.abc.css': 500,
        'bootstrap.abc.mjs': 20,
        'main.js': 9000,
      },
    );

    expect(getBootstrapChunkSizeBytes([stats])).toBe(1020);
  });

  it('looks through every compilation of a multi-compiler build', () => {
    const client = createMockCompilation(
      { bootstrap: ['bootstrap.js'] },
      { 'bootstrap.js': 42 },
    );
    const server = createMockCompilation({ main: ['server.js'] }, { 'server.js': 1 });

    expect(getBootstrapChunkSizeBytes([server, client])).toBe(42);
  });

  it('is undefined when there is no bootstrap chunk', () => {
    const stats = createMockCompilation({ main: ['main.js'] }, { 'main.js': 9000 });

    expect(getBootstrapChunkSizeBytes([stats])).toBeUndefined();
  });

  it('never throws', () => {
    expect(getBootstrapChunkSizeBytes([{} as never])).toBeUndefined();
  });
});

describe('getBundleStats', () => {
  it('reports the limit in bytes, like the Vite plugin', () => {
    const stats = createMockCompilation(
      { bootstrap: ['bootstrap.js'] },
      { 'bootstrap.js': 1500 },
    );

    expect(getBundleStats([stats], 2)).toEqual({
      bootstrapChunkSizeBytes: 1500,
      bootstrapChunkSizeLimitBytes: 2000,
    });
  });

  it('leaves the limit out when none is configured', () => {
    expect(getBundleStats([], undefined)).toEqual({
      bootstrapChunkSizeBytes: undefined,
      bootstrapChunkSizeLimitBytes: undefined,
    });
  });
});
