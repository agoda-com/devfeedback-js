/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RspackBuildStatsPlugin } from './rspack-stats-plugin.js';
import { Compiler, Stats, rspack } from '@rspack/core';
import {
  getCommonMetadata,
  sendBuildData,
  sendCommandData,
} from 'agoda-devfeedback-common';
import type { RspackBuildData } from 'agoda-devfeedback-common';
import { createMockCompilation } from '../utils/test-data-generator';

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
const mockedSendCommandData = vi.mocked(sendCommandData);

class FakeRuntimeModule {
  static STAGE_TRIGGER = 20;
  constructor(
    public name: string,
    public stage?: number,
  ) {}
}

// Create a more realistic mock of the Stats object
const createMockStats = (options: {
  startTime: number;
  endTime: number;
  hash: string;
  modules: Array<{ cached?: boolean; built?: boolean }>;
  compilation?: ReturnType<typeof createMockCompilation>['compilation'];
}): Stats => {
  return {
    compilation: options.compilation,
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
    thisCompilation: {
      tap: vi.fn(),
    },
    compile: {
      tap: vi.fn(),
    },
    watchRun: {
      tap: vi.fn(),
      tapPromise: vi.fn(),
    },
    failed: {
      tap: vi.fn(),
    },
    shutdown: {
      tap: vi.fn(),
    },
    // Add other hooks as needed
  };

  const mockRspack = {
    version: '1.0.0',
    RuntimeModule: FakeRuntimeModule,
  } as unknown as Partial<typeof rspack>;

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

  it.each([
    ['a string', 'my-build'],
    ['an options object', { customIdentifier: 'my-build' }],
  ])('should accept the custom identifier as %s', async (_, options) => {
    const identifiedPlugin = new RspackBuildStatsPlugin(options);
    identifiedPlugin.apply(mockCompiler);

    const doneCallback = (mockCompiler.hooks.done.tapAsync as any).mock.calls[0][1];
    const startTime = Date.now();
    await doneCallback(
      createMockStats({
        startTime,
        endTime: startTime + 100,
        hash: 'testhash',
        modules: [],
      }),
      vi.fn(),
    );

    expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'my-build');
  });

  describe('bundle size budget', () => {
    const compilation = createMockCompilation(
      { bootstrap: ['bootstrap.js'] },
      { 'bootstrap.js': 1500 },
    ).compilation;

    const runDone = async (compiler: Compiler) => {
      const doneCallback = (compiler.hooks.done.tapAsync as any).mock.calls[0][1];
      const startTime = Date.now();
      await doneCallback(
        createMockStats({
          startTime,
          endTime: startTime + 100,
          hash: 'h',
          modules: [],
          compilation,
        }),
        vi.fn(),
      );
    };

    it('reports the bootstrap chunk size and limit on a production build', async () => {
      new RspackBuildStatsPlugin({ bootstrapBundleSizeLimitKb: 2 }).apply(mockCompiler);

      await runDone(mockCompiler);

      expect(mockedSendBuildData).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleStats: {
            bootstrapChunkSizeBytes: 1500,
            bootstrapChunkSizeLimitBytes: 2000,
          },
        }),
      );
    });

    it('reports nothing for a watch build', async () => {
      new RspackBuildStatsPlugin({ bootstrapBundleSizeLimitKb: 2 }).apply(mockCompiler);
      (mockCompiler.hooks.watchRun.tap as any).mock.calls[0][1]();

      await runDone(mockCompiler);

      expect(mockedSendBuildData.mock.calls[0][0]).not.toHaveProperty('bundleStats');
    });
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

  describe('client runtime and browser events', () => {
    const tapped = (hook: any) => hook.mock.calls.map((c: any[]) => c[1]);

    /** run every watchRun tap, sync and async, the way the compiler would */
    const watchRun = async (compiler: Compiler) => {
      for (const fn of tapped(compiler.hooks.watchRun.tap)) fn(compiler);
      for (const fn of tapped(compiler.hooks.watchRun.tapPromise)) await fn(compiler);
    };

    /** a compilation whose additionalTreeRuntimeRequirements fires for one chunk */
    const compile = (compiler: Compiler) => {
      const addRuntimeModule = vi.fn();
      const runtimeTap = vi.fn();
      const compilation = {
        addRuntimeModule,
        hooks: { additionalTreeRuntimeRequirements: { tap: runtimeTap } },
      };
      for (const fn of tapped(compiler.hooks.thisCompilation.tap)) fn(compilation);
      for (const fn of runtimeTap.mock.calls.map((c) => c[1])) fn({ name: 'main' });
      return addRuntimeModule;
    };

    const message = (msg: unknown) =>
      (plugin as any).handleIncomingWebSocketMessage(
        Buffer.from(typeof msg === 'string' ? msg : JSON.stringify(msg)),
      );

    const done = async (compiler: Compiler, hash: string) => {
      const doneCallback = (compiler.hooks.done.tapAsync as any).mock.calls[0][1];
      const now = Date.now();
      await doneCallback(
        createMockStats({ startTime: now, endTime: now + 10, hash, modules: [] }),
        vi.fn(),
      );
    };

    it('injects the client runtime module in watch mode', async () => {
      (mockCompiler as any).watchMode = true;
      plugin.apply(mockCompiler);
      await watchRun(mockCompiler);

      const addRuntimeModule = compile(mockCompiler);

      expect(addRuntimeModule).toHaveBeenCalledTimes(1);
      const runtimeModule = addRuntimeModule.mock.calls[0][1];
      expect(runtimeModule).toBeInstanceOf(FakeRuntimeModule);
      expect(runtimeModule.stage).toBe(FakeRuntimeModule.STAGE_TRIGGER);
      const source: string = runtimeModule.generate();
      expect(source).toContain("typeof window === 'undefined'");
      expect(source).toContain("'ws://' + location.hostname + ':");
      expect(source).not.toContain('localhost');
    });

    it('injects nothing when not watching', async () => {
      (mockCompiler as any).watchMode = false;
      plugin.apply(mockCompiler);
      await watchRun(mockCompiler);

      expect(compile(mockCompiler)).not.toHaveBeenCalled();
    });

    it('sends exactly one clientready command event per process', async () => {
      plugin.apply(mockCompiler);
      await watchRun(mockCompiler);

      const ready = {
        type: 'clientReady',
        elapsedMs: 900,
        domContentLoaded: 120,
        firstContentfulPaint: 300,
      };
      message(ready);
      message(ready); // a reload
      message(ready); // a second tab

      const clientReady = mockedSendCommandData.mock.calls.filter(
        ([event]) => event.phase === 'clientready',
      );
      expect(clientReady).toHaveLength(1);
      expect(clientReady[0][0]).toEqual(
        expect.objectContaining({
          type: 'command',
          phase: 'clientready',
          command: 'rspack watch',
          exitCode: 0,
          success: true,
          domContentLoadedMs: 120,
          firstContentfulPaintMs: 300,
        }),
      );
    });

    it('ignores clientReady outside watch mode', () => {
      plugin.apply(mockCompiler);
      message({ type: 'clientReady', elapsedMs: 1 });
      expect(mockedSendCommandData).not.toHaveBeenCalled();
    });

    it('sends one rspackhmr event per rebuild, timed from that rebuild', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        plugin.apply(mockCompiler);
        await watchRun(mockCompiler); // initial compile
        await done(mockCompiler, 'initialhash');

        message({ type: 'hmrApplied' }); // nothing to hot-apply yet
        expect(mockedSendBuildData).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'rspackhmr' }),
        );

        await watchRun(mockCompiler); // the edit
        const rebuildStart = Date.now();
        await done(mockCompiler, 'rebuildhash');
        vi.setSystemTime(rebuildStart + 250);
        message({ type: 'hmrApplied' });
        message({ type: 'hmrApplied' }); // another tab, same rebuild

        const hmr = mockedSendBuildData.mock.calls.filter(
          ([event]) => event.type === 'rspackhmr',
        );
        expect(hmr).toHaveLength(1);
        expect(hmr[0][0]).toEqual(
          expect.objectContaining({
            type: 'rspackhmr',
            compilationHash: 'rebuildhash',
            toolVersion: '1.0.0',
          }),
        );
        expect(hmr[0][0]).not.toHaveProperty('devFeedback');
        expect(mockedGetCommonMetadata).toHaveBeenLastCalledWith(250, 'test');
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['invalid JSON', '{not json'],
      ['null', 'null'],
      ['a bare string', '"hmrApplied"'],
      ['an unknown type', { type: 'domUpdated', elapsedMs: 5 }],
      ['no type', { elapsedMs: 5 }],
    ])('ignores a malformed message: %s', async (_name, msg) => {
      plugin.apply(mockCompiler);
      await watchRun(mockCompiler);
      await watchRun(mockCompiler);
      mockedSendBuildData.mockClear();

      expect(() => message(msg)).not.toThrow();
      expect(mockedSendBuildData).not.toHaveBeenCalled();
      expect(mockedSendCommandData).not.toHaveBeenCalled();
    });
  });
});
