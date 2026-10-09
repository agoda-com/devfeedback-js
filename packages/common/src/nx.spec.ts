import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { postTasksExecution, name } from './nx';
import { spoolCommandData } from './lib/spool';
import { getCommonMetadata } from './lib/common';
import { spawnFlusher } from './lib/flusher';
import { _resetCommandConfigCache } from './lib/workspace';

vi.mock('./lib/spool', () => ({ spoolCommandData: vi.fn() }));
vi.mock('./lib/common', () => ({
  getCommonMetadata: vi.fn((timeTaken: number, customIdentifier: string) => ({
    id: 'id',
    sessionId: 'from-metadata',
    timeTaken,
    customIdentifier,
    timestamp: 1,
    builtAt: 'x',
  })),
}));
vi.mock('./lib/flusher', () => ({ spawnFlusher: vi.fn() }));

const mockedSpool = vi.mocked(spoolCommandData);
const mockedFlusher = vi.mocked(spawnFlusher);

describe('nx postTasksExecution', () => {
  let root: string;
  const saved = { ...process.env };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-nx-'));
    writeFileSync(join(root, 'nx.json'), '{}');
    vi.clearAllMocks();
    _resetCommandConfigCache();
    delete process.env.CI;
    process.env.DEVFEEDBACK_SESSION_ID = 'session-1';
    delete process.env.DEVFEEDBACK_ROOT_COMMAND;
  });

  afterEach(() => {
    process.env = { ...saved };
    rmSync(root, { recursive: true, force: true });
  });

  const task = (target: string, status: string) => ({
    task: {
      id: `app:${target}`,
      target: { project: 'app', target },
      startTime: 10,
      endTime: 40,
    },
    status,
    code: status === 'failure' ? 1 : 0,
    terminalOutput: 'SECRET_OUTPUT',
  });

  it('exports a plugin name', () => {
    expect(name).toBe('agoda-devfeedback-common/nx');
  });

  it('spools one event per task and starts one detached flusher', async () => {
    await postTasksExecution(
      {},
      {
        workspaceRoot: root,
        id: 'run-1',
        taskResults: {
          'app:build': task('build', 'success'),
          'app:test': task('test', 'local-cache'),
        },
      },
    );

    expect(mockedSpool).toHaveBeenCalledTimes(2);
    const [first, firstRoot] = mockedSpool.mock.calls[0]!;
    expect(firstRoot).toBe(root);
    expect(first).toMatchObject({
      id: 'id',
      type: 'command',
      phase: 'build',
      outcome: 'success',
      runner: 'nx',
      project: 'app',
      target: 'build',
      runId: 'run-1',
      sessionId: 'session-1',
      timeTaken: 30,
      timestamp: 40,
    });
    expect(first).not.toHaveProperty('endedAt');
    expect(mockedSpool.mock.calls[1]![0]).toMatchObject({
      target: 'test',
      outcome: 'cache',
    });
    expect(JSON.stringify(mockedSpool.mock.calls)).not.toContain('SECRET_OUTPUT');
    expect(vi.mocked(getCommonMetadata)).toHaveBeenCalledWith(30, 'build');

    expect(mockedFlusher).toHaveBeenCalledTimes(1);
    expect(mockedFlusher.mock.calls[0]![0]).toMatch(/cli[\\/]flush\.cjs$/);
    expect(mockedFlusher.mock.calls[0]![1]).toBe(root);
  });

  it('does nothing in CI', async () => {
    process.env.CI = 'true';
    await postTasksExecution(
      {},
      { workspaceRoot: root, taskResults: { a: task('build', 'success') } },
    );
    expect(mockedSpool).not.toHaveBeenCalled();
    expect(mockedFlusher).not.toHaveBeenCalled();
  });

  it('does nothing when every task is skipped', async () => {
    await postTasksExecution(
      {},
      { workspaceRoot: root, taskResults: { a: task('serve', 'success') } },
    );
    expect(mockedSpool).not.toHaveBeenCalled();
    expect(mockedFlusher).not.toHaveBeenCalled();
  });

  it('never throws into Nx', async () => {
    mockedSpool.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(
      postTasksExecution(
        {},
        { workspaceRoot: root, taskResults: { a: task('build', 'success') } },
      ),
    ).resolves.toBeUndefined();
    await expect(postTasksExecution({}, undefined as never)).resolves.toBeUndefined();
  });
});
