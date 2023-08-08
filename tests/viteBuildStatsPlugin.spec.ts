import type { CommonMetadata, ViteBuildData } from '../src/types';
import { viteBuildStatsPlugin } from '../src/viteBuildStatsPlugin';
import { getCommonMetadata, sendBuildData } from '../src/common';

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendBuildData: jest.fn(),
}));

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendBuildData = sendBuildData as jest.MockedFunction<typeof sendBuildData>;

describe('viteBuildStatsPlugin', () => {
  const expected: ViteBuildData = {
    type: 'vite',
    viteVersion: '1.2.3',
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

    const plugin = viteBuildStatsPlugin('my custom identifier');
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.buildEnd as () => void)();
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

    const plugin = viteBuildStatsPlugin();
    (plugin.buildStart as () => void).bind({ meta: { rollupVersion: '1.2.3' } })();
    (plugin.buildEnd as () => void)();
    await (plugin.closeBundle as () => Promise<void>)();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'default_value');
    expect(mockedSendBuildData).toBeCalledWith(expect.objectContaining(expected));
  });
});
