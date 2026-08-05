import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getCommonMetadata, sendCommandData } from './common';
import { getSessionId, readState, writeState } from './session';
import type { CommandBuildData } from './types';

/**
 * `npm install --timing` (or `timing=true` in .npmrc) writes per-phase timers to
 * ~/.npm/_logs/*-timing.json. The per-script timers are the most actionable install
 * data we can get: Playwright browser downloads, node-gyp rebuilds and husky routinely
 * dominate install time and are each individually fixable.
 *
 * npm only — pnpm and yarn have no equivalent, and pnpm 11 no longer reads non-auth
 * settings from .npmrc at all. Scraped on the next plugin start rather than during the
 * install, because npm writes the file after our hooks have already run.
 */

/** never let one weird log file produce a giant payload */
const MAX_TIMERS = 500;
/** a single flush never looks at more than this many files */
const MAX_FILES = 5;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface NpmTimingFile {
  metadata?: { command?: string[]; version?: string; timers?: Record<string, number> };
  timers?: Record<string, number>;
}

const logsDir = (): string =>
  process.env.npm_config_logs_dir ?? join(homedir(), '.npm', '_logs');

const isInstallCommand = (command: string[] | undefined): boolean => {
  const verb = command?.[0];
  return verb === 'install' || verb === 'ci' || verb === 'i' || verb === 'add';
};

const trimTimers = (timers: Record<string, number>): Record<string, number> => {
  const entries = Object.entries(timers).filter(([, v]) => typeof v === 'number');
  if (entries.length <= MAX_TIMERS) return Object.fromEntries(entries);
  // keep the slowest, they are the ones anyone would act on
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_TIMERS));
};

/**
 * Emit one `install` event per npm run we have not seen before. Best effort throughout:
 * no logs directory, no timing files, or a shape we don't recognise are all no-ops.
 */
export const collectNpmTimings = async (root?: string): Promise<void> => {
  let dir: string;
  let files: string[];
  try {
    dir = logsDir();
    files = readdirSync(dir).filter((f) => f.endsWith('-timing.json'));
  } catch {
    return;
  }
  if (files.length === 0) return;

  const state = readState(root);
  const watermark = state?.npmTimingWatermark ?? Date.now() - MAX_AGE_MS;

  const fresh: Array<{ path: string; mtimeMs: number }> = [];
  for (const file of files) {
    try {
      const path = join(dir, file);
      const { mtimeMs } = statSync(path);
      if (mtimeMs > watermark) fresh.push({ path, mtimeMs });
    } catch {
      /* skip */
    }
  }
  if (fresh.length === 0) return;

  fresh.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const batch = fresh.slice(-MAX_FILES);
  let highWater = watermark;

  for (const { path, mtimeMs } of batch) {
    highWater = Math.max(highWater, mtimeMs);
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as NpmTimingFile;
      const timers = parsed.timers ?? parsed.metadata?.timers;
      const command = parsed.metadata?.command;
      if (!timers || !isInstallCommand(command)) continue;

      const total = timers['npm'] ?? timers['command:install'] ?? timers['reify'];
      if (typeof total !== 'number') continue;

      const event: CommandBuildData = {
        ...getCommonMetadata(total, 'install'),
        type: 'command',
        phase: 'install',
        command: `npm ${(command ?? ['install']).join(' ')}`,
        exitCode: 0,
        success: true,
        packageManager: 'npm',
        packageManagerVersion: parsed.metadata?.version,
        measurementSource: 'npm-timing',
        npmTimers: trimTimers(timers),
        // the run happened when npm wrote the file, not now
        spooledAt: Math.round(mtimeMs),
      };
      await sendCommandData(event);
    } catch {
      /* skip unreadable or unexpected file */
    }
  }

  // record the watermark even for files we skipped, so we never re-read them
  for (const { mtimeMs } of fresh) highWater = Math.max(highWater, mtimeMs);
  const latest = readState(root);
  writeState(
    {
      ...(latest ?? { sessionId: getSessionId(root), lastSeenAt: Date.now() }),
      npmTimingWatermark: highWater,
    },
    root,
  );
};
