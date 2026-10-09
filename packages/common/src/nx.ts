/**
 * Nx plugin: one `command` event per task, cache hits included.
 *
 *   // nx.json
 *   { "plugins": ["agoda-devfeedback-common/nx"] }
 *
 * The hook runs while Nx is finishing, so events are spooled and a detached process
 * delivers them. Task output is never read.
 */
import { join } from 'node:path';
import { spawnFlusher } from './lib/flusher';
import { nxTaskEvents, type NxPostTasksExecutionContext } from './lib/nx-plugin';
import { getSessionId } from './lib/session';
import { readCommandConfig, workspaceRoot } from './lib/workspace';

export type { NxPostTasksExecutionContext, NxTaskResult } from './lib/nx-plugin';

export const name = 'agoda-devfeedback-common/nx';

export const postTasksExecution = async (
  _options: unknown,
  context: NxPostTasksExecutionContext,
): Promise<void> => {
  try {
    const root = context.workspaceRoot ?? workspaceRoot();
    const events = nxTaskEvents(context, readCommandConfig(root));
    if (events.length === 0) return;

    const sessionId = process.env.DEVFEEDBACK_SESSION_ID || getSessionId(root);
    // loaded only when there is something to record: plugin load stays cheap
    const [{ getCommonMetadata }, { spoolCommandData }] = await Promise.all([
      import('./lib/common'),
      import('./lib/spool'),
    ]);
    for (const { timeTaken, customIdentifier, endedAt, ...event } of events) {
      const metadata = getCommonMetadata(timeTaken, customIdentifier);
      spoolCommandData(
        {
          ...metadata,
          ...event,
          sessionId,
          ...(endedAt !== undefined
            ? { timestamp: endedAt, builtAt: new Date(endedAt).toISOString() }
            : {}),
        },
        root,
      );
    }
    spawnFlusher(join(__dirname, 'cli', 'flush.cjs'), root);
  } catch {
    /* telemetry must never throw, least of all into Nx */
  }
};
