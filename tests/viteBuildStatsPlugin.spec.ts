import type { CommonMetadata, ViteBuildData } from '../src/types';
import { viteBuildStatsPlugin } from "../src";
import { getCommonMetadata, sendBuildData } from '../src/common';
import { NormalizedOutputOptions, OutputBundle, OutputChunk, OutputAsset } from "rollup";

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

function generateOutputBundle(): OutputBundle {
  const bootstrapChunk: OutputChunk = {
    name: 'bootstrap',
    type: 'chunk',
    code: 'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");' +
      'console.log("Bygone visions of life asunder, long since quelled by newfound wonder.");'
  } as unknown as OutputChunk;

  const nonBootstrapChunkA: OutputChunk = {
    name: 'notBootstrapA',
    type: 'chunk',
    code: 'random sentence to pass my time'
  } as unknown as OutputChunk;

  const nonBootstrapChunkB: OutputChunk = {
    name: 'notBootstrapB',
    type: 'chunk',
    code: 'random sentence to pass my time again'
  } as unknown as OutputChunk;

  const assetNamedBootstrap: OutputAsset = {
    name: 'bootstrap',
    fileName: 'bootstrap.jpg',
    type: 'asset',
    source: '../../assets/bootstrap.jpg',
    needsCodeReference: false
  };

  return {
    'a-not-bootstrap.js': nonBootstrapChunkA,
    'bootstrap.xyz123.js': bootstrapChunk,
    'b-not-bootstrap.js': nonBootstrapChunkB,
    'bootstrap.jpg': assetNamedBootstrap
  };
}

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

  it('should send the correct data', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());
    const bundle = generateOutputBundle();

    const plugin = viteBuildStatsPlugin('my custom identifier', bootstrapChunkSizeLimitKb);
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.generateBundle as (opts: NormalizedOutputOptions, bundle: OutputBundle) => void)({} as NormalizedOutputOptions, bundle);
    (plugin.buildEnd as () => void)();
    await (plugin.closeBundle as () => Promise<void>)();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'my custom identifier');
    expect(mockedSendBuildData).toBeCalledWith(expected);
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // mock measurement
    global.Date = {
      now: jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as unknown as typeof Date;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendBuildData.mockReturnValue(Promise.resolve());
    const bundle = generateOutputBundle();

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
