import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { EventEmitter } from 'events';
import path from 'node:path';
import { statSync } from 'node:fs';
import type { ResolvedConfig, ViteDevServer } from 'vite';

vi.mock('node:fs', () => ({
  statSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

import { viteBuildStatsPlugin } from './vite-build-stats-plugin';
import type { CommonMetadata, ViteBuildData } from 'agoda-devfeedback-common';
import {
  getCommonMetadata,
  sendBuildData,
  sendCommandData,
  flushSpool,
  onAbort,
} from 'agoda-devfeedback-common';
import { generateViteOutputBundleData } from '../utils/test-data-generator.js';

// Mock common dependencies
vi.mock('agoda-devfeedback-common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
  sendCommandData: vi.fn(),
  flushSpool: vi.fn(),
  onAbort: vi.fn(),
  debugError: vi.fn(),
}));

const mockedGetCommonMetadata = vi.mocked(getCommonMetadata);
const mockedSendBuildData = vi.mocked(sendBuildData);
const mockedSendCommandData = vi.mocked(sendCommandData);
const mockedFlushSpool = vi.mocked(flushSpool);
const mockedOnAbort = vi.mocked(onAbort);

// Mock request/response classes for HMR testing
class MockRequest extends EventEmitter {
  url: string;
  method: string;

  constructor(url: string, method = 'POST') {
    super();
    this.url = url;
    this.method = method;
  }
}

class MockResponse {
  writeHead = vi.fn();
  end = vi.fn();
}

// Add type for middleware handler
type MiddlewareHandler = (req: MockRequest, res: MockResponse, next: () => void) => void;

describe('viteBuildStatsPlugin', () => {
  const bootstrapChunkSizeLimitKb = 2_000;
  let timeCounter: number;
  let plugin: ReturnType<typeof viteBuildStatsPlugin>;
  let mockServer: Partial<ViteDevServer>;
  let mockWatcher: EventEmitter;

  beforeEach(() => {
    timeCounter = 1000;
    vi.resetAllMocks();

    // Setup mocks for HMR testing
    mockWatcher = new EventEmitter();
    mockServer = {
      watcher: mockWatcher,
      middlewares: {
        use: vi.fn(),
      },
    };

    // Create plugin instance
    plugin = viteBuildStatsPlugin('my custom identifier', bootstrapChunkSizeLimitKb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('build stats functionality', () => {
    const expected: ViteBuildData = {
      type: 'vite',
      viteVersion: '1.2.3',
      bundleStats: {
        bootstrapChunkSizeBytes: 430,
        bootstrapChunkSizeLimitBytes: bootstrapChunkSizeLimitKb * 1000,
      },
      file: null, // Add missing file property
      transformTimeMs: 100,
    } as ViteBuildData;

    // buildStart at 0, buildEnd at 100, closeBundle at 150: the reported build time is
    // the full span, and the transform phase alone rides along as detail.
    const mockBuildClock = () =>
      vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(150);

    it('should send the correct build data - happy path', async () => {
      mockBuildClock();
      mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
      mockedSendBuildData.mockResolvedValue();
      const bundle = generateViteOutputBundleData(true);

      (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
      // Fix any type by using proper type casting
      (
        plugin.generateBundle as (
          opts: NormalizedOutputOptions,
          bundle: OutputBundle,
        ) => void
      )({} as NormalizedOutputOptions, bundle);
      (plugin.buildEnd as () => void)();
      await (plugin.closeBundle as () => Promise<void>)();

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(150, 'my custom identifier');
      expect(mockedSendBuildData).toHaveBeenCalledWith(expected);
    });

    it('should send the correct data - bootstrap chunk not found', async () => {
      // mock measurement
      mockBuildClock();

      // mock common utils
      mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
      mockedSendBuildData.mockResolvedValue();
      const bundle = generateViteOutputBundleData(false);

      const plugin = viteBuildStatsPlugin('my custom identifier');
      (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
      (
        plugin.generateBundle as (
          opts: NormalizedOutputOptions,
          bundle: OutputBundle,
        ) => void
      )({} as NormalizedOutputOptions, bundle);
      (plugin.buildEnd as () => void)();
      await (plugin.closeBundle as () => Promise<void>)();

      const caseSpecificExpected = {
        ...expected,
        bundleStats: {
          bootstrapChunkSizeBytes: undefined, // Fix property name
          bootstrapChunkSizeLimitBytes: undefined,
        },
        file: null, // Add missing file property
      };

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(150, 'my custom identifier');
      expect(mockedSendBuildData).toHaveBeenCalledWith(caseSpecificExpected);
    });

    it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
      // mock measurement
      mockBuildClock();

      // mock common utils
      mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
      mockedSendBuildData.mockResolvedValue();
      const bundle = generateViteOutputBundleData(true);

      // mock process object
      vi.stubGlobal('process', {
        env: {
          npm_lifecycle_event: 'default_value',
        },
      });

      const plugin = viteBuildStatsPlugin();
      (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
      (
        plugin.generateBundle as (
          opts: NormalizedOutputOptions,
          bundle: OutputBundle,
        ) => void
      )({} as NormalizedOutputOptions, bundle);
      (plugin.buildEnd as () => void)();
      await (plugin.closeBundle as () => Promise<void>)();

      const caseSpecificExpected = {
        ...expected,
        bundleStats: {
          bootstrapChunkSizeBytes: 430,
          bootstrapChunkSizeLimitBytes: undefined,
        },
        file: null, // Add missing file property
      };

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(150, 'default_value');
      expect(mockedSendBuildData).toHaveBeenCalledWith(caseSpecificExpected);
    });
  });

  describe('HMR timing functionality', () => {
    beforeEach(() => {
      // Mock process.cwd globally for all HMR tests
      vi.stubGlobal('process', {
        ...process,
        env: process.env,
        cwd: () => '/test-root',
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should register file watcher on server configure', () => {
      const watcherSpy = vi.spyOn(mockWatcher, 'on');
      plugin.configureServer?.(mockServer as ViteDevServer);
      expect(watcherSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should handle file changes and track timing', async () => {
      plugin.configureServer?.(mockServer as ViteDevServer);

      vi.spyOn(Date, 'now').mockImplementation(() => timeCounter);
      // Remove individual process.cwd mock since it's now handled globally

      const testFile = path.join('/test-root', 'path/to/file.js');
      mockWatcher.emit('change', testFile);

      const changeMap = plugin._TEST_getChangeMap?.();
      expect(changeMap).toBeDefined();

      const changes = Array.from(changeMap!.values());
      expect(changes).toHaveLength(1);
      expect(changes[0].changeDetectedAt).toBe(timeCounter);

      const expectedPath = 'path/to/file.js';
      const normalizedPath = changes[0].file.replace(/\\/g, '/');
      expect(normalizedPath).toBe(expectedPath);
    });

    it('should handle middleware requests for timing data', async () => {
      plugin.configureServer?.(mockServer as ViteDevServer);

      // Use the same path format as what would come from Vite
      const testFile = '/test-root/src/test.js';
      timeCounter = 1000;

      // Emit change event with full path
      mockWatcher.emit('change', testFile);

      // Advance time for client timestamp
      timeCounter = 2000;

      const req = new MockRequest('/__vite_timing_hmr_complete');
      const res = new MockResponse();
      const next = vi.fn();

      const responsePromise = new Promise<void>((resolve) => {
        res.end = vi.fn((...args) => {
          vi.fn().apply(res, args);
          resolve();
        });
      });

      // Fix any type by using proper typing for middleware handler
      const middlewareHandler = (
        mockServer.middlewares?.use as jest.Mock<void, [MiddlewareHandler]>
      ).mock.calls[0][0] as MiddlewareHandler;

      middlewareHandler(req, res, next);

      // Send normalized path in client request (as Vite would do)
      req.emit(
        'data',
        JSON.stringify({
          file: 'src/test.js', // This should match the normalized path
          clientTimestamp: timeCounter,
        }),
      );
      req.emit('end');

      await responsePromise;

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
      });

      const responseData = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseData.success).toBe(true);

      // Verify the change was processed and removed from the map
      const changeMap = plugin._TEST_getChangeMap?.();
      expect(Array.from(changeMap!.values())).toHaveLength(0);
    });

    it('should inject HMR module in development mode', () => {
      const html = '<html><head></head><body></body></html>';
      const result = plugin.transformIndexHtml?.(html, { command: 'serve' });
      expect(result).toContain('/@vite-timing/hmr');
    });

    it('should not inject scripts in production mode', () => {
      const html = '<html><head></head><body></body></html>';
      const result = plugin.transformIndexHtml?.(html, { command: 'build' });
      expect(result).toBe(html);
      expect(result).not.toContain('/@vite-timing/hmr');
    });

    it('should provide virtual HMR module', () => {
      const id = '/@vite-timing/hmr';
      const resolved = plugin.resolveId?.(id);
      expect(resolved).toBe(id);

      const content = plugin.load?.(id);
      expect(content).toContain('createHotContext');
      expect(content).toContain('vite:afterUpdate');
    });

    it('should ask the client to report when the app is usable', () => {
      const content = plugin.load?.('/@vite-timing/hmr');
      expect(content).toContain('/__vite_timing_ready');
      expect(content).toContain('first-contentful-paint');
    });
  });

  describe('dev server lifecycle', () => {
    let httpServer: EventEmitter;

    beforeEach(() => {
      httpServer = new EventEmitter();
      mockServer = {
        watcher: mockWatcher,
        httpServer: httpServer as unknown as ViteDevServer['httpServer'],
        middlewares: { use: vi.fn() },
      } as Partial<ViteDevServer>;
      mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    });

    it('reports time to a usable dev server once it is listening', () => {
      plugin.configureServer?.(mockServer as ViteDevServer);
      expect(mockedSendCommandData).not.toHaveBeenCalled();

      httpServer.emit('listening');

      expect(mockedSendCommandData).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command',
          phase: 'devserver',
          command: 'vite dev',
          exitCode: 0,
          success: true,
        }),
      );
    });

    it('delivers spooled install and abort events once the server is up', () => {
      plugin.configureServer?.(mockServer as ViteDevServer);
      httpServer.emit('listening');
      expect(mockedFlushSpool).toHaveBeenCalled();
    });

    it('registers an abort handler that records a given-up dev server', () => {
      plugin.configureServer?.(mockServer as ViteDevServer);

      expect(mockedOnAbort).toHaveBeenCalled();
      const build = mockedOnAbort.mock.calls[0]?.[0] as (
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

    it('reports client ready exactly once per server run', async () => {
      plugin.configureServer?.(mockServer as ViteDevServer);
      const handler = (
        mockServer.middlewares?.use as jest.Mock<void, [MiddlewareHandler]>
      ).mock.calls[0]?.[0] as MiddlewareHandler;

      const post = async () => {
        const req = new MockRequest('/__vite_timing_ready');
        const res = new MockResponse();
        const done = new Promise<void>((resolve) => {
          res.end = vi.fn(() => resolve());
        });
        handler(req, res, vi.fn());
        req.emit(
          'data',
          JSON.stringify({
            elapsedMs: 1200,
            domContentLoaded: 900,
            firstContentfulPaint: 1000,
          }),
        );
        req.emit('end');
        await done;
      };

      await post();
      await post();

      const clientReady = mockedSendCommandData.mock.calls.filter(
        (call) => (call[0] as { phase?: string }).phase === 'clientready',
      );
      expect(clientReady).toHaveLength(1);
      expect(clientReady[0]?.[0]).toMatchObject({
        domContentLoadedMs: 900,
        firstContentfulPaintMs: 1000,
      });
    });

    // Prebundling is triggered by the first browser request, so it has not run at
    // `listening` — sampling there could only ever report `false` or nothing.
    it('reports prebundling on client ready, not on the dev server event', async () => {
      const mockedStatSync = vi.mocked(statSync);
      mockedStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      (plugin.configResolved as (config: ResolvedConfig) => void)({
        root: '/test-root',
      } as ResolvedConfig);

      plugin.configureServer?.(mockServer as ViteDevServer);
      httpServer.emit('listening');

      const devserver = mockedSendCommandData.mock.calls.find(
        (call) => (call[0] as { phase?: string }).phase === 'devserver',
      );
      expect(devserver?.[0]).not.toHaveProperty('prebundled');

      // prebundling ran while the browser was booting
      mockedStatSync.mockReturnValue({ mtimeMs: 42 } as ReturnType<typeof statSync>);

      const handler = (
        mockServer.middlewares?.use as jest.Mock<void, [MiddlewareHandler]>
      ).mock.calls[0]?.[0] as MiddlewareHandler;
      const req = new MockRequest('/__vite_timing_ready');
      const res = new MockResponse();
      const done = new Promise<void>((resolve) => {
        res.end = vi.fn(() => resolve());
      });
      handler(req, res, vi.fn());
      req.emit('data', JSON.stringify({ elapsedMs: 1200 }));
      req.emit('end');
      await done;

      const clientReady = mockedSendCommandData.mock.calls.find(
        (call) => (call[0] as { phase?: string }).phase === 'clientready',
      );
      expect(clientReady?.[0]).toMatchObject({ prebundled: true });
    });
  });
});
