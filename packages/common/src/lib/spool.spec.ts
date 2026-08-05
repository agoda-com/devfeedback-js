import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { flushSpool, spoolCommandData } from './spool';
import { stateDir } from './session';
import { sendCommandData } from './common';
import type { CommandBuildData } from './types';

vi.mock('./common', () => ({ sendCommandData: vi.fn() }));
vi.mock('./npm-timing', () => ({ collectNpmTimings: vi.fn() }));

const mockedSend = vi.mocked(sendCommandData);

const event = (overrides: Partial<CommandBuildData> = {}): CommandBuildData =>
  ({
    type: 'command',
    phase: 'install',
    command: 'pnpm/9.0.0',
    exitCode: 0,
    success: true,
    timeTaken: 1234,
    sessionId: 'session-1',
    ...overrides,
  }) as CommandBuildData;

describe('spool', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-spool-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const spoolFile = () => join(stateDir(root), 'spool.ndjson');

  it('appends one NDJSON line per event and stamps spooledAt', () => {
    spoolCommandData(event(), root);
    spoolCommandData(event({ phase: 'devserver' }), root);

    const lines = readFileSync(spoolFile(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string).spooledAt).toBeTypeOf('number');
    expect(JSON.parse(lines[1] as string).phase).toBe('devserver');
  });

  it('delivers spooled events and removes the file', async () => {
    spoolCommandData(event(), root);
    await flushSpool(root);

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0]?.[0]).toMatchObject({ phase: 'install' });
    expect(existsSync(spoolFile())).toBe(false);
  });

  it('drops events older than the maximum age', async () => {
    const stale = { ...event(), spooledAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
    writeFileSync(spoolFile(), JSON.stringify(stale) + '\n');

    await flushSpool(root);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('skips malformed lines without losing the good ones', async () => {
    writeFileSync(
      spoolFile(),
      `not json\n${JSON.stringify({ ...event(), spooledAt: Date.now() })}\n`,
    );

    await flushSpool(root);
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('never grows past the size cap', () => {
    writeFileSync(spoolFile(), 'x'.repeat(257 * 1024));
    spoolCommandData(event(), root);

    expect(readFileSync(spoolFile(), 'utf8')).toBe('x'.repeat(257 * 1024));
  });

  it('is a no-op when there is nothing spooled', async () => {
    await expect(flushSpool(root)).resolves.toBeUndefined();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('never throws, whatever the event contains', () => {
    const circular = event() as unknown as Record<string, unknown>;
    circular.self = circular;
    expect(() => spoolCommandData(circular as never, root)).not.toThrow();
  });
});
