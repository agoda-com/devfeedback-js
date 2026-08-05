import { spoolCommandData } from './spool';
import type { CommandBuildData } from './types';

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

/**
 * Record an aborted run without changing what Ctrl-C does.
 *
 * Two traps this avoids. An async POST loses the race with process exit, so the event
 * is written synchronously to the spool instead. And merely attaching a SIGINT listener
 * suppresses Node's default exit behaviour — a plugin that only listens leaves the dev
 * server hanging — so once we have recorded the event we remove ourselves and, if
 * nobody else is listening, re-raise the signal to get the default action back.
 */
export const onAbort = (
  build: (signal: NodeJS.Signals) => CommandBuildData,
  root?: string,
): (() => void) => {
  const handlers: Partial<Record<NodeJS.Signals, () => void>> = {};

  const dispose = () => {
    for (const signal of SIGNALS) {
      const handler = handlers[signal];
      if (handler) process.removeListener(signal, handler);
      delete handlers[signal];
    }
  };

  for (const signal of SIGNALS) {
    const handler = () => {
      try {
        spoolCommandData(build(signal), root);
      } catch {
        /* telemetry must never throw, least of all on the way out */
      }
      dispose();
      if (process.listenerCount(signal) === 0) {
        // we were the only listener, so restore the default action
        process.kill(process.pid, signal);
      }
    };
    handlers[signal] = handler;
    process.once(signal, handler);
  }

  return dispose;
};
