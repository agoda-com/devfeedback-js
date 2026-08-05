import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _resetSessionCache,
  getSessionId,
  readState,
  stateDir,
  stateDirs,
  writeState,
} from './session';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

describe('session', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-test-'));
    _resetSessionCache();
    delete process.env.DEVFEEDBACK_SESSION_ID;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('falls back to a tmpdir keyed by repo path while node_modules is absent', () => {
    const dir = stateDir(root);
    expect(dir).not.toContain(join(root, 'node_modules'));
    expect(dir.startsWith(tmpdir())).toBe(true);
  });

  it('prefers the node_modules cache once it exists, but still reads the tmpdir', () => {
    const tmpDir = stateDirs(root)[0] as string;
    mkdirSync(join(root, 'node_modules'), { recursive: true });

    const dirs = stateDirs(root);
    expect(dirs[0]).toBe(join(root, 'node_modules', '.cache', 'devfeedback'));
    expect(dirs).toContain(tmpDir);
  });

  it('reads state written before node_modules existed', () => {
    // the cold-install case: preinstall writes to tmp, postinstall reads after linking
    writeState({ sessionId: 'cold-session', lastSeenAt: Date.now() }, root);
    mkdirSync(join(root, 'node_modules'), { recursive: true });

    expect(readState(root)?.sessionId).toBe('cold-session');
  });

  it('writes state atomically, leaving no temp file behind', () => {
    writeState({ sessionId: 'abc', lastSeenAt: 1 }, root);
    const dir = stateDir(root);
    expect(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))).toEqual({
      sessionId: 'abc',
      lastSeenAt: 1,
    });
    expect(existsSync(join(dir, `state.${process.pid}.tmp`))).toBe(false);
  });

  it('reuses a recent session id', () => {
    writeState({ sessionId: 'existing', lastSeenAt: Date.now() - 1000 }, root);
    expect(getSessionId(root)).toBe('existing');
  });

  it('starts a new session after the idle gap', () => {
    writeState({ sessionId: 'stale', lastSeenAt: Date.now() - FOUR_HOURS - 1 }, root);
    const id = getSessionId(root);
    expect(id).not.toBe('stale');
    expect(readState(root)?.sessionId).toBe(id);
  });

  it('lets DEVFEEDBACK_SESSION_ID win', () => {
    process.env.DEVFEEDBACK_SESSION_ID = 'from-shell';
    writeState({ sessionId: 'on-disk', lastSeenAt: Date.now() }, root);
    expect(getSessionId(root)).toBe('from-shell');
    delete process.env.DEVFEEDBACK_SESSION_ID;
  });

  it('keeps the session for the process lifetime even past the idle gap', () => {
    // a dev server started at 9am and saved to at 2pm reports the session it was born into
    const first = getSessionId(root);
    writeState({ sessionId: first, lastSeenAt: Date.now() - FOUR_HOURS - 1 }, root);
    expect(getSessionId(root)).toBe(first);
  });

  it('does not touch disk on every call', () => {
    getSessionId(root);
    const before = readState(root)?.lastSeenAt;
    for (let i = 0; i < 100; i++) getSessionId(root);
    expect(readState(root)?.lastSeenAt).toBe(before);
  });

  it('preserves unrelated state fields when refreshing the session', () => {
    writeState(
      {
        sessionId: 'existing',
        lastSeenAt: Date.now() - 1000,
        winProcTimeMethod: 'none',
        lockfileHash: 'deadbeef',
      },
      root,
    );
    getSessionId(root);
    const state = readState(root);
    expect(state?.winProcTimeMethod).toBe('none');
    expect(state?.lockfileHash).toBe('deadbeef');
  });

  it('never throws when the state file is corrupt', () => {
    writeState({ sessionId: 'x', lastSeenAt: Date.now() }, root);
    writeFileSync(join(stateDir(root), 'state.json'), '{ not json');
    expect(readState(root)).toBeUndefined();
    expect(() => getSessionId(root)).not.toThrow();
  });
});
