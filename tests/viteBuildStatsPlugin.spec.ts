import type { CommonMetadata, ViteBuildData } from '../src/types';
import { viteBuildStatsPlugin } from '../src/viteBuildStatsPlugin';
import { getCommonMetadata, sendBuildData } from '../src/common';
import { BigIntStats, PathLike, Stats, promises as fs } from 'fs';
import path from 'path';

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
  },
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;
const mockedFsStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

describe('viteBuildStatsPlugin', () => {
  const expected: ViteBuildData = {
    type: 'vite',
    viteVersion: '1.2.3',
    bundleFiles: {
      'file1.js': 1000,
      'file2.js': 2000,
    },
    bundleSize: 3000,
  } as unknown as ViteBuildData;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should send the correct data', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());

    // mock fs.stat
    mockedFsStat.mockImplementation((path: PathLike) => {
      if (path.toString().endsWith('file1.js')) {
        return Promise.resolve({ size: 1000 } as Stats);
      } else if (path.toString().endsWith('file2.js')) {
        return Promise.resolve({ size: 2000 } as Stats);
      } else {
        return Promise.reject(new Error('File not found'));
      }
    });

    const plugin = viteBuildStatsPlugin('my custom identifier');
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.buildEnd as () => void)();
    await (plugin.writeBundle as any)({ dir: 'dist' }, { 'file1.js': {}, 'file2.js': {} });
    await (plugin.closeBundle as () => Promise<void>)();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'my custom identifier');
    expect(mockedSendBuildData).toBeCalledWith(expect.objectContaining(expected));
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());

    // mock process object
    global.process = {
      env: {
        npm_lifecycle_event: 'default_value',
      },
    } as unknown as typeof process;

    // mock fs.stat
    mockedFsStat.mockImplementation((path: PathLike) => {
      if (path.toString().endsWith('file1.js')) {
        return Promise.resolve({ size: 1000 } as Stats);
      } else if (path.toString().endsWith('file2.js')) {
        return Promise.resolve({ size: 2000 } as Stats);
      } else {
        return Promise.reject(new Error('File not found'));
      }
    });

    const plugin = viteBuildStatsPlugin();
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.buildEnd as () => void)();
    await (plugin.writeBundle as any)({ dir: 'dist' }, { 'file1.js': {}, 'file2.js': {} });
    await (plugin.closeBundle as () => Promise<void>)();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'default_value');
    expect(mockedSendBuildData).toBeCalledWith(expect.objectContaining(expected));
  });
});
