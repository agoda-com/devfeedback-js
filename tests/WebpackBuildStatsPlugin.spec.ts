import type { CommonMetadata, WebpackBuildData } from '../src/types';
import { WebpackBuildStatsPlugin } from '../src/WebpackBuildStatsPlugin';
import { getCommonMetadata, sendBuildData } from '../src/common';
import type { Compiler } from 'webpack';

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

const mockedCompiler = {
  hooks: {
    emit: {
      tapAsync: jest.fn(),
    },
    done: {
      tap: jest.fn(),
    },
  },
};

describe('WebpackBuildStatsPlugin', () => {
  const expected: WebpackBuildData = {
    type: 'webpack',
    webpackVersion: '5.51.1',
    compilationHash: 'blahblahblacksheep',
    nbrOfCachedModules: 1,
    nbrOfRebuiltModules: 1,
    bundleFiles: {
      'file1.js': 1000,
      'file2.js': 2000,
    },
    bundleSize: 3000,
  } as unknown as WebpackBuildData;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should send the correct data', async () => {
    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());

    // mock stats
    const mockedStats = {
      toJson: jest.fn().mockReturnValue({
        time: 123,
        hash: 'blahblahblacksheep',
        version: '5.51.1',
        modules: [
          { cached: true, built: false },
          { cached: false, built: true },
        ],
      }),
    };

    // mock compilation
    const mockedCompilation = {
      assets: {
        'file1.js': { size: () => 1000 },
        'file2.js': { size: () => 2000 },
      },
    };

    const plugin = new WebpackBuildStatsPlugin('my custom identifier');
    plugin.apply(mockedCompiler as unknown as Compiler);

    // simulate emit hook
    const emitCallback = mockedCompiler.hooks.emit.tapAsync.mock.calls[0][1];
    await emitCallback(mockedCompilation, () => { });

    // simulate done hook
    const callback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
    await callback(mockedStats as unknown as import('webpack').Stats);

    expect(mockedGetCommonMetadata).toBeCalledWith(123, 'my custom identifier');
    expect(mockedSendBuildData).toBeCalledWith(expect.objectContaining(expected));
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // mock stats
    const mockedStats = {
      toJson: jest.fn().mockReturnValue({
        time: 123,
        hash: 'blahblahblacksheep',
        version: '5.51.1',
        modules: [
          { cached: true, built: false },
          { cached: false, built: true },
        ],
      }),
    };

    // mock compilation
    const mockedCompilation = {
      assets: {
        'file1.js': { size: () => 1000 },
        'file2.js': { size: () => 2000 },
      },
    };

    // mock process object
    global.process = {
      env: {
        npm_lifecycle_event: 'default_value',
      },
    } as unknown as typeof process;

    const plugin = new WebpackBuildStatsPlugin();
    plugin.apply(mockedCompiler as unknown as Compiler);

    // simulate emit hook
    const emitCallback = mockedCompiler.hooks.emit.tapAsync.mock.calls[0][1];
    await emitCallback(mockedCompilation, () => { });

    // simulate done hook
    const callback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
    await callback(mockedStats as unknown as import('webpack').Stats);

    expect(mockedGetCommonMetadata).toBeCalledWith(123, 'default_value');
    expect(mockedSendBuildData).toBeCalledWith(expect.objectContaining({
      ...expected,
      bundleFiles: {
        'file1.js': 1000,
        'file2.js': 2000,
      },
      bundleSize: 3000,
    }));
  });
});
