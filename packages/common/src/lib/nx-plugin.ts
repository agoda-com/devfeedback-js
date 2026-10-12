import { isCiSuppressed } from './ci';
import { phaseFor } from './phase';
import type { CommandBuildData, CommandOutcome, CommonMetadata } from './types';
import type { CommandConfig } from './workspace';

/*
 * Structural copies of the parts of Nx's `postTasksExecution` API we read (Nx ≥ 20.4).
 * Declared here rather than imported so the package has no dependency on `nx`, not even
 * for types. Fields newer Nx versions add are optional.
 */
export interface NxTaskResult {
  task: {
    id?: string;
    target: { project: string; target: string; configuration?: string };
    startTime?: number;
    endTime?: number;
    continuous?: boolean;
  };
  status: string;
  code?: number;
  /** never read */
  terminalOutput?: string;
}

export interface NxPostTasksExecutionContext {
  taskResults: Record<string, NxTaskResult>;
  workspaceRoot?: string;
  /** one per invocation, newer Nx only */
  id?: string;
  /** newer Nx only */
  argv?: string[];
}

export type NxCommandEvent = Omit<CommandBuildData, keyof CommonMetadata> & {
  timeTaken: number;
  customIdentifier: string;
  endedAt?: number;
};

export const nxOutcome = (status: string): CommandOutcome => {
  switch (status) {
    case 'success':
    case 'failure':
    case 'skipped':
      return status;
    case 'stopped':
      return 'aborted';
    case 'local-cache':
    case 'local-cache-kept-existing':
    case 'remote-cache':
      return 'cache';
    default:
      return 'failure';
  }
};

const VERBS = new Set(['run', 'run-many', 'affected']);

/**
 * `nx <verb> -t <targets>`, built from the verb (only when it is one we know) and the
 * target names Nx actually ran. Nothing else from argv is used: no project names,
 * flags or paths that a developer typed.
 */
export const nxRootCommand = (argv: string[] | undefined, targets: string[]): string => {
  const verb = argv?.find((a) => VERBS.has(a)) ?? 'run';
  return `nx ${verb} -t ${[...new Set(targets)].sort().join(',')}`;
};

/** One `command` event per task result, minus the common metadata. */
export const nxTaskEvents = (
  context: NxPostTasksExecutionContext,
  config: CommandConfig,
  env: NodeJS.ProcessEnv = process.env,
): NxCommandEvent[] => {
  if (isCiSuppressed(env)) return [];

  const results = Object.values(context.taskResults ?? {}).filter(
    (r) =>
      r?.task?.target &&
      !r.task.continuous &&
      !config.skip.includes(r.task.target.target),
  );
  if (results.length === 0) return [];

  const rootCommand =
    env.DEVFEEDBACK_ROOT_COMMAND ||
    nxRootCommand(
      context.argv,
      results.map((r) => r.task.target.target),
    );

  return results.map(({ task, status, code }) => {
    const { project, target } = task.target;
    const outcome = nxOutcome(status);
    const success = outcome === 'success' || outcome === 'cache';
    const timed = task.startTime !== undefined && task.endTime !== undefined;
    return {
      type: 'command',
      phase: phaseFor(target, config.phases),
      command: `nx run ${target}`,
      exitCode: code ?? (success ? 0 : 1),
      success,
      outcome,
      runner: 'nx',
      project,
      target,
      rootCommand,
      ...(context.id ? { runId: context.id } : {}),
      timeTaken: timed
        ? Math.max(0, (task.endTime as number) - (task.startTime as number))
        : 0,
      customIdentifier: target,
      ...(task.endTime !== undefined ? { endedAt: task.endTime } : {}),
    };
  });
};
