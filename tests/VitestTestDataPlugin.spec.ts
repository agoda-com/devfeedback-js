import type { CommonMetadata, VitestTestData } from '../src/types';
import VitestTestDataPlugin from '../src/VitestTestDataPlugin';
import { getCommonMetadata, sendTestData } from '../src/common';
import type { Vitest } from 'vitest';
import uuid from 'uuid';

jest.mock('uuid', () => ({
  v1: jest.fn(),
}));

jest.mock('../src/common', () => ({
  getCommonMetadata: jest.fn(),
  sendTestData: jest.fn(),
}));

const mockedUuid = uuid as jest.Mocked<typeof uuid>;

const mockedGetCommonMetadata = getCommonMetadata as jest.MockedFunction<
  typeof getCommonMetadata
>;
const mockedSendTestData = sendTestData as jest.MockedFunction<typeof sendTestData>;

const mockedVitest: Vitest = {
  config: {
    mode: 'test',
    maxConcurrency: 5,
    watch: false,
    environment: 'jsdom',
  } as Vitest['config'],
  state: {
    getFiles: () => [
      {
        name: 'tests/simple.test.ts',
        collectDuration: 39,
        setupDuration: 2354,
        prepareDuration: 218.17033398151398,
        environmentLoad: 2834.084042072296,
        tasks: [
          {
            type: 'suite',
            name: 'Simple Test Suite',
            tasks: [
              {
                type: 'test',
                name: 'should pass please',
                result: {
                  state: 'pass',
                  startTime: 1691053322524,
                  duration: 2,
                },
              },
            ],
          },
        ],
        result: {
          state: 'pass',
          startTime: 1691053322523,
          duration: 2,
        },
      },
    ],
  } as unknown as Vitest['state'],
} as Vitest;

describe('VitestTestDataPlugin', () => {
  const expected: VitestTestData = {
    type: 'vitest',
    vitestVersion: '0.33.0',
    mode: 'test',
    maxConcurrency: 5,
    watchMode: false,
    testEnvironment: 'jsdom',
    runId: 'this-should-be-a-uuid-but-this-string-is-fine-for-testing',
    files: [
      {
        name: 'tests/simple.test.ts',
        collectDuration: 39,
        setupDuration: 2354,
        environmentLoad: 2834.084042072296,
        prepareDuration: 218.17033398151398,
        status: 'pass',
        startTime: 1691053322523,
        duration: 2,
      },
    ],
    testcases: [
      {
        name: `Simple Test Suite > should pass please`,
        status: 'pass',
        startTime: 1691053322524,
        duration: 2,
        errorMessage: null,
        filename: 'tests/simple.test.ts',
      },
    ],
  } as unknown as VitestTestData;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should send the correct data', async () => {
    // mock uuid
    mockedUuid.v1.mockReturnValue(
      'this-should-be-a-uuid-but-this-string-is-fine-for-testing',
    );

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendTestData.mockReturnValue(Promise.resolve());

    const plugin = new VitestTestDataPlugin('my custom identifier');
    Date.now = jest.fn(() => 0);
    plugin.onInit(mockedVitest);
    Date.now = jest.fn(() => 100);
    plugin.onFinished();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'my custom identifier');
    expect(mockedSendTestData).toBeCalledWith(expect.objectContaining(expected));
  });

  it('should use process.env.npm_lifecycle_event as default custom identifier', async () => {
    // mock uuid
    mockedUuid.v1.mockReturnValue(
      'this-should-be-a-uuid-but-this-string-is-fine-for-testing',
    );

    // mock process object
    global.process = {
      env: {
        npm_lifecycle_event: 'default_value',
      },
    } as unknown as typeof process;

    // mock common utils
    mockedGetCommonMetadata.mockReturnValue({} as CommonMetadata);
    mockedSendTestData.mockReturnValue(Promise.resolve());

    const plugin = new VitestTestDataPlugin();
    Date.now = jest.fn(() => 0);
    plugin.onInit(mockedVitest);
    Date.now = jest.fn(() => 100);
    plugin.onFinished();

    expect(mockedGetCommonMetadata).toBeCalledWith(100, 'default_value');

    const newExpected = { ...expected, customIdentifier: 'default_value' };
    expect(mockedSendTestData).toBeCalledWith(expect.objectContaining(expected));
  });
});
