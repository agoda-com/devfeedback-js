/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RsbuildBuildStatsPlugin } from './rsbuild-stats-plugin.js';
import { RsbuildPluginAPI } from '@rsbuild/core';
import { Rspack } from '@rsbuild/core';
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
}): Rspack.Stats => {
  return {
    startTime: options.startTime,
    endTime: options.endTime,
    hash: options.hash,
    toJson: () => ({
      modules: options.modules,
      // Add other properties that your plugin might use
    }),
  } as unknown as Rspack.Stats;
};

// Create a mock RsbuildPluginAPI
const createMockApi = (): Partial<RsbuildPluginAPI> => {
  return {
    onBeforeBuild: vi.fn(),
    onAfterBuild: vi.fn(),
    onCloseBuild: vi.fn(),
    onBeforeStartDevServer: vi.fn(),
    onDevCompileDone: vi.fn(),
    context: {
      version: '1.0.0',
      rootPath: '/mock/root',
      distPath: '/mock/dist',
      cachePath: '/mock/cache',
      bundlerType: 'rspack',
    },
  };
};

describe('RsbuildBuildStatsPlugin', () => {
  let mockApi: Partial<RsbuildPluginAPI>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockApi = createMockApi();
  });

  it('should send the correct data - happy path', async () => {
    // Setup plugin
    await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);

    // Simulate onAfterBuild hook
    const onAfterBuildCallback = (mockApi.onAfterBuild as any).mock.calls[0][0];
    const startTime = Date.now();
    const endTime = startTime + 100; // 100ms build time
    const mockStats = createMockStats({
      startTime,
      endTime,
      hash: 'testhash',
      modules: [
        { cached: true, built: false },
        { cached: false, built: true },
        { cached: false, built: true },
      ],
    });

    await onAfterBuildCallback({ stats: mockStats });

    const expected: Partial<RspackBuildData> = {
      type: 'rsbuild',
      compilationHash: 'testhash',
      toolVersion: '1.0.0',
      nbrOfCachedModules: 1,
      nbrOfRebuiltModules: 2,
    };

    expect(mockedGetCommonMetadata).toHaveBeenCalledWith(
      100,
      process.env.npm_lifecycle_event,
    );
    expect(mockedSendBuildData).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('should use process.env.npm_lifecycle_event as custom identifier', async () => {
    // Mock process.env
    const originalEnv = process.env;
    process.env = { ...originalEnv, npm_lifecycle_event: 'default_value' };

    // Setup plugin
    await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);

    // Simulate onAfterBuild hook
    const onAfterBuildCallback = (mockApi.onAfterBuild as any).mock.calls[0][0];
    const startTime = Date.now();
    const endTime = startTime + 100; // 100ms build time
    const mockStats = createMockStats({
      startTime,
      endTime,
      hash: 'testhash',
      modules: [{ cached: true }, { built: true }],
    });

    await onAfterBuildCallback({ stats: mockStats });

    expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'default_value');

    // Restore process.env
    process.env = originalEnv;
  });
});
