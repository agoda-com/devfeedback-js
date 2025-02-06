/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RspackBuildStatsPlugin } from './rspack-stats-plugin.js';
import { Compiler, Stats, rspack } from '@rspack/core';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import type { RspackBuildData } from 'agoda-devfeedback-common';

vi.mock('agoda-devfeedback-common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
}));

const mockedGetCommonMetadata = vi.mocked(getCommonMetadata);
const mockedSendBuildData = vi.mocked(sendBuildData);

// Create a more realistic mock of the Stats object
const createMockStats = (options: {
  startTime: number;
  endTime: number;
  hash: string;
  modules: Array<{ cached?: boolean; built?: boolean }>;
}): Stats => {
  return {
    startTime: options.startTime,
    endTime: options.endTime,
    hash: options.hash,
    toJson: () => ({
      modules: options.modules,
      // Add other properties that your plugin might use
    }),
  } as unknown as Stats;
};

// Create a mock Compiler
const createMockCompiler = (): Compiler => {
  const mockHooks = {
    done: {
      tap: vi.fn(),
      tapAsync: vi.fn(),
      tapPromise: vi.fn(),
    },
    compilation: {
      tap: vi.fn(),
    },
    compile: {
      tap: vi.fn(),
    },
    watchRun: {
      tap: vi.fn(),
    },
    failed: {
      tap: vi.fn(),
    },
    shutdown: {
      tap: vi.fn(),
    },
    // Add other hooks as needed
  };

  const mockRspack: Partial<typeof rspack> = {
    version: '1.0.0',
  };

  return {
    hooks: mockHooks,
    rspack: mockRspack as typeof rspack,
  } as unknown as Compiler;
};

describe('RspackBuildStatsPlugin', () => {
  let plugin: RspackBuildStatsPlugin;
  let mockCompiler: Compiler;

  beforeEach(() => {
    vi.resetAllMocks();
    plugin = new RspackBuildStatsPlugin({ customIdentifier: 'test' });
    mockCompiler = createMockCompiler();
  });

  it('should send the correct data - happy path', async () => {
    // Apply plugin
    plugin.apply(mockCompiler);

    // Simulate done hook
    const doneCallback = (mockCompiler.hooks.done.tapAsync as any).mock.calls[0][1];
    const startTime = Date.now();
    const endTime = startTime + 100; // 100ms build time
    const mockStats = createMockStats({
      startTime: startTime,
      endTime: endTime,
      hash: 'testhash',
      modules: [
        { cached: true, built: false },
        { cached: false, built: true },
        { cached: false, built: true },
      ],
    });

    await doneCallback(mockStats, vi.fn());

    const expected: Partial<RspackBuildData> = {
      type: 'rspack',
      compilationHash: 'testhash',
      toolVersion: '1.0.0',
      nbrOfCachedModules: 1,
      nbrOfRebuiltModules: 2,
    };

    expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'test');
    expect(mockedSendBuildData).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // Mock process.env
    const originalEnv = process.env;
    process.env = { ...originalEnv, npm_lifecycle_event: 'default_value' };

    // Create plugin without custom identifier
    const defaultPlugin = new RspackBuildStatsPlugin();
    defaultPlugin.apply(mockCompiler);

    // Simulate done hook
    const doneCallback = (mockCompiler.hooks.done.tapAsync as any).mock.calls[0][1];
    const startTime = Date.now();
    const endTime = startTime + 100; // 100ms build time
    const mockStats = createMockStats({
      startTime: startTime,
      endTime: endTime,
      hash: 'testhash',
      modules: [{ cached: true }, { built: true }],
    });

    await doneCallback(mockStats, vi.fn());

    expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'default_value');

    // Restore process.env
    process.env = originalEnv;
  });
});
