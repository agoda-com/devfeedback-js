import { constants } from 'node:os';
import { sep } from 'node:path';
import { isCiSuppressed } from './ci';
import { detectPackageManager } from './install';
import { phaseFor } from './phase';
import { getSessionId } from './session';
import type { CommandOutcome } from './types';
import { readCommandConfig, workspaceRoot } from './workspace';
import type { PendingCommand } from './flusher';

/** Part of the install span, which the install hooks already measure. */
const INSTALL_LIFECYCLE = new Set([
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
]);

const inNodeModules = (p: string | undefined): boolean =>
  !!p && p.split(sep).includes('node_modules');

export interface ScriptPlan {
  /** env for the real shell; unchanged when we stay out of the way */
  env: NodeJS.ProcessEnv;
  /** present when this script is recorded */
  record?: {
    root: string;
    event: Omit<
      PendingCommand,
      'exitCode' | 'success' | 'outcome' | 'signal' | 'timeTaken' | 'endedAt'
    >;
  };
}

/**
 * Decide, before the script starts, whether to record it and what env the real shell
 * gets. Only fixed identifiers are read: the script name, the package name and the
 * package manager. Never the script body (`npm_lifecycle_script`) or argv.
 */
export const planScript = (
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ScriptPlan => {
  const untouched: ScriptPlan = { env };
  if (isCiSuppressed(env)) return untouched;

  const target = env.npm_lifecycle_event;
  if (!target) return untouched; // not run by a package manager

  // pnpm also uses scriptShell for dependency lifecycle scripts during install
  if (inNodeModules(env.npm_package_json) || inNodeModules(cwd)) return untouched;

  // inside an Nx task: the Nx plugin records it, and both would double-count
  if (env.NX_TASK_TARGET_PROJECT) return untouched;

  const root = workspaceRoot(cwd);
  const sessionId = env.DEVFEEDBACK_SESSION_ID || getSessionId(root);
  const { packageManager } = detectPackageManager(env);
  const runner = packageManager ?? 'pnpm';
  const command = `${runner} run ${target}`;
  const rootCommand = env.DEVFEEDBACK_ROOT_COMMAND || command;

  // even a skipped `dev` passes the session on, so the bundler it starts joins it
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    DEVFEEDBACK_SESSION_ID: sessionId,
    DEVFEEDBACK_ROOT_COMMAND: rootCommand,
  };

  const config = readCommandConfig(root);
  if (INSTALL_LIFECYCLE.has(target) || config.skip.includes(target)) {
    return { env: childEnv };
  }

  return {
    env: childEnv,
    record: {
      root,
      event: {
        type: 'command',
        phase: phaseFor(target, config.phases),
        command,
        runner,
        target,
        project: env.npm_package_name || undefined,
        rootCommand,
        sessionId,
        customIdentifier: target,
      },
    },
  };
};

/**
 * pnpm 12 prefixes every script it runs through a known POSIX shell with this trap, so
 * a script survives a first SIGINT and re-raises it only once the foreground command
 * died of it. It picks the shell by basename, so with the wrapper as `scriptShell` it
 * no longer adds it. Adding it back keeps Ctrl-C behaving exactly as it would without
 * the wrapper.
 */
export const PNPM_SIGINT_TRAP = `trap 'if [ "$?" -eq 130 ]; then trap - INT; kill -s INT $$; fi; trap "trap - INT; kill -s INT $$" INT' INT; `;

/** shells pnpm 12 was observed to add the trap for */
const PNPM_TRAP_SHELLS = new Set(['sh', 'bash', 'dash']);

/** Arguments for the real shell: unchanged, apart from pnpm 12's SIGINT trap. */
export const realShellArgs = (
  args: string[],
  realShell: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] => {
  const { packageManager, packageManagerVersion } = detectPackageManager(env);
  const major = Number(packageManagerVersion?.split('.')[0]);
  const shellName = realShell.split('/').pop() ?? '';
  if (
    packageManager === 'pnpm' &&
    major >= 12 &&
    PNPM_TRAP_SHELLS.has(shellName) &&
    args.length === 2 &&
    args[0] === '-c' &&
    !args[1]?.startsWith(PNPM_SIGINT_TRAP)
  ) {
    return ['-c', PNPM_SIGINT_TRAP + args[1]];
  }
  return args;
};

/** Exit status as a shell reports it: the code, or 128 + the signal number. */
export const exitStatus = (
  code: number | null,
  signal: NodeJS.Signals | null,
): number => {
  if (code !== null) return code;
  const n = signal ? constants.signals[signal] : undefined;
  return n ? 128 + n : 1;
};

/** 130 is how a shell reports a child that died of SIGINT. */
export const scriptOutcome = (
  exitCode: number,
  signal: NodeJS.Signals | null,
): CommandOutcome => {
  if (signal || exitCode === 130) return 'aborted';
  return exitCode === 0 ? 'success' : 'failure';
};

export const finishScript = (
  record: NonNullable<ScriptPlan['record']>,
  code: number | null,
  signal: NodeJS.Signals | null,
  timeTaken: number,
  endedAt: number = Date.now(),
): PendingCommand => {
  const exitCode = exitStatus(code, signal);
  return {
    ...record.event,
    exitCode,
    success: exitCode === 0,
    outcome: scriptOutcome(exitCode, signal),
    ...(signal ? { signal } : {}),
    timeTaken,
    endedAt,
  };
};
