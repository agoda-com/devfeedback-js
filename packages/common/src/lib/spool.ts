import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { stateDir, stateDirs } from './session';
import { sendCommandData } from './common';
import { collectNpmTimings } from './npm-timing';
import type { CommandBuildData } from './types';

const MAX_SPOOL_BYTES = 256 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SPOOL_FILE = 'spool.ndjson';

/**
 * A synchronous, single small append — safe inside a signal handler and cheap enough
 * for a postinstall hook. Anything that cannot afford to await the network writes here
 * and lets the next devfeedback process deliver it.
 */
export const spoolCommandData = (data: CommandBuildData, root?: string): void => {
  try {
    const dir = stateDir(root);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, SPOOL_FILE);
    if (existsSync(p) && statSync(p).size > MAX_SPOOL_BYTES) return; // drop, never grow unbounded
    appendFileSync(p, JSON.stringify({ ...data, spooledAt: Date.now() }) + '\n');
  } catch {
    /* telemetry must never throw */
  }
};

/** claim-by-rename so two concurrent processes can't double-send */
const flushOne = async (p: string): Promise<void> => {
  if (!existsSync(p)) return;
  const claimed = `${p}.${process.pid}.claim`;
  try {
    renameSync(p, claimed);
  } catch {
    return; // someone else won the race
  }
  try {
    const lines = readFileSync(claimed, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as CommandBuildData & { spooledAt: number };
        if (Date.now() - event.spooledAt > MAX_AGE_MS) continue;
        await sendCommandData(event);
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    /* unreadable claim file: drop it */
  } finally {
    try {
      unlinkSync(claimed);
    } catch {
      /* already gone */
    }
  }
};

/**
 * Deliver everything left behind by install hooks, aborted dev servers and npm's own
 * timing logs. Always called as `void flushSpool()` from a point where the developer
 * is already waiting on something else.
 */
export const flushSpool = async (root?: string): Promise<void> => {
  try {
    // both the node_modules cache and the tmpdir fallback, because a cold install
    // writes to tmp and everything afterwards writes to node_modules
    for (const dir of stateDirs(root)) {
      await flushOne(join(dir, SPOOL_FILE));
    }
    await collectNpmTimings(root);
  } catch {
    /* telemetry must never throw */
  }
};
