import type { CommonBuildData, ViteBuildData, WebpackBuildData } from './types';
import { v1 as uuidv1 } from 'uuid';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import safelyTry from 'safely-try';
import axios from 'axios';

const UNKNOWN_VALUE = '<unknown>';

const runGitCommand = (args: string[]): string | undefined => {
  const [result] = safelyTry(() => spawnSync('git', args).stdout.toString().trim());
  return result;
};

export const getCommonBuildData = (
  timeTaken: number,
  customIdentifier: string = process.env.npm_lifecycle_event ?? UNKNOWN_VALUE,
): CommonBuildData => {
  const repoUrl = runGitCommand(['config', '--get', 'remote.origin.url']);
  let repoName = repoUrl
    ? repoUrl.substring(repoUrl.lastIndexOf('/') + 1)
    : UNKNOWN_VALUE;
  repoName = repoName.endsWith('.git')
    ? repoName.substring(0, repoName.lastIndexOf('.'))
    : repoName;

  const [username, _] = safelyTry(() => os.userInfo().username);

  return {
    id: uuidv1(),
    userName: username ?? UNKNOWN_VALUE,
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

const ENDPOINT_FROM_TYPE = {
  webpack: 'http://devlocalmetrics.tooling.hk.agoda.is/webpack',
  vite: 'http://devlocalmetrics.tooling.hk.agoda.is/vite',
};

const LOG_FILE = 'devfeedback.log';

export const sendBuildData = async (buildStats: WebpackBuildData | ViteBuildData) => {
  const endpoint = ENDPOINT_FROM_TYPE[buildStats.type];

  console.log(`Your build time was ${buildStats.timeTaken.toFixed(2)}ms.`);

  const [_, error] = await safelyTry(() => axios.post(endpoint, buildStats));
  if (error) {
    console.log(
      `Your build stats has not been sent. See logs in ${LOG_FILE} for more info.`,
    );
    fs.writeFileSync(LOG_FILE, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return;
  }

  console.log(`Your build stats has successfully been sent.`);
};
