/**
 * Root `preinstall` hook (the "Option A" install capture route).
 *
 *   "preinstall": "node ./node_modules/agoda-devfeedback-common/dist/hooks/preinstall.js || exit 0"
 *
 * This is the only way to get an exact install start time and a trustworthy cold/warm
 * flag, because it is the only code that runs before node_modules exists. It writes a
 * marker; the matching root postinstall hook turns that marker into an event.
 *
 * On a genuinely cold clone this file has not been installed yet, so the script fails
 * and `|| exit 0` swallows it — the bundled postinstall hook then falls back to the
 * package manager's process start time. Cold clones are still measured, just less
 * precisely.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { installRoot, lockfileHash } from '../lib/install';
import { getSessionId, readState, writeState } from '../lib/session';

const main = () => {
  const root = installRoot();
  const sessionId = getSessionId(root);
  const prev = readState(root);
  const now = Date.now();

  writeState(
    {
      ...(prev ?? {}),
      sessionId,
      lastSeenAt: now,
      installStartedAt: now,
      installWasCold: !existsSync(join(root, 'node_modules')),
      preInstallLockfileHash: lockfileHash(root),
      expectRootPostinstall: true,
    },
    root,
  );
};

// MUST NOT fail or slow the install under any circumstance
try {
  main();
} catch {
  /* ignore */
}
process.exitCode = 0;
