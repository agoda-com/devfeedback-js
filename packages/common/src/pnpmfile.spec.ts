import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pnpmfile } from './pnpmfile';

describe.skipIf(process.platform === 'win32')('pnpmfile', () => {
  let root: string;
  const saved = { ...process.env };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-pnpmfile-'));
    delete process.env.CI;
    delete process.env.DEVFEEDBACK_SHELL;
  });

  afterEach(() => {
    process.env = { ...saved };
    rmSync(root, { recursive: true, force: true });
  });

  const shell = () => join(root, 'node_modules', '.bin', 'devfeedback-shell');
  const install = () => {
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(shell(), '#!/bin/sh\n');
  };
  const update = (config: Record<string, unknown>) =>
    pnpmfile(root).hooks.updateConfig(config);

  it('leaves the config alone on a cold clone, before the wrapper is installed', () => {
    const config = { foo: 1 };
    expect(update(config)).toBe(config);
    expect(config).toEqual({ foo: 1 });
  });

  it('sets scriptShell to the absolute wrapper path once installed', () => {
    install();
    expect(update({}).scriptShell).toBe(shell());
  });

  it('leaves a shell the repo already chose alone', () => {
    install();
    expect(update({ scriptShell: '/bin/bash' }).scriptShell).toBe('/bin/bash');
  });

  it('wraps a chosen shell when DEVFEEDBACK_SHELL says which one to run', () => {
    install();
    process.env.DEVFEEDBACK_SHELL = '/bin/bash';
    expect(update({ scriptShell: '/bin/bash' }).scriptShell).toBe(shell());
  });

  it('stays out of the way with shell-emulator and in CI', () => {
    install();
    expect(update({ shellEmulator: true }).scriptShell).toBeUndefined();
    process.env.CI = 'true';
    expect(update({}).scriptShell).toBeUndefined();
  });
});
