import { NormalizedOutputOptions, OutputBundle } from "rollup";

import { viteBuildStatsPlugin } from '../src';
import type { CommonMetadata, ViteBuildData } from '../src/types';
import { getCommonMetadata, sendBuildData } from '../src/common';
import { generateViteOutputBundleData } from "./utils/test-data-generator";

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

describe('viteBuildStatsPlugin', () => {
  const bootstrapChunkSizeLimitKb = 2_000;
  const expected: ViteBuildData = {
    type: 'vite',
    viteVersion: '1.2.3',
    bundleStats: {
      bootstrapChunkSizeBytes: 430,
      bootstrapChunkSizeLimitBytes: bootstrapChunkSizeLimitKb * 1000,
    }
  } as ViteBuildData;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should send the correct data - happy path', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());
    const bundle = generateViteOutputBundleData(true);

    const plugin = viteBuildStatsPlugin('my custom identifier', bootstrapChunkSizeLimitKb);
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.generateBundle as (opts: NormalizedOutputOptions, bundle: OutputBundle) => void)({} as NormalizedOutputOptions, bundle);
    (plugin.buildEnd as () => void)();
    await (plugin.closeBundle as () => Promise<void>)();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'my custom identifier');
    expect(mockedSendBuildData).toBeCalledWith(expected);
  });

  it('should send the correct data - bootstrap chunk not found', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());
    const bundle = generateViteOutputBundleData(false);

    const plugin = viteBuildStatsPlugin('my custom identifier');
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.generateBundle as (opts: NormalizedOutputOptions, bundle: OutputBundle) => void)({} as NormalizedOutputOptions, bundle);
    (plugin.buildEnd as () => void)();
    await (plugin.closeBundle as () => Promise<void>)();

    const caseSpecificExpected = {
      ...expected,
      bundleStats: {
        generateOutputBundleData: undefined,
        bootstrapChunkSizeLimitBytes: undefined
      }
    }

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'my custom identifier');
    expect(mockedSendBuildData).toBeCalledWith(caseSpecificExpected);
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());
    const bundle = generateViteOutputBundleData(true);

    // mock process object
    global.process = {
      env: {
        npm_lifecycle_event: 'default_value',
      },
    } as unknown as typeof process;

    const plugin = viteBuildStatsPlugin();
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.generateBundle as (opts: NormalizedOutputOptions, bundle: OutputBundle) => void)({} as NormalizedOutputOptions, bundle);
    (plugin.buildEnd as () => void)();
    await (plugin.closeBundle as () => Promise<void>)();

    const caseSpecificExpected = {
      ...expected,
      bundleStats: { ...expected.bundleStats, bootstrapChunkSizeLimitBytes: undefined }
    }

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'default_value');
    expect(mockedSendBuildData).toBeCalledWith(caseSpecificExpected);
  });
});
