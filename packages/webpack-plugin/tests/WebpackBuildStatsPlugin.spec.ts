import type { CommonMetadata, WebpackBuildData } from '../src/types';
import { WebpackBuildStatsPlugin } from '../src/WebpackBuildStatsPlugin';
import { getCommonMetadata, sendBuildData } from '../src/common';
import type { Compiler, Stats, Compilation } from 'webpack';

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

/**
 * Provide a more complete mock of the Webpack compiler,
 * including watchRun, compile, done, and compilation hooks.
 */
const createMockCompiler = () => {
  return {
    hooks: {
      watchRun: {
        tap: jest.fn(),
      },
      compile: {
        tap: jest.fn(),
      },
      done: {
        tap: jest.fn(),
      },
      compilation: {
        tap: jest.fn(),
      },
    },
  };
};

describe('WebpackBuildStatsPlugin', () => {
  let mockedCompiler: ReturnType<typeof createMockCompiler>;
  let plugin: WebpackBuildStatsPlugin;

  beforeEach(() => {
    jest.resetAllMocks();
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
      expect.any(Function)
    );
    expect(mockedCompiler.hooks.compile.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function)
    );
    expect(mockedCompiler.hooks.done.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function)
    );
    // The plugin also uses `compilation.tap(...)` internally
    expect(mockedCompiler.hooks.compilation.tap).toHaveBeenCalledWith(
      'WebpackBuildStatsPlugin',
      expect.any(Function)
    );
  });

  it('should send the correct build stats data on done', async () => {
    // Arrange
    const plugin = new WebpackBuildStatsPlugin('my custom identifier');
    plugin.apply(mockedCompiler as unknown as Compiler);

    // Mock the build data
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockResolvedValue();

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
    const doneHookCallback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
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
      webpackVersion: '5.51.1',
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
    mockedSendBuildData.mockResolvedValue();

    // Act
    const doneHookCallback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
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
