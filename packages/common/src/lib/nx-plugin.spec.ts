import { describe, it, expect } from 'vitest';
import {
  nxOutcome,
  nxRootCommand,
  nxTaskEvents,
  type NxPostTasksExecutionContext,
  type NxTaskResult,
} from './nx-plugin';
import { DEFAULT_SKIP } from './workspace';

const config = { phases: {}, skip: DEFAULT_SKIP };

const result = (
  target: string,
  status: string,
  overrides: Partial<NxTaskResult['task']> = {},
  code?: number,
): NxTaskResult => ({
  task: {
    id: `app:${target}`,
    target: { project: 'app', target },
    startTime: 1000,
    endTime: 3500,
    ...overrides,
  },
  status,
  code,
  terminalOutput: 'npm ERR! token=SECRET_TOKEN at /home/someone/repo',
});

const context = (
  results: NxTaskResult[],
  extra: Partial<NxPostTasksExecutionContext> = {},
): NxPostTasksExecutionContext => ({
  taskResults: Object.fromEntries(results.map((r) => [r.task.id, r])),
  ...extra,
});

describe('nx plugin mapping', () => {
  it.each([
    ['success', 'success'],
    ['failure', 'failure'],
    ['skipped', 'skipped'],
    ['stopped', 'aborted'],
    ['local-cache', 'cache'],
    ['local-cache-kept-existing', 'cache'],
    ['remote-cache', 'cache'],
  ])('status %s → outcome %s', (status, outcome) => {
    expect(nxOutcome(status)).toBe(outcome);
  });

  it('maps a task result to a command event', () => {
    const [event] = nxTaskEvents(
      context([result('build', 'success', {}, 0)], {
        id: 'run-1',
        argv: [
          '/usr/bin/node',
          '/repo/node_modules/.bin/nx',
          'run-many',
          '-t',
          'build',
          '--projects=secret-app',
        ],
      }),
      config,
      {},
    );
    expect(event).toEqual({
      type: 'command',
      phase: 'build',
      command: 'nx run build',
      exitCode: 0,
      success: true,
      outcome: 'success',
      runner: 'nx',
      project: 'app',
      target: 'build',
      rootCommand: 'nx run-many -t build',
      runId: 'run-1',
      timeTaken: 2500,
      customIdentifier: 'build',
      endedAt: 3500,
    });
  });

  it('counts cache hits as success and tolerates missing timing', () => {
    const [event] = nxTaskEvents(
      context([
        result('test', 'remote-cache', { startTime: undefined, endTime: undefined }),
      ]),
      config,
      {},
    );
    expect(event).toMatchObject({
      phase: 'test',
      outcome: 'cache',
      success: true,
      exitCode: 0,
      timeTaken: 0,
    });
    expect(event).not.toHaveProperty('endedAt');
    expect(event).not.toHaveProperty('runId');
  });

  it('reports failures, skipped and stopped tasks', () => {
    const events = nxTaskEvents(
      context([
        result('lint', 'failure', {}, 2),
        result('typecheck', 'skipped'),
        result('e2e', 'stopped'),
      ]),
      config,
      {},
    );
    expect(
      events.map((e) => [e.target, e.phase, e.outcome, e.success, e.exitCode]),
    ).toEqual([
      ['lint', 'lint', 'failure', false, 2],
      ['typecheck', 'typecheck', 'skipped', false, 1],
      ['e2e', 'other', 'aborted', false, 1],
    ]);
  });

  it('never carries terminal output or argv', () => {
    const events = nxTaskEvents(
      context([result('build', 'failure', {}, 1)], {
        argv: ['node', 'nx', 'build', 'app', '--token=SECRET_TOKEN'],
      }),
      config,
      {},
    );
    const json = JSON.stringify(events);
    expect(json).not.toContain('SECRET_TOKEN');
    expect(json).not.toContain('terminalOutput');
    expect(json).not.toContain('/home/someone');
  });

  it('skips continuous tasks and the skip list', () => {
    const events = nxTaskEvents(
      context([
        result('build', 'success'),
        result('dev-server', 'success', { continuous: true }),
        result('serve', 'success'),
      ]),
      config,
      {},
    );
    expect(events.map((e) => e.target)).toEqual(['build']);
  });

  it('applies per-repo phase overrides', () => {
    const [event] = nxTaskEvents(
      context([result('e2e', 'success')]),
      {
        phases: { e2e: 'test' },
        skip: [],
      },
      {},
    );
    expect(event?.phase).toBe('test');
  });

  it('records nothing in CI unless opted in', () => {
    const ctx = context([result('build', 'success')]);
    expect(nxTaskEvents(ctx, config, { CI: 'true' })).toEqual([]);
    expect(
      nxTaskEvents(ctx, config, { CI: 'true', DEVFEEDBACK_CI: 'true' }),
    ).toHaveLength(1);
  });

  it('prefers the top-level invocation recorded by an outer pnpm script', () => {
    const [event] = nxTaskEvents(context([result('build', 'success')]), config, {
      DEVFEEDBACK_ROOT_COMMAND: 'pnpm run build',
    });
    expect(event?.rootCommand).toBe('pnpm run build');
  });

  describe('nxRootCommand', () => {
    it('uses only a known verb and the targets that ran', () => {
      expect(
        nxRootCommand(
          ['node', 'nx', 'affected', '-t', 'lint', 'test'],
          ['test', 'lint', 'test'],
        ),
      ).toBe('nx affected -t lint,test');
      expect(nxRootCommand(['node', 'nx', 'build', 'my-app'], ['build'])).toBe(
        'nx run -t build',
      );
      expect(nxRootCommand(undefined, ['build'])).toBe('nx run -t build');
    });
  });
});
