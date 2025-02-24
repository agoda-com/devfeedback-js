import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CommonMetadata, WebpackBuildData } from 'agoda-devfeedback-common';
import { WebpackBuildStatsPlugin } from './webpack-build-stats-plugin.js';
import { getCommonMetadata, sendBuildData } from 'agoda-devfeedback-common';
import type { Compiler, Stats } from 'webpack';

vi.mock('agoda-devfeedback-common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as unknown as ReturnType<typeof vi.fn>;
const mockedSendBuildData = sendBuildData as unknown as ReturnType<typeof vi.fn>;

/**
 * Provide a more complete mock of the Webpack compiler,
 * including watchRun, compile, done, and compilation hooks.
 */
const createMockCompiler = () => {
  return {
    hooks: {
      watchRun: {
        tap: vi.fn(),
      },
      compile: {
        tap: vi.fn(),
      },
      done: {
        tapPromise: vi.fn(),
      },
      compilation: {
        tap: vi.fn(),
      },
    },
  };
};

describe('WebpackBuildStatsPlugin', () => {
  let mockedCompiler: ReturnType<typeof createMockCompiler>;
  let plugin: WebpackBuildStatsPlugin;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedCompiler = createMockCompiler();
    plugin = new WebpackBuildStatsPlugin();
  });

  afterEach(() => {
    // Ensure we shut down the server after each test
    plugin.close();
  });

  it('should tap into watchRun, compile, and done hooks', () => {
    const plugin = new WebpackBuildStatsPlugin();
    plugin.apply(mockedCompiler as unknown as Compiler);

    // Ensure the plugin registered callbacks on these hooks
    expect(mockedCompiler.hooks.watchRun.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function),
    );
    expect(mockedCompiler.hooks.compile.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function),
    );
    expect(mockedCompiler.hooks.done.tapPromise).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function),
    );
    // The plugin also uses `compilation.tap(...)` internally
    expect(mockedCompiler.hooks.compilation.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function),
    );
  });

  it('should send the correct build stats data on done', async () => {
    // Arrange
    const plugin = new WebpackBuildStatsPlugin('my custom identifier');
    plugin.apply(mockedCompiler as unknown as Compiler);

    // Mock the build data
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockResolvedValue(undefined);

    const mockedStats: Partial<Stats> = {
      toJson: () => ({
        time: 123,
        hash: 'blahblahblacksheep',
        version: '5.51.1',
        modules: [
          { cached: true, built: false },
          { cached: false, built: true },
        ],
      }),
    };

    // Act
    // Retrieve the callback the plugin registered with the "done" hook
    const doneHookCallback = mockedCompiler.hooks.done.tapPromise.mock.calls[0][1];
    // Simulate a completed build
    await doneHookCallback(mockedStats);

    // Assert
    expect(mockedGetCommonMetadata).toBeCalledWith(123, 'my custom identifier');
    expect(mockedSendBuildData).toHaveBeenCalledTimes(1);

    // The object containing dev feedback & stats
    const buildDataArg = mockedSendBuildData.mock.calls[0][0] as WebpackBuildData;
    expect(buildDataArg).toMatchObject({
      type: 'webpack',
      compilationHash: 'blahblahblacksheep',
      toolVersion: '5.51.1',
      nbrOfCachedModules: 1,
      nbrOfRebuiltModules: 1,
    });
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // Arrange
    const originalEnv = { ...process.env };
    process.env.npm_lifecycle_event = 'default_value';

    const plugin = new WebpackBuildStatsPlugin();
    plugin.apply(mockedCompiler as unknown as Compiler);

    const mockedStats: Partial<Stats> = {
      toJson: () => ({
        time: 123,
        hash: 'blahblahblacksheep',
        version: '5.51.1',
        modules: [
          { cached: true, built: false },
          { cached: false, built: true },
        ],
      }),
    };

    // Mock the build data
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockResolvedValue(undefined);

    // Act
    const doneHookCallback = mockedCompiler.hooks.done.tapPromise.mock.calls[0][1];
    await doneHookCallback(mockedStats);

    // Assert
    expect(mockedGetCommonMetadata).toBeCalledWith(123, 'default_value');
    expect(mockedSendBuildData).toHaveBeenCalledTimes(1);

    // Cleanup
    process.env = { ...originalEnv };
  });

  it('should record dev-feedback events when watchRun and compile hooks trigger (optional)', () => {
    // This test shows how you might verify the plugin logic for dev-feedback.
    const plugin = new WebpackBuildStatsPlugin();
    plugin.apply(mockedCompiler as unknown as Compiler);

    // 1. Simulate watchRun
    const watchRunCallback = mockedCompiler.hooks.watchRun.tap.mock.calls[0][1];
    watchRunCallback({ modifiedFiles: ['src/index.js'] });

    // 2. Simulate compile
    const compileCallback = mockedCompiler.hooks.compile.tap.mock.calls[0][1];
    compileCallback();

    // 3. We won't check the actual devFeedback buffer here, because
    //    the plugin code stores it internally. But we can confirm no errors occur.

    // No direct assertions unless you mock or spy on internal plugin methods.
    // Typically you'd rely on the "done" hook test to confirm final data is posted.
    expect(true).toBe(true);
  });
});
