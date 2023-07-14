import { getCommonBuildData, sendBuildData } from '../src/common';
import os from 'os';
import child_process from 'child_process';
import uuid from 'uuid';
import fs from 'fs';
import type { CommonBuildData } from '../src/types';
import axios from 'axios';

jest.mock('os', () => ({
  hostname: jest.fn(),
  userInfo: jest.fn(),
  type: jest.fn(),
  release: jest.fn(),
  cpus: jest.fn(),
  totalmem: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));

jest.mock('uuid', () => ({
  v1: jest.fn(),
}));

jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const mockedOs = os as jest.Mocked<typeof os>;
const mockedChildProcess = child_process as jest.Mocked<typeof child_process>;
const mockedUuid = uuid as jest.Mocked<typeof uuid>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('common', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getCommonBuildData', () => {
    const expected: CommonBuildData = {
      id: '250ce4f8-1f0a-11ee-be56-0242ac120002',
      userName: 'root',
      cpuCount: 1,
      hostname: 'hostname',
      platform: 'Linux',
      os: '5.4.0-144-generic',
      timeTaken: 156535,
      branch: 'master',
      projectName: 'agoda-com-spa-mobile',
      repository: 'https://gitlab.agodadev.io/full-stack/monoliths/agoda-com-spa-mobile',
      repositoryName: 'agoda-com-spa-mobile',
      timestamp: 1688888945705,
      builtAt: '2023-07-09T07:49:05.705Z',
      totalMemory: 15748743168,
      cpuModels: ['Intel(R) Core(TM) i7 CPU 860 @ 2.80GHz'],
      cpuSpeed: [2926],
      nodeVersion: 'v14.18.2',
      v8Version: '8.4.371.23-node.85',
      commitSha: '959a2962d61c3b064610bb83510ba7be3d4f500c',
      customIdentifier: 'Flights V2 App with Initial Load - production build',
    };

    it('should return the correct data', () => {
      // mock uuid v1
      mockedUuid.v1.mockReturnValue('250ce4f8-1f0a-11ee-be56-0242ac120002');

      // mock os
      mockedOs.hostname.mockReturnValue('hostname');
      mockedOs.userInfo.mockReturnValue({ username: 'root' } as os.UserInfo<never>);
      mockedOs.type.mockReturnValue('Linux');
      mockedOs.release.mockReturnValue('5.4.0-144-generic');
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel(R) Core(TM) i7 CPU 860 @ 2.80GHz',
          speed: 2926,
          times: {
            user: 252020,
            nice: 0,
            sys: 30340,
            idle: 1070356870,
            irq: 0,
          },
        },
      ]);
      mockedOs.totalmem.mockReturnValue(15748743168);

      // mock child_process object
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: Buffer.from(
          'https://gitlab.agodadev.io/full-stack/monoliths/agoda-com-spa-mobile',
        ),
      } as child_process.SpawnSyncReturns<Buffer>);
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: Buffer.from('master'),
      } as child_process.SpawnSyncReturns<Buffer>);
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: Buffer.from('959a2962d61c3b064610bb83510ba7be3d4f500c'),
      } as child_process.SpawnSyncReturns<Buffer>);

      // mock process object
      global.process = {
        version: 'v14.18.2',
        versions: {
          v8: '8.4.371.23-node.85',
        },
      } as typeof process;

      // mock current datetime
      jest.useFakeTimers().setSystemTime(new Date('2023-07-09T07:49:05.705Z'));

      const result = getCommonBuildData(
        156535,
        'Flights V2 App with Initial Load - production build',
      );
      expect(result).toEqual(expected);
    });

    it('should populate unknown fields as "<unknown>"', () => {
      // mock os object
      mockedOs.cpus.mockReturnValue([]);

      // mock child_process object
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: undefined,
      } as unknown as child_process.SpawnSyncReturns<Buffer>);
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: undefined,
      } as unknown as child_process.SpawnSyncReturns<Buffer>);
      mockedChildProcess.spawnSync.mockReturnValueOnce({
        stdout: undefined,
      } as unknown as child_process.SpawnSyncReturns<Buffer>);

      // mock process object
      global.process = {
        env: {
          npm_lifecycle_event: undefined,
        },
        versions: {
          v8: '8.4.371.23-node.85',
        },
      } as unknown as typeof process;

      // mock current datetime
      jest.useFakeTimers().setSystemTime(new Date('2023-07-09T07:49:05.705Z'));

      const result = getCommonBuildData(156535);
      expect(result).toEqual(
        expect.objectContaining({
          userName: '<unknown>',
          branch: '<unknown>',
          repository: '<unknown>',
          repositoryName: '<unknown>',
          projectName: '<unknown>',
          commitSha: '<unknown>',
          customIdentifier: '<unknown>',
        }),
      );
    });
  });

  describe('sendBuildData', () => {
    it('should write error object to log file if request fails', async () => {
      // mock axios request
      mockedAxios.post.mockReturnValue(Promise.reject(new Error('failed bro')));

      // mock fs
      mockedFs.writeFileSync.mockImplementationOnce(() => {});

      await sendBuildData({ timeTaken: 100 } as any);

      const fileName = mockedFs.writeFileSync.mock.calls[0][0];
      expect(fileName).toEqual('devfeedback.log');

      const errorMessage = JSON.parse(mockedFs.writeFileSync.mock.calls[0][1] as string);
      expect(errorMessage).toEqual(
        expect.objectContaining({
          message: 'failed bro',
        }),
      );
    });

    it('should write error string to log file if request fails', async () => {
      // mock axios request
      mockedAxios.post.mockReturnValue(Promise.reject('failed bro'));

      // mock fs
      mockedFs.writeFileSync.mockImplementationOnce(() => {});

      await sendBuildData({ timeTaken: 100 } as any);

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        'devfeedback.log',
        '"failed bro"',
      );
    });
  });
});
