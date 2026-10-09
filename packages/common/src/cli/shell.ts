#!/usr/bin/env node
/**
 * `devfeedback-shell`: a pnpm `scriptShell` that runs the real shell and records the
 * script as a `command` event.
 *
 * pnpm spawns `<scriptShell> -c "<script body>"`. Every argument goes to the real shell
 * unchanged, with stdio, cwd and (apart from the session variables) env untouched, and
 * this process exits exactly as the real shell did: same code, or the same signal.
 *
 * Nothing on the way out waits for the network or even builds the full event: the
 * pending event is handed to a detached `cli/flush` process, which attaches metadata,
 * spools it and delivers it after the script has already returned.
 *
 * Keep this entry's imports light. Everything it loads is paid on every script run.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { spawnFlusher } from '../lib/flusher';
import {
  exitStatus,
  finishScript,
  planScript,
  realShellArgs,
  type ScriptPlan,
} from '../lib/script-shell';

const FORWARDED: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const realShell = process.env.DEVFEEDBACK_SHELL || '/bin/sh';

let args = process.argv.slice(2);
let plan: ScriptPlan = { env: process.env };
try {
  args = realShellArgs(args, realShell);
  plan = planScript();
} catch {
  /* telemetry must never stop the script from running */
}

const startedAt = performance.now();
const child = spawn(realShell, args, { stdio: 'inherit', env: plan.env });

const forwarders = FORWARDED.map((signal) => {
  const forward = () => {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  };
  process.on(signal, forward);
  return [signal, forward] as const;
});

child.on('error', (error) => {
  process.stderr.write(`devfeedback-shell: cannot run ${realShell}: ${error.message}\n`);
  process.exit(127);
});

child.on('exit', (code, signal) => {
  try {
    if (plan.record) {
      const pending = finishScript(
        plan.record,
        code,
        signal,
        performance.now() - startedAt,
      );
      spawnFlusher(join(__dirname, 'flush.cjs'), plan.record.root, pending);
    }
  } catch {
    /* telemetry must never change how the script ends */
  }

  for (const [s, forward] of forwarders) process.removeListener(s, forward);
  if (signal) {
    // terminate the way the shell did, so the package manager sees the same thing
    try {
      process.kill(process.pid, signal);
    } catch {
      /* fall through to the exit code */
    }
  }
  // a signal Node ignores by default (SIGPIPE) lands here: report it as a shell would
  process.exit(exitStatus(code, signal));
});
