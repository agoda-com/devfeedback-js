import type {
  CommonMetadata,
  ViteBuildData,
  RspackBuildData,
  WebpackBuildData,
} from './types.ts';
import { v1 as uuidv1 } from 'uuid';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import safelyTry from 'safely-try';
import axios from 'axios';

const UNKNOWN_VALUE = '<unknown>';

const runGitCommand = (args: string[]): string | undefined => {
  const { data: result } = safelyTry(() =>
    spawnSync('git', args).stdout.toString().trim(),
  );
  return result;
};

export const getCommonMetadata = (
  timeTaken: number,
  customIdentifier: string = process.env.npm_lifecycle_event ?? UNKNOWN_VALUE,
): CommonMetadata => {
  const repoUrl = runGitCommand(['config', '--get', 'remote.origin.url']);
  let repoName = repoUrl
    ? repoUrl.substring(repoUrl.lastIndexOf('/') + 1)
    : UNKNOWN_VALUE;
  repoName = repoName.endsWith('.git')
    ? repoName.substring(0, repoName.lastIndexOf('.'))
    : repoName;

  const { data: gitUserName } = safelyTry(
    () => process.env['GITLAB_USER_LOGIN'] ?? process.env['GITHUB_ACTOR'],
  );
  const { data: osUsername } = safelyTry(() => os.userInfo().username);

  return {
    id: uuidv1(),
    userName: (gitUserName ? gitUserName : osUsername) ?? UNKNOWN_VALUE,
    cpuCount: os.cpus().length,
    hostname: os.hostname(),
    platform: os.type(),
    os: os.release(),
    timeTaken: timeTaken,
    branch: runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']) ?? UNKNOWN_VALUE,
    projectName: repoName,
    repository: repoUrl ?? UNKNOWN_VALUE,
    repositoryName: repoName,
    timestamp: Date.now(),
    builtAt: new Date().toISOString(),
    totalMemory: os.totalmem(),
    cpuModels: os.cpus().map((cpu) => cpu.model),
    cpuSpeed: os.cpus().map((cpu) => cpu.speed),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    commitSha: runGitCommand(['rev-parse', 'HEAD']) ?? UNKNOWN_VALUE,
    customIdentifier: customIdentifier,
  };
};

const getEndpointFromType = (type: string) => {
  return {
    webpack: process.env.WEBPACK_ENDPOINT || 'http://compilation-metrics/webpack',
    vite: process.env.VITE_ENDPOINT || 'http://compilation-metrics/vite',
    vitehmr: process.env.VITE_ENDPOINT || 'http://compilation-metrics/vite',
    rsbuild: process.env.WEBPACK_ENDPOINT || 'http://compilation-metrics/webpack',
  }[type];
};

const LOG_FILE = 'devfeedback.log';

const sendData = async (endpoint: string, metaData: CommonMetadata): Promise<boolean> => {
  const { error } = await safelyTry(() => axios.post(endpoint, metaData));
  if (error) {
    fs.writeFileSync(LOG_FILE, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return false;
  }
  return true;
};

export const sendBuildData = async (
  buildStats: RspackBuildData | ViteBuildData | WebpackBuildData,
) => {
  const endpoint = getEndpointFromType(buildStats.type);

  if (!endpoint) {
    console.log(
      `No endpoint found for type ${buildStats.type}. Please set the environment variable.`,
    );
    return;
  }

  console.log(`Your build time was ${buildStats.timeTaken.toFixed(2)}ms.`);

  const sent = await sendData(endpoint, buildStats);
  if (!sent) {
    console.log(
      `Your build stats has not been sent. See logs in ${LOG_FILE} for more info.`,
    );
    return;
  }

  console.log(
    `Your build stats has successfully been sent to ${endpoint} for ${buildStats.type}.`,
  );
};
