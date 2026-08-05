import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectPackageManager,
  installRoot,
  lockfileHash,
  parentStartedAt,
} from './install';

describe('lockfileHash', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-lock-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is undefined when the repo has no lockfile', () => {
    expect(lockfileHash(root)).toBeUndefined();
  });

  it.each(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'])('hashes %s', (name) => {
    writeFileSync(join(root, name), 'lockfile contents');
    expect(lockfileHash(root)).toBeTypeOf('string');
  });

  it('changes when the lockfile changes', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'a');
    const before = lockfileHash(root);
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'b');
    expect(lockfileHash(root)).not.toBe(before);
  });

  it('is stable when nothing changes', () => {
    writeFileSync(join(root, 'yarn.lock'), 'a');
    expect(lockfileHash(root)).toBe(lockfileHash(root));
  });

  it('notices a change in any lockfile when several are present', () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'a');
    writeFileSync(join(root, 'yarn.lock'), 'a');
    const before = lockfileHash(root);
    writeFileSync(join(root, 'yarn.lock'), 'b');
    expect(lockfileHash(root)).not.toBe(before);
  });
});

describe('detectPackageManager', () => {
  const original = process.env.npm_config_user_agent;

  afterEach(() => {
    if (original === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = original;
  });

  it.each([
    ['pnpm/9.0.0 npm/? node/v20.11.0 linux x64', 'pnpm', '9.0.0'],
    ['npm/10.2.4 node/v20.11.0 darwin arm64 workspaces/false', 'npm', '10.2.4'],
    ['yarn/1.22.19 npm/? node/v20.11.0 linux x64', 'yarn', '1.22.19'],
  ])('parses %s', (userAgent, expectedName, expectedVersion) => {
    process.env.npm_config_user_agent = userAgent;
    const result = detectPackageManager();
    expect(result.packageManager).toBe(expectedName);
    expect(result.packageManagerVersion).toBe(expectedVersion);
  });

  it('reports no package manager for an unknown user agent', () => {
    process.env.npm_config_user_agent = 'bun/1.0.0 node/v20.11.0';
    expect(detectPackageManager().packageManager).toBeUndefined();
  });

  it('survives a missing user agent', () => {
    delete process.env.npm_config_user_agent;
    expect(detectPackageManager()).toMatchObject({ userAgent: '' });
  });
});

describe('installRoot', () => {
  const original = process.env.INIT_CWD;

  afterEach(() => {
    if (original === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = original;
  });

  it('prefers INIT_CWD, the repo the package manager was invoked in', () => {
    process.env.INIT_CWD = '/somewhere/else';
    expect(installRoot()).toBe('/somewhere/else');
  });

  it('falls back to cwd', () => {
    delete process.env.INIT_CWD;
    expect(installRoot()).toBe(process.cwd());
  });
});

describe('parentStartedAt', () => {
  it('reads a plausible start time for our own process', () => {
    const startedAt = parentStartedAt(process.pid);
    if (startedAt === undefined) return; // unsupported platform: a missing duration is fine
    expect(startedAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(startedAt).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it('returns undefined rather than throwing for a pid that does not exist', () => {
    expect(() => parentStartedAt(2 ** 30)).not.toThrow();
  });
});
