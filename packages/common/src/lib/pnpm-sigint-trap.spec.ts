/**
 * Runs a real pnpm and checks that `realShellArgs` gives the real shell exactly what
 * pnpm would have given it without the wrapper. Each fake shell below is named after a
 * shell pnpm may add its SIGINT trap for, and records the body pnpm passes it.
 *
 * Uses `pnpm` from PATH (the repo's pinned version), or `PNPM_TRAP_CHECK_BIN`, which
 * the `pnpm-latest` CI job points at the newest release.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realShellArgs } from './script-shell';

const PNPM = process.env.PNPM_TRAP_CHECK_BIN || 'pnpm';
const SCRIPT = 'echo hi';

describe.skipIf(process.platform === 'win32')('pnpm SIGINT trap (real pnpm)', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'devfeedback-pnpm-trap-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'probe', private: true, scripts: { probe: SCRIPT } }),
    );
    mkdirSync(join(dir, 'bin'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(['sh', 'zsh', 'fish'])(
    'matches what pnpm passes a scriptShell named %s',
    (name) => {
      const shell = join(dir, 'bin', name);
      writeFileSync(
        shell,
        '#!/bin/sh\nprintf "%s\\n%s" "$npm_config_user_agent" "$2" > "$PROBE_OUT"\n',
      );
      chmodSync(shell, 0o755);
      const out = join(dir, `${name}.out`);

      execFileSync(PNPM, [`--config.script-shell=${shell}`, 'run', 'probe'], {
        cwd: dir,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, PROBE_OUT: out },
        stdio: 'ignore',
      });

      const [userAgent, body] = readFileSync(out, 'utf8').split('\n');
      expect(
        realShellArgs(['-c', SCRIPT], shell, { npm_config_user_agent: userAgent }),
      ).toEqual(['-c', body]);
    },
    30_000,
  );
});
