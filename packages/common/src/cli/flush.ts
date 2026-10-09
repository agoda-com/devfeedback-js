#!/usr/bin/env node
/**
 * Detached delivery for the command emitters: `node flush.cjs <root>`.
 *
 * Attaches metadata to a pending event handed over in `DEVFEEDBACK_PENDING_EVENT`
 * (if any), spools it, then delivers everything in the spool. Going through the spool
 * rather than sending directly means one delivery path, and an event whose flusher
 * never got to run is picked up by the next devfeedback process.
 */
import { getCommonMetadata } from '../lib/common';
import { PENDING_ENV, type PendingCommand } from '../lib/flusher';
import { flushSpool, spoolCommandData } from '../lib/spool';

const main = async () => {
  const root = process.argv[2] ?? process.cwd();
  const raw = process.env[PENDING_ENV];
  if (raw) {
    try {
      const { endedAt, timeTaken, customIdentifier, ...event } = JSON.parse(
        raw,
      ) as PendingCommand;
      spoolCommandData(
        {
          ...getCommonMetadata(timeTaken, customIdentifier),
          ...event,
          timestamp: endedAt,
          builtAt: new Date(endedAt).toISOString(),
        },
        root,
      );
    } catch {
      /* malformed hand-over: drop it */
    }
  }
  await flushSpool(root);
};

main().catch(() => {
  /* telemetry must never throw */
});
