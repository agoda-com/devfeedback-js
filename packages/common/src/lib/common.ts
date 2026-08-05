import type {
  CommandBuildData,
  CommonMetadata,
  ViteBuildData,
  RspackBuildData,
  WebpackBuildData,
} from './types.ts';
import { v1 as uuidv1 } from 'uuid';
import os from 'node:os';
import fs from 'node:fs';
import safelyTry from './safely-retry';
import axios from 'axios';
import { getGitInfo } from './git';
import { getSessionId } from './session';

const UNKNOWN_VALUE = '<unknown>';

/**
 * Off-VPN a POST with no timeout hangs until the OS TCP timeout, on the critical
 * path of whatever the developer is actually doing. Nothing we send is worth a wait.
 */
const SEND_TIMEOUT_MS = 1500;

export const getCommonMetadata = (
  timeTaken: number,
  customIdentifier: string = process.env.npm_lifecycle_event ?? UNKNOWN_VALUE,
): CommonMetadata => {
  const git = getGitInfo();

  const { data: gitUserName } = safelyTry(
    () => process.env['GITLAB_USER_LOGIN'] ?? process.env['GITHUB_ACTOR'],
  );
  const { data: osUsername } = safelyTry(() => os.userInfo().username);
  const cpus = os.cpus();

  return {
    id: uuidv1(),
    sessionId: getSessionId(),
    userName: (gitUserName ? gitUserName : osUsername) ?? UNKNOWN_VALUE,
    cpuCount: cpus.length,
    hostname: os.hostname(),
    platform: os.type(),
    os: os.release(),
    timeTaken: timeTaken,
    branch: git.branch ?? UNKNOWN_VALUE,
    projectName: git.repositoryName ?? UNKNOWN_VALUE,
    repository: git.repository ?? UNKNOWN_VALUE,
    repositoryName: git.repositoryName ?? UNKNOWN_VALUE,
    timestamp: Date.now(),
    builtAt: new Date().toISOString(),
    totalMemory: os.totalmem(),
    cpuModels: cpus.map((cpu) => cpu.model),
    cpuSpeed: cpus.map((cpu) => cpu.speed),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    commitSha: git.commitSha ?? UNKNOWN_VALUE,
    customIdentifier: customIdentifier,
  };
};

const getEndpointFromType = (type: string) => {
  return {
    webpack: process.env.WEBPACK_ENDPOINT || 'http://compilation-metrics/webpack',
    vite: process.env.VITE_ENDPOINT || 'http://compilation-metrics/vite',
    vitehmr: process.env.VITE_ENDPOINT || 'http://compilation-metrics/vite',
    rsbuild: process.env.RSPACK_ENDPOINT || 'http://compilation-metrics/rspack',
    rspack: process.env.RSPACK_ENDPOINT || 'http://compilation-metrics/rspack',
    command: process.env.COMMAND_ENDPOINT || 'http://compilation-metrics/command',
  }[type];
};

const LOG_FILE = 'devfeedback.log';

const sendData = async (endpoint: string, metaData: CommonMetadata): Promise<boolean> => {
  const { error } = await safelyTry(() =>
    axios.post(endpoint, metaData, { timeout: SEND_TIMEOUT_MS }),
  );
  if (error) {
    safelyTry(() =>
      fs.writeFileSync(
        LOG_FILE,
        JSON.stringify(error, Object.getOwnPropertyNames(error)),
      ),
    );
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

/**
 * Lifecycle events are emitted from places a developer is not asking for output —
 * install hooks, dev server startup, signal handlers — so this path prints nothing.
 * Failures land in devfeedback.log like everything else.
 */
export const sendCommandData = async (data: CommandBuildData): Promise<void> => {
  const endpoint = getEndpointFromType(data.type);
  if (!endpoint) return;
  await sendData(endpoint, data);
};
