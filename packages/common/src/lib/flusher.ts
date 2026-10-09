import { spawn } from 'node:child_process';
import type { CommandBuildData, CommonMetadata } from './types';

/**
 * A command event before metadata is attached. The script-shell wrapper hands one of
 * these to the detached flusher instead of building the full event itself, so the
 * git reads and the HTTP client load happen after the developer's script has
 * already returned.
 */
export type PendingCommand = Omit<CommandBuildData, keyof CommonMetadata> &
  Pick<CommonMetadata, 'timeTaken' | 'sessionId'> & {
    customIdentifier: string;
    /** epoch ms the command finished, reported as `timestamp` */
    endedAt: number;
  };

export const PENDING_ENV = 'DEVFEEDBACK_PENDING_EVENT';

/**
 * Start `cli/flush` in its own process group and let go of it: delivery must not keep
 * the caller alive, and Ctrl-C on the caller's terminal must not reach it.
 */
export const spawnFlusher = (
  flushScript: string,
  root: string,
  pending?: PendingCommand,
): void => {
  try {
    const env = { ...process.env };
    if (pending) env[PENDING_ENV] = JSON.stringify(pending);
    else delete env[PENDING_ENV];
    const child = spawn(process.execPath, [flushScript, root], {
      cwd: root,
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {
      /* telemetry must never throw */
    });
    child.unref();
  } catch {
    /* telemetry must never throw */
  }
};
