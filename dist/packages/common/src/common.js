import { __awaiter } from "tslib";
import { v1 as uuidv1 } from 'uuid';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import safelyTry from 'safely-try';
import axios from 'axios';
const UNKNOWN_VALUE = '<unknown>';
const runGitCommand = (args) => {
    const [result] = safelyTry(() => spawnSync('git', args).stdout.toString().trim());
    return result;
};
export const getCommonMetadata = (timeTaken, customIdentifier) => {
    var _a, _b, _c, _d;
    if (customIdentifier === void 0) { customIdentifier = (_a = process.env.npm_lifecycle_event) !== null && _a !== void 0 ? _a : UNKNOWN_VALUE; }
    const repoUrl = runGitCommand(['config', '--get', 'remote.origin.url']);
    let repoName = repoUrl
        ? repoUrl.substring(repoUrl.lastIndexOf('/') + 1)
        : UNKNOWN_VALUE;
    repoName = repoName.endsWith('.git')
        ? repoName.substring(0, repoName.lastIndexOf('.'))
        : repoName;
    const [gitUserName] = safelyTry(() => { var _a; return (_a = process.env['GITLAB_USER_LOGIN']) !== null && _a !== void 0 ? _a : process.env['GITHUB_ACTOR']; });
    const [osUsername] = safelyTry(() => os.userInfo().username);
    return {
        id: uuidv1(),
        userName: (_b = (gitUserName ? gitUserName : osUsername)) !== null && _b !== void 0 ? _b : UNKNOWN_VALUE,
        cpuCount: os.cpus().length,
        hostname: os.hostname(),
        platform: os.type(),
        os: os.release(),
        timeTaken: timeTaken,
        branch: (_c = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'])) !== null && _c !== void 0 ? _c : UNKNOWN_VALUE,
        projectName: repoName,
        repository: repoUrl !== null && repoUrl !== void 0 ? repoUrl : UNKNOWN_VALUE,
        repositoryName: repoName,
        timestamp: Date.now(),
        builtAt: new Date().toISOString(),
        totalMemory: os.totalmem(),
        cpuModels: os.cpus().map((cpu) => cpu.model),
        cpuSpeed: os.cpus().map((cpu) => cpu.speed),
        nodeVersion: process.version,
        v8Version: process.versions.v8,
        commitSha: (_d = runGitCommand(['rev-parse', 'HEAD'])) !== null && _d !== void 0 ? _d : UNKNOWN_VALUE,
        customIdentifier: customIdentifier,
    };
};
const getEndpointFromType = (type) => {
    return {
        webpack: process.env.WEBPACK_ENDPOINT || "http://compilation-metrics/webpack",
        vite: process.env.VITE_ENDPOINT || "http://compilation-metrics/vite",
    }[type];
};
const LOG_FILE = 'devfeedback.log';
const sendData = (endpoint, data) => __awaiter(void 0, void 0, void 0, function* () {
    const [_, error] = yield safelyTry(() => axios.post(endpoint, data));
    if (error) {
        fs.writeFileSync(LOG_FILE, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return false;
    }
    return true;
});
export const sendBuildData = (buildStats) => __awaiter(void 0, void 0, void 0, function* () {
    const endpoint = getEndpointFromType(buildStats.type);
    if (!endpoint) {
        console.log(`No endpoint found for type ${buildStats.type}. Please set the environment variable.`);
        return;
    }
    console.log(`Your build time was ${buildStats.timeTaken.toFixed(2)}ms.`);
    const sent = yield sendData(endpoint, buildStats);
    if (!sent) {
        console.log(`Your build stats has not been sent. See logs in ${LOG_FILE} for more info.`);
        return;
    }
    console.log(`Your build stats has successfully been sent.`);
});
//# sourceMappingURL=common.js.map