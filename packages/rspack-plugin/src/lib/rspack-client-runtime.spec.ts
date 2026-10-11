import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { clientRuntimeSource } from './rspack-client-runtime';

class FakeWebSocket {
  static last: FakeWebSocket;
  readyState = 0;
  sent: unknown[] = [];
  private listeners: Record<string, () => void> = {};
  constructor() {
    FakeWebSocket.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  open() {
    this.readyState = 1;
    this.listeners.open?.();
  }
}

/** Runs the runtime and returns a way to report one finished hot update. */
const startRuntime = () => {
  const interceptors: Array<(options: unknown) => void> = [];
  runInNewContext(clientRuntimeSource(1234), {
    window: { addEventListener: () => {} },
    document: { readyState: 'loading' },
    location: { hostname: 'localhost' },
    performance: { now: () => 0, getEntriesByType: () => [] },
    PerformanceObserver: class {
      observe() {}
      disconnect() {}
    },
    WebSocket: FakeWebSocket,
    __webpack_require__: { i: interceptors },
  });

  let statusHandler: (status: string) => void = () => {};
  const options = {
    factory: () => {},
    module: {
      hot: { addStatusHandler: (h: (status: string) => void) => (statusHandler = h) },
    },
  };
  interceptors[0]?.(options);
  options.factory();

  return () => {
    statusHandler('apply');
    statusHandler('idle');
  };
};

describe('rspack client runtime', () => {
  it('sends a hot update applied while connected', () => {
    const hmrApplied = startRuntime();
    FakeWebSocket.last.open();
    hmrApplied();
    expect(FakeWebSocket.last.sent).toEqual([{ type: 'hmrApplied' }]);
  });

  it('queues at most 10 messages while the socket is connecting', () => {
    const hmrApplied = startRuntime();
    for (let i = 0; i < 25; i++) hmrApplied();
    FakeWebSocket.last.open();
    expect(FakeWebSocket.last.sent).toHaveLength(10);
  });
});
