import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** idle gap that starts a new session */
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
/** how often a live process refreshes lastSeenAt */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const STATE_FILE = 'state.json';

export interface SessionState {
  sessionId: string;
  lastSeenAt: number;
  /** hash of the lockfile as of the end of the last observed install */
  lockfileHash?: string;
  /** hash of the lockfile as observed by the preinstall hook of the current install */
  preInstallLockfileHash?: string;
  /** which mechanism successfully read a process start time on this Windows machine */
  winProcTimeMethod?: 'wmic' | 'powershell' | 'none';
  /** set by the preinstall hook, consumed by the postinstall hook */
  installStartedAt?: number;
  /** node_modules was absent when the current install started */
  installWasCold?: boolean;
  /** the repo has a root postinstall hook, so the bundled one must not double-report */
  expectRootPostinstall?: boolean;
  /** mtime watermark for npm's own timing logs */
  npmTimingWatermark?: number;
}

const tmpStateDir = (repoRoot: string): string =>
  join(
    tmpdir(),
    `devfeedback-${createHash('sha1').update(repoRoot).digest('hex').slice(0, 12)}`,
  );

const localStateDir = (repoRoot: string): string =>
  join(repoRoot, 'node_modules', '.cache', 'devfeedback');

/**
 * Every directory that may hold state for this repo, most preferred first.
 *
 * `node_modules` may not exist yet — install runs before anything else — so a
 * tmpdir keyed by repo path is used until it does. Readers check both, because
 * an install that starts cold writes to tmp and finishes with `node_modules`
 * present.
 */
export const stateDirs = (repoRoot: string = process.cwd()): string[] => {
  const local = localStateDir(repoRoot);
  const tmp = tmpStateDir(repoRoot);
  return existsSync(join(repoRoot, 'node_modules')) ? [local, tmp] : [tmp];
};

/** The directory writes go to. Created on demand. */
export const stateDir = (repoRoot: string = process.cwd()): string => {
  const dir = stateDirs(repoRoot)[0] as string;
  mkdirSync(dir, { recursive: true });
  return dir;
};

export const readState = (repoRoot?: string): SessionState | undefined => {
  for (const dir of stateDirs(repoRoot)) {
    try {
      return JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8')) as SessionState;
    } catch {
      /* try the next location */
    }
  }
  return undefined;
};

/** atomic: temp file + rename, so a concurrent reader never sees a half-written file */
export const writeState = (state: SessionState, repoRoot?: string): void => {
  try {
    const dir = stateDir(repoRoot);
    const tmp = join(dir, `state.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, join(dir, STATE_FILE)); // atomic on POSIX; same-volume replace on Windows
  } catch {
    /* telemetry must never throw */
  }
};

let cachedSessionId: string | undefined;
let lastTouchAt = 0;

/**
 * Resolved once per process and then held in memory. The file TTL decides session
 * boundaries for *new* processes only — a dev server started at 9am and saved to at 2pm
 * still reports the session it was born into.
 */
export const getSessionId = (repoRoot?: string): string => {
  if (cachedSessionId) {
    // Keep the session alive for sibling processes, but at most once every few minutes
    // and never inline: this call sits on the HMR path, which must do no synchronous
    // filesystem work at all.
    if (Date.now() - lastTouchAt > TOUCH_INTERVAL_MS) {
      lastTouchAt = Date.now();
      const id = cachedSessionId;
      setImmediate(() => {
        const prev = readState(repoRoot);
        if (prev?.sessionId === id) {
          writeState({ ...prev, lastSeenAt: Date.now() }, repoRoot);
        }
      });
    }
    return cachedSessionId;
  }

  // 1. explicit env var wins — set once per shell/loop, or by any wrapper script
  const fromEnv = process.env.DEVFEEDBACK_SESSION_ID;
  if (fromEnv) {
    cachedSessionId = fromEnv;
    return fromEnv;
  }

  // 2. zero-friction fallback: file-backed session that rotates after an idle gap
  const prev = readState(repoRoot);
  if (prev && Date.now() - prev.lastSeenAt < SESSION_TTL_MS) {
    cachedSessionId = prev.sessionId;
  } else {
    cachedSessionId = randomUUID();
  }
  lastTouchAt = Date.now();
  writeState(
    { ...(prev ?? {}), sessionId: cachedSessionId, lastSeenAt: Date.now() },
    repoRoot,
  );
  return cachedSessionId;
};

/** test seam — clears the process-lifetime memo */
export const _resetSessionCache = (): void => {
  cachedSessionId = undefined;
  lastTouchAt = 0;
};
