/**
 * Runs the **built** wrapper (`dist/cli/shell.cjs`, produced by `pnpm build`, which
 * turbo runs before `test`) against a real shell, and checks the one promise that
 * matters most: a script ends exactly the same way with or without the wrapper.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { PNPM_SIGINT_TRAP } from '../lib/script-shell';

const WRAPPER = resolve(__dirname, '../../dist/cli/shell.cjs');

interface Ended {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
}

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string) =>
  new Promise<Ended>((done, fail) => {
    const child = spawn(cmd, args, { env, cwd, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', fail);
    child.on('close', (code, signal) => done({ code, signal, stdout }));
  });

const bare = { PATH: process.env.PATH } as NodeJS.ProcessEnv;

describe.skipIf(process.platform === 'win32')('devfeedback-shell (built)', () => {
  beforeAll(() => {
    if (!existsSync(WRAPPER)) {
      throw new Error(`${WRAPPER} is missing: run \`pnpm build\` first`);
    }
  });

  const both = async (script: string, env: NodeJS.ProcessEnv = bare) => ({
    plain: await run('/bin/sh', ['-c', script], env),
    wrapped: await run(process.execPath, [WRAPPER, '-c', script], env),
  });

  it('passes an exit code through unchanged', async () => {
    const { plain, wrapped } = await both('exit 3');
    expect(plain).toEqual({ code: 3, signal: null, stdout: '' });
    expect(wrapped).toEqual(plain);
  });

  it('passes a signal death through unchanged', async () => {
    const { plain, wrapped } = await both('kill -INT $$');
    expect(plain.signal).toBe('SIGINT');
    expect(wrapped).toEqual(plain);
  });

  it('passes stdout and arguments through unchanged', async () => {
    const { plain, wrapped } = await both('echo "$0 hello"; exit 0');
    expect(wrapped).toEqual(plain);
  });

  it('keeps pnpm 12 SIGINT trap, which pnpm drops for a custom scriptShell', async () => {
    const pnpm12 = {
      ...bare,
      npm_config_user_agent: 'pnpm/12.10.1 npm/? node/? linux x64',
    };
    const script = 'kill -INT $$; echo survived';
    // what pnpm 12 runs when there is no wrapper
    const plain = await run('/bin/sh', ['-c', PNPM_SIGINT_TRAP + script], pnpm12);
    const wrapped = await run(process.execPath, [WRAPPER, '-c', script], pnpm12);
    expect(plain).toEqual({ code: 0, signal: null, stdout: 'survived\n' });
    expect(wrapped).toEqual(plain);
  });

  it('forwards SIGTERM to the script', async () => {
    const child = spawn(
      process.execPath,
      [WRAPPER, '-c', 'trap "exit 42" TERM; sleep 5 & wait'],
      {
        env: bare,
        stdio: 'ignore',
      },
    );
    await new Promise((r) => setTimeout(r, 300));
    child.kill('SIGTERM');
    const code = await new Promise((r) => child.on('close', (c) => r(c)));
    expect(code).toBe(42);
  });

  describe('recording', () => {
    let server: Server;
    let received: Record<string, unknown>[];
    let root: string;
    let pkg: string;

    beforeAll(async () => {
      received = [];
      server = createServer((req, res) => {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => {
          received.push(JSON.parse(body));
          res.end('{}');
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      root = mkdtempSync(join(tmpdir(), 'devfeedback-wrapper-'));
      writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: ["packages/*"]\n');
      writeFileSync(join(root, 'package.json'), '{}');
      pkg = join(root, 'packages', 'app');
      mkdirSync(pkg, { recursive: true });
    });

    afterAll(() => {
      server.close();
      rmSync(root, { recursive: true, force: true });
    });

    const pnpmEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
      ...bare,
      HOME: process.env.HOME,
      COMMAND_ENDPOINT: `http://127.0.0.1:${(server.address() as AddressInfo).port}/command`,
      npm_lifecycle_event: 'test:unit',
      npm_lifecycle_script: 'vitest --token=SECRET_TOKEN',
      npm_package_name: '@acme/app',
      npm_package_json: join(pkg, 'package.json'),
      npm_config_user_agent: 'pnpm/10.18.0 npm/? node/v22.14.0 linux x64',
      ...extra,
    });

    const waitFor = async (n: number) => {
      for (let i = 0; i < 100 && received.length < n; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    it('delivers one command event per script, with no script body', async () => {
      const ended = await run(
        process.execPath,
        [WRAPPER, '-c', 'echo "session=$DEVFEEDBACK_SESSION_ID"; exit 3'],
        pnpmEnv(),
        pkg,
      );
      expect(ended.code).toBe(3);
      const sessionId = /session=(\S+)/.exec(ended.stdout)?.[1];
      expect(sessionId).toMatch(/[0-9a-f-]{36}/);

      await waitFor(1);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        type: 'command',
        phase: 'test',
        command: 'pnpm run test:unit',
        target: 'test:unit',
        project: '@acme/app',
        runner: 'pnpm',
        rootCommand: 'pnpm run test:unit',
        exitCode: 3,
        success: false,
        outcome: 'failure',
        sessionId,
        customIdentifier: 'test:unit',
      });
      expect(JSON.stringify(received[0])).not.toContain('SECRET_TOKEN');
    });

    it('records nothing with CI set', async () => {
      const before = received.length;
      const ended = await run(
        process.execPath,
        [WRAPPER, '-c', 'exit 0'],
        pnpmEnv({ CI: 'true' }),
        pkg,
      );
      expect(ended.code).toBe(0);
      await new Promise((r) => setTimeout(r, 1000));
      expect(received.length).toBe(before);
    });
  });
});
