/**
 * Install capture, in two roles decided by `--self`:
 *
 *  - bundled (`--self`): runs as this package's own postinstall, so every repo that
 *    depends on devfeedback gets install timing with no package.json change. Duration
 *    is inferred from the package manager's process start time, and the span ends when
 *    our package is linked rather than when the install finishes.
 *
 *  - root (no flag): runs as the consuming repo's postinstall, paired with the
 *    preinstall hook. Exact span, exact cold/warm flag. Whenever the preinstall marker
 *    is present the bundled role stands down so only one event is produced.
 *
 * The event is spooled, never sent: an install must never wait on the network, least of
 * all for an off-VPN developer.
 */
import { getCommonMetadata } from '../lib/common';
import {
  detectPackageManager,
  installRoot,
  lockfileHash,
  parentStartedAt,
} from '../lib/install';
import { getSessionId, readState, writeState } from '../lib/session';
import { spoolCommandData } from '../lib/spool';
import type { CommandBuildData } from '../lib/types';

/** a marker older than this belongs to an install that never finished */
const MARKER_TTL_MS = 60 * 60 * 1000;

const main = () => {
  const selfMode = process.argv.includes('--self');
  const root = installRoot();
  // read before priming the session: getSessionId writes state, and "no state at all"
  // is what tells us this was a cold install when there is no preinstall marker
  const prev = readState(root);
  // prime the session memo from the repo root before anything reads it via
  // getCommonMetadata — our own cwd is inside node_modules and would resolve elsewhere
  const sessionId = getSessionId(root);
  const now = Date.now();

  const marker =
    prev?.installStartedAt !== undefined && now - prev.installStartedAt < MARKER_TTL_MS
      ? prev
      : undefined;

  // the repo has its own hooks: let the root postinstall report the full install
  if (selfMode && marker?.expectRootPostinstall) return;

  const startedAt = marker?.installStartedAt ?? parentStartedAt(process.ppid, prev, root);
  if (!startedAt) return;

  const hash = lockfileHash(root);
  const before = marker?.preInstallLockfileHash ?? prev?.lockfileHash;
  const { packageManager, packageManagerVersion, userAgent } = detectPackageManager();

  const event: CommandBuildData = {
    ...getCommonMetadata(now - startedAt, 'install'),
    sessionId,
    type: 'command',
    phase: 'install',
    command: userAgent || 'install',
    exitCode: 0,
    success: true,
    packageManager,
    packageManagerVersion,
    coldInstall: marker?.installWasCold ?? prev === undefined,
    lockfileChanged: Boolean(before && hash !== before),
    measurementSource: marker ? 'preinstall' : 'postinstall',
  };

  spoolCommandData(event, root);

  const latest = readState(root);
  writeState(
    {
      ...(latest ?? { sessionId }),
      sessionId: latest?.sessionId ?? sessionId,
      lastSeenAt: now,
      lockfileHash: hash,
      installStartedAt: undefined,
      installWasCold: undefined,
      preInstallLockfileHash: undefined,
      expectRootPostinstall: undefined,
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
