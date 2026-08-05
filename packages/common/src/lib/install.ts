import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSessionId, writeState, type SessionState } from './session';
import type { PackageManager } from './types';

/** npm, yarn and pnpm are all in scope, so every lockfile shape counts. */
export const LOCKFILES: Record<string, PackageManager> = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'yarn.lock': 'yarn',
};

/**
 * Hash of whichever lockfile this repo uses. Repos with more than one (a yarn.lock
 * left behind after a pnpm migration, say) hash all of them so either changing counts.
 */
export const lockfileHash = (root: string): string | undefined => {
  const hash = createHash('sha1');
  let found = false;
  for (const name of Object.keys(LOCKFILES)) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    try {
      hash.update(name).update(readFileSync(p));
      found = true;
    } catch {
      /* unreadable lockfile: treat as absent */
    }
  }
  return found ? hash.digest('hex').slice(0, 16) : undefined;
};

/**
 * Every supported package manager sets npm_config_user_agent, e.g.
 * "pnpm/9.0.0 npm/? node/v20.11.0 linux x64".
 */
export const detectPackageManager = (): {
  packageManager?: PackageManager;
  packageManagerVersion?: string;
  userAgent: string;
} => {
  const userAgent = process.env.npm_config_user_agent ?? '';
  const [name, version] = userAgent.split(' ')[0]?.split('/') ?? [];
  const known: PackageManager[] = ['npm', 'yarn', 'pnpm'];
  return {
    packageManager: known.includes(name as PackageManager)
      ? (name as PackageManager)
      : undefined,
    packageManagerVersion: version,
    userAgent,
  };
};

/**
 * A missing install duration is fine; a slow install is not. Every platform gets the
 * same tight budget.
 */
const BUDGET_MS = 500;

const winStartedAt = (
  pid: number,
  prev?: SessionState,
  root?: string,
): number | undefined => {
  const method = prev?.winProcTimeMethod;
  if (method === 'none') return undefined; // this machine has already told us it can't

  const remember = (m: SessionState['winProcTimeMethod']) =>
    writeState(
      {
        ...(prev ?? { sessionId: getSessionId(root), lastSeenAt: Date.now() }),
        winProcTimeMethod: m,
      },
      root,
    );

  // wmic is deprecated and absent from Windows 11 24H2 / Server 2025, but when it is
  // missing the spawn fails with ENOENT in single-digit milliseconds — far cheaper
  // than PowerShell's CLR startup on the machines that still have it.
  if (method !== 'powershell') {
    try {
      const out = execFileSync(
        'wmic',
        ['process', 'where', `processid=${pid}`, 'get', 'creationdate', '/value'],
        { encoding: 'utf8', timeout: BUDGET_MS, windowsHide: true },
      );
      const m = /CreationDate=(\d{14})/.exec(out);
      if (m?.[1]) {
        const s = m[1];
        remember('wmic');
        return Date.parse(
          `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`,
        );
      }
    } catch {
      /* removed in 24H2+, or blocked — fall through */
    }
  }

  if (method === 'wmic') return undefined; // wmic worked before and failed now: don't escalate

  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`,
      ],
      { encoding: 'utf8', timeout: BUDGET_MS, windowsHide: true },
    );
    remember('powershell');
    return Number(BigInt(out.trim()) / 10000n) - 11644473600000; // FILETIME → epoch ms
  } catch {
    remember('none'); // pay this once per machine, never again
    return undefined;
  }
};

/** wall-clock start of the package manager process that invoked us */
export const parentStartedAt = (
  pid: number,
  prev?: SessionState,
  root?: string,
): number | undefined => {
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
      const btime = Number(
        /btime (\d+)/.exec(readFileSync('/proc/stat', 'utf8'))?.[1] ?? 0,
      );
      if (!btime || !Number.isFinite(ticks)) return undefined;
      return (btime + ticks / 100) * 1000; // USER_HZ is 100 on mainstream builds
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: BUDGET_MS,
      });
      const parsed = new Date(out.trim()).getTime();
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return winStartedAt(pid, prev, root);
  } catch {
    return undefined;
  }
};

/** The repo the package manager was invoked in, not the package we happen to live in. */
export const installRoot = (): string => process.env.INIT_CWD ?? process.cwd();
