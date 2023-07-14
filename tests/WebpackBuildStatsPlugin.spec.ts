import type { CommonBuildData, WebpackBuildData } from '../src/types';
import { WebpackBuildStatsPlugin } from '../src/WebpackBuildStatsPlugin';
import { getCommonBuildData, sendBuildData } from '../src/common';
import type { Compiler } from 'webpack';

jest.mock('../src/common', () => ({
  getCommonBuildData: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonBuildData = getCommonBuildData as jest.MockedFunction<
  typeof getCommonBuildData
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

const mockedCompiler = {
  hooks: {
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
  } as WebpackBuildData;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should send the correct data', async () => {
    // mock common utils
    mockedGetCommonBuildData.mockReturnValue({} as CommonBuildData);
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

    const plugin = new WebpackBuildStatsPlugin('my custom identifier');
    plugin.apply(mockedCompiler as unknown as Compiler);

    const callback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
    await callback(mockedStats as unknown as import('webpack').Stats);

    expect(mockedGetCommonBuildData).toBeCalledWith(123, 'my custom identifier');
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

    // mock process object
    global.process = {
      env: {
        npm_lifecycle_event: 'default_value',
      },
    } as unknown as typeof process;

    const plugin = new WebpackBuildStatsPlugin();
    plugin.apply(mockedCompiler as unknown as Compiler);

    const callback = mockedCompiler.hooks.done.tap.mock.calls[0][1];
    await callback(mockedStats as unknown as import('webpack').Stats);

    expect(mockedGetCommonBuildData).toBeCalledWith(123, 'default_value');
  });
});
