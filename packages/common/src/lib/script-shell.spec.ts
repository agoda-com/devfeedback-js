import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PNPM_SIGINT_TRAP,
  exitStatus,
  finishScript,
  planScript,
  realShellArgs,
  scriptOutcome,
} from './script-shell';
import { _resetCommandConfigCache } from './workspace';
import { _resetSessionCache } from './session';

describe('script-shell', () => {
  let root: string;
  let pkg: string;

  const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    npm_lifecycle_event: 'build',
    npm_lifecycle_script: 'tsc -p . && echo SECRET_TOKEN=abc',
    npm_package_name: '@acme/app',
    npm_package_json: join(pkg, 'package.json'),
    npm_config_user_agent: 'pnpm/10.18.0 npm/? node/v22.14.0 linux x64',
    DEVFEEDBACK_SESSION_ID: 'session-1',
    ...overrides,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devfeedback-shell-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: ["packages/*"]\n');
    writeFileSync(join(root, 'package.json'), '{}');
    pkg = join(root, 'packages', 'app');
    mkdirSync(pkg, { recursive: true });
    _resetCommandConfigCache();
    _resetSessionCache();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('planScript', () => {
    it('records a workspace script from fixed identifiers only', () => {
      const plan = planScript(env(), pkg);
      expect(plan.record).toEqual({
        root,
        event: {
          type: 'command',
          phase: 'build',
          command: 'pnpm run build',
          runner: 'pnpm',
          target: 'build',
          project: '@acme/app',
          rootCommand: 'pnpm run build',
          sessionId: 'session-1',
          customIdentifier: 'build',
        },
      });
      expect(JSON.stringify(plan.record)).not.toContain('SECRET_TOKEN');
      expect(JSON.stringify(plan.record)).not.toContain('tsc -p');
    });

    it('passes the session and the top-level invocation to the real shell', () => {
      const plan = planScript(env({ DEVFEEDBACK_SESSION_ID: undefined }), pkg);
      expect(plan.env.DEVFEEDBACK_SESSION_ID).toMatch(/[0-9a-f-]{36}/);
      expect(plan.env.DEVFEEDBACK_ROOT_COMMAND).toBe('pnpm run build');
      expect(plan.record?.event.sessionId).toBe(plan.env.DEVFEEDBACK_SESSION_ID);
    });

    it('reports the outermost invocation from a nested pnpm run', () => {
      const plan = planScript(
        env({
          npm_lifecycle_event: 'build:lib',
          DEVFEEDBACK_ROOT_COMMAND: 'pnpm run build',
        }),
        pkg,
      );
      expect(plan.record?.event.rootCommand).toBe('pnpm run build');
      expect(plan.record?.event.command).toBe('pnpm run build:lib');
      expect(plan.env.DEVFEEDBACK_ROOT_COMMAND).toBe('pnpm run build');
    });

    it('uses the per-repo phase override', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { phases: { e2e: 'test' } } }),
      );
      expect(
        planScript(env({ npm_lifecycle_event: 'e2e' }), pkg).record?.event.phase,
      ).toBe('test');
    });

    it('records an unmapped script as other', () => {
      expect(
        planScript(env({ npm_lifecycle_event: 'storybook:build' }), pkg).record?.event,
      ).toMatchObject({ phase: 'other', target: 'storybook:build' });
    });

    describe('skips, and leaves the environment untouched', () => {
      it.each([
        ['CI is set', { CI: 'true' }],
        ['not run by a package manager', { npm_lifecycle_event: undefined }],
        ['inside an Nx task', { NX_TASK_TARGET_PROJECT: 'app' }],
        [
          'a dependency lifecycle script',
          { npm_package_json: join('/repo', 'node_modules', 'esbuild', 'package.json') },
        ],
      ])('when %s', (_, overrides) => {
        const input = env(overrides);
        const plan = planScript(input, pkg);
        expect(plan.record).toBeUndefined();
        expect(plan.env).toBe(input);
      });

      it('when the cwd is inside node_modules', () => {
        const dep = join(root, 'node_modules', 'esbuild');
        mkdirSync(dep, { recursive: true });
        const plan = planScript(env({ npm_package_json: undefined }), dep);
        expect(plan.record).toBeUndefined();
      });
    });

    it('records CI runs when DEVFEEDBACK_CI=true', () => {
      expect(
        planScript(env({ CI: 'true', DEVFEEDBACK_CI: 'true' }), pkg).record,
      ).toBeDefined();
    });

    it.each(['dev', 'start', 'serve', 'watch', 'postinstall', 'prepare'])(
      'does not record %s but still passes the session on',
      (name) => {
        const plan = planScript(env({ npm_lifecycle_event: name }), pkg);
        expect(plan.record).toBeUndefined();
        expect(plan.env.DEVFEEDBACK_SESSION_ID).toBe('session-1');
      },
    );

    it('replaces the default skip list with the configured one', () => {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devfeedback: { skip: ['storybook'] } }),
      );
      expect(
        planScript(env({ npm_lifecycle_event: 'storybook' }), pkg).record,
      ).toBeUndefined();
      expect(planScript(env({ npm_lifecycle_event: 'start' }), pkg).record).toBeDefined();
    });
  });

  describe('realShellArgs', () => {
    const pnpm12 = { npm_config_user_agent: 'pnpm/12.10.1 npm/? node/? linux x64' };

    it.each(['/bin/sh', '/bin/bash', '/usr/bin/dash'])(
      'adds pnpm 12 SIGINT trap back for %s',
      (shell) => {
        expect(realShellArgs(['-c', 'echo hi'], shell, pnpm12)).toEqual([
          '-c',
          `${PNPM_SIGINT_TRAP}echo hi`,
        ]);
      },
    );

    it.each([
      [
        'pnpm 10',
        ['-c', 'echo hi'],
        '/bin/sh',
        { npm_config_user_agent: 'pnpm/10.18.0 npm/? node/v22 linux x64' },
      ],
      [
        'npm',
        ['-c', 'echo hi'],
        '/bin/sh',
        { npm_config_user_agent: 'npm/10.9.2 node/v22 linux x64' },
      ],
      ['an unverified shell', ['-c', 'echo hi'], '/bin/zsh', pnpm12],
      ['anything but -c <body>', ['-e', '-c', 'echo hi'], '/bin/sh', pnpm12],
      [
        'a body that already has it',
        ['-c', `${PNPM_SIGINT_TRAP}echo hi`],
        '/bin/sh',
        pnpm12,
      ],
    ])('leaves the arguments alone for %s', (_, args, shell, env) => {
      expect(realShellArgs(args, shell, env)).toBe(args);
    });
  });

  describe('finishing', () => {
    it.each([
      [0, null, 0, 'success'],
      [3, null, 3, 'failure'],
      [130, null, 130, 'aborted'],
      [null, 'SIGINT', 130, 'aborted'],
      [null, 'SIGTERM', 143, 'aborted'],
    ] as const)(
      'code %s signal %s → exitCode %s, %s',
      (code, signal, exitCode, outcome) => {
        expect(exitStatus(code, signal)).toBe(exitCode);
        expect(scriptOutcome(exitCode, signal)).toBe(outcome);
      },
    );

    it('builds the pending event', () => {
      const { record } = planScript(env(), pkg);
      const pending = finishScript(record!, null, 'SIGINT', 1234, 1700000000000);
      expect(pending).toMatchObject({
        exitCode: 130,
        success: false,
        outcome: 'aborted',
        signal: 'SIGINT',
        timeTaken: 1234,
        endedAt: 1700000000000,
      });
      expect(finishScript(record!, 0, null, 1)).not.toHaveProperty('signal');
    });
  });
});
