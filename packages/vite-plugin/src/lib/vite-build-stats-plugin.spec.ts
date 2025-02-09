import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';
import { EventEmitter } from 'events';
import path from 'path';
import type { ViteDevServer } from 'vite';

import { viteBuildStatsPlugin } from './vite-build-stats-plugin.js';
import type { CommonMetadata, ViteBuildData } from 'agoda-devfeedback-common';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import { generateViteOutputBundleData } from '../utils/test-data-generator.js';

// Mock common dependencies
vi.mock('agoda-devfeedback-common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
}));

const mockedGetCommonMetadata = vi.mocked(getCommonMetadata);
const mockedSendBuildData = vi.mocked(sendBuildData);

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
    } as ViteBuildData;

    it('should send the correct build data - happy path', async () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100);
      mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
      mockedSendBuildData.mockResolvedValue();
      const bundle = generateViteOutputBundleData(true);

      (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
      (plugin.generateBundle as any)({} as NormalizedOutputOptions, bundle);
      (plugin.buildEnd as () => void)();
      await (plugin.closeBundle as () => Promise<void>)();

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'my custom identifier');
      expect(mockedSendBuildData).toHaveBeenCalledWith(expected);
    });

    it('should send the correct data - bootstrap chunk not found', async () => {
      // mock measurement
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100);

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
          generateOutputBundleData: undefined,
          bootstrapChunkSizeLimitBytes: undefined,
        },
      };

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'my custom identifier');
      expect(mockedSendBuildData).toHaveBeenCalledWith(caseSpecificExpected);
    });

    it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
      // mock measurement
      vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100);

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
        bundleStats: { ...expected.bundleStats, bootstrapChunkSizeLimitBytes: undefined },
      };

      expect(mockedGetCommonMetadata).toHaveBeenCalledWith(100, 'default_value');
      expect(mockedSendBuildData).toHaveBeenCalledWith(caseSpecificExpected);
    });
  });

  describe('HMR timing functionality', () => {
    it('should register file watcher on server configure', () => {
      const watcherSpy = vi.spyOn(mockWatcher, 'on');
      plugin.configureServer?.(mockServer as ViteDevServer);
      expect(watcherSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should handle file changes and track timing', async () => {
      plugin.configureServer?.(mockServer as ViteDevServer);

      vi.spyOn(Date, 'now').mockImplementation(() => timeCounter);
      vi.spyOn(process, 'cwd').mockReturnValue('/test-root');

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

      const testFile = 'src/test.js';
      timeCounter = 1000;
      mockWatcher.emit('change', testFile);

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

      const middlewareHandler = (mockServer.middlewares?.use as any).mock.calls[0][0];
      middlewareHandler(req, res, next);

      req.emit(
        'data',
        JSON.stringify({
          file: testFile,
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
  });
});
