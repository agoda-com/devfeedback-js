import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NormalizedOutputOptions, OutputBundle } from 'rollup';

import { viteBuildStatsPlugin } from './vite-build-stats-plugin.js';
import type { CommonMetadata, ViteBuildData } from '@agoda-devfeedback/common';
import { getCommonMetadata, sendBuildData } from '@agoda-devfeedback/common';
import { generateViteOutputBundleData } from '../utils/test-data-generator.js';

vi.mock('@agoda-devfeedback/common', () => ({
  getCommonMetadata: vi.fn(),
  sendBuildData: vi.fn(),
}));

const mockedGetCommonMetadata = vi.mocked(getCommonMetadata);
const mockedSendBuildData = vi.mocked(sendBuildData);

describe('viteBuildStatsPlugin', () => {
  const bootstrapChunkSizeLimitKb = 2_000;
  const expected: ViteBuildData = {
    type: 'vite',
    viteVersion: '1.2.3',
    bundleStats: {
      bootstrapChunkSizeBytes: 430,
      bootstrapChunkSizeLimitBytes: bootstrapChunkSizeLimitKb * 1000,
    },
  } as ViteBuildData;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should send the correct data - happy path', async () => {
    // mock measurement
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100);

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockResolvedValue();
    const bundle = generateViteOutputBundleData(true);

    const plugin = viteBuildStatsPlugin(
      'my custom identifier',
      bootstrapChunkSizeLimitKb,
    );
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (
      plugin.generateBundle as (
        opts: NormalizedOutputOptions,
        bundle: OutputBundle,
      ) => void
    )({} as NormalizedOutputOptions, bundle);
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
