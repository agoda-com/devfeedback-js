/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RsbuildBuildStatsPlugin } from './rsbuild-stats-plugin';
import { RsbuildPluginAPI } from '@rsbuild/core';
import { Rspack } from '@rsbuild/core';
import { WebSocket } from 'ws';
import {
  getCommonMetadata,
  sendBuildData,
  sendCommandData,
  flushSpool,
  onAbort,
} from 'agoda-devfeedback-common';
import type { RspackBuildData } from 'agoda-devfeedback-common';

vi.mock('agoda-devfeedback-common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
  sendCommandData: vi.fn(),
  flushSpool: vi.fn(),
  onAbort: vi.fn(),
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
  debugError: vi.fn(),
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
    onAfterStartDevServer: vi.fn(),
    onDevCompileDone: vi.fn(),
    modifyHTMLTags: vi.fn(),
    context: {
      version: '1.0.0',
      rootPath: '/mock/root',
      distPath: '/mock/dist',
      cachePath: '/mock/cache',
      bundlerType: 'rspack',
    },
  };
};

// The port is only known at runtime, so the only way to reach the plugin's WebSocket
// server is through the script it injects.
const wsPortFromScript = (api: Partial<RsbuildPluginAPI>): number => {
  const params = { headTags: [] as any[] };
  (api.modifyHTMLTags as any).mock.calls[0][0](params);
  const port = /ws:\/\/' \+ location\.hostname \+ ':(\d+)/.exec(
    params.headTags[0]?.children ?? '',
  )?.[1];
  if (!port) throw new Error('client script carries no WebSocket port');
  return Number(port);
};

const connectClient = (port: number): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });

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

  describe('dev server lifecycle', () => {
    it('reports time to a usable dev server', async () => {
      await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);

      (mockApi.onBeforeStartDevServer as any).mock.calls[0][0]();
      await (mockApi.onAfterStartDevServer as any).mock.calls[0][0]();

      expect(vi.mocked(sendCommandData)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command',
          phase: 'devserver',
          command: 'rsbuild dev',
          exitCode: 0,
          success: true,
        }),
      );
      expect(vi.mocked(flushSpool)).toHaveBeenCalled();
    });

    it('records a dev server the developer gave up on', async () => {
      await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);
      // dev only: a production build must not register the handler
      expect(vi.mocked(onAbort)).not.toHaveBeenCalled();
      (mockApi.onBeforeStartDevServer as any).mock.calls[0][0]();

      const build = vi.mocked(onAbort).mock.calls[0]?.[0] as (
        signal: NodeJS.Signals,
      ) => Record<string, unknown>;
      expect(build('SIGINT')).toMatchObject({
        type: 'command',
        phase: 'devserver',
        exitCode: 130,
        success: false,
        signal: 'SIGINT',
      });
    });

    it('reports client ready from dev server start, exactly once per run', async () => {
      await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);
      await new Promise((resolve) => setTimeout(resolve, 50));

      (mockApi.onBeforeStartDevServer as any).mock.calls[0][0]();

      const socket = await connectClient(wsPortFromScript(mockApi));
      const message = JSON.stringify({
        type: 'clientReady',
        elapsedMs: 300,
        domContentLoaded: 250,
        firstContentfulPaint: 280,
      });
      // a page reload sends the same message again; it is not a new dev server start
      socket.send(message);
      socket.send(message);
      await new Promise((resolve) => setTimeout(resolve, 50));
      socket.close();

      const clientReady = vi
        .mocked(sendCommandData)
        .mock.calls.filter((call) => call[0]?.phase === 'clientready');
      expect(clientReady).toHaveLength(1);
      expect(clientReady[0]?.[0]).toMatchObject({
        type: 'command',
        phase: 'clientready',
        command: 'rsbuild dev',
        success: true,
        domContentLoadedMs: 250,
        firstContentfulPaintMs: 280,
      });
      // the browser-relative numbers stay as detail on the next compile's payload
      const onDevCompileDone = (mockApi.onDevCompileDone as any).mock.calls[0][0];
      await onDevCompileDone({
        stats: createMockStats({
          startTime: Date.now(),
          endTime: Date.now() + 10,
          hash: 'devhash',
          modules: [],
        }),
      });
      const sent = mockedSendBuildData.mock.calls.at(-1)?.[0] as RspackBuildData;
      expect(sent.devFeedback).toEqual(
        expect.arrayContaining([
          { type: 'clientReady', elapsedMs: 300 },
          { type: 'domContentLoaded', elapsedMs: 250 },
          { type: 'firstContentfulPaint', elapsedMs: 280 },
        ]),
      );
    });

    it('injects a client script carrying the runtime WebSocket port', async () => {
      await RsbuildBuildStatsPlugin.setup(mockApi as RsbuildPluginAPI);
      // the listen callback is async, so wait a tick for the port to be assigned
      await new Promise((resolve) => setTimeout(resolve, 50));

      const modify = (mockApi.modifyHTMLTags as any).mock.calls[0][0];
      const params = { headTags: [] as any[] };
      modify(params);

      expect(params.headTags).toHaveLength(1);
      expect(params.headTags[0].children).toContain('WebSocket');
    });
  });
});
