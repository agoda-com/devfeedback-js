/**
 * The browser half of `RspackBuildStatsPlugin`, injected as a runtime module in watch
 * mode. It runs inside the webpack-style bootstrap, outside any module, and is not
 * transpiled, so it is written as plain ES5.
 *
 * It sends two messages, and nothing else:
 *  - `clientReady` once per page load, after `load` and first contentful paint (or
 *    5 s after `load` without one), the same shape the Rsbuild plugin sends.
 *  - `hmrApplied` each time a hot update finishes applying (status `apply` → `idle`).
 *
 * It carries no timestamps for the HMR span: the plugin times that against its own
 * `watchRun`, because a value baked into this code at generation time goes stale when
 * the runtime module is not regenerated on a rebuild.
 *
 * `module` is not bound inside a runtime module, so `module.hot` cannot be reached
 * directly. Instead an interceptor on `__webpack_require__.i` (present only when HMR
 * is enabled) picks up the first module's `hot` object; status handlers are shared by
 * every module, so one registration covers the whole runtime. The check runs when the
 * module factory is called, after every interceptor (including the HMR runtime's own,
 * which creates `module.hot`) has had its turn.
 */
export const clientRuntimeSource = (port: number): string => `
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof WebSocket === 'undefined') return;
  try {
    var queue = [];
    var socket = new WebSocket('ws://' + location.hostname + ':${port}');
    var send = function (msg) {
      try {
        if (socket.readyState === 1) socket.send(JSON.stringify(msg));
        else if (socket.readyState === 0) queue.push(msg);
      } catch (e) {}
    };
    socket.addEventListener('open', function () {
      while (queue.length) send(queue.shift());
    });
    socket.addEventListener('error', function () {});

    // This runs during bootstrap, before anything has painted, and paint entries are
    // only recorded some time after the frame. Report once the page has loaded and
    // first-contentful-paint is known, or give up waiting for the paint after a while.
    var loaded = false;
    var fcp;
    var reported = false;
    var report = function (force) {
      if (reported || !loaded || (fcp === undefined && !force)) return;
      reported = true;
      var nav = performance.getEntriesByType('navigation')[0];
      send({
        type: 'clientReady',
        elapsedMs: performance.now(),
        domContentLoaded: nav && nav.domContentLoadedEventEnd,
        firstContentfulPaint: fcp
      });
    };
    try {
      var observer = new PerformanceObserver(function (list) {
        var entries = list.getEntriesByName('first-contentful-paint');
        if (!entries.length) return;
        fcp = entries[0].startTime;
        observer.disconnect();
        report(false);
      });
      observer.observe({ type: 'paint', buffered: true });
    } catch (e) {}
    var onLoad = function () {
      loaded = true;
      report(false);
      setTimeout(function () { report(true); }, 5000);
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);

    var interceptors = __webpack_require__.i;
    if (!interceptors || typeof interceptors.push !== 'function') return;
    var attached = false;
    var previous = 'idle';
    interceptors.push(function (options) {
      if (attached || !options || typeof options.factory !== 'function') return;
      var factory = options.factory;
      options.factory = function () {
        var result = factory.apply(this, arguments);
        var hot = !attached && options.module && options.module.hot;
        if (hot && typeof hot.addStatusHandler === 'function') {
          attached = true;
          hot.addStatusHandler(function (status) {
            if (status === 'idle' && previous === 'apply') send({ type: 'hmrApplied' });
            previous = status;
          });
        }
        return result;
      };
    });
  } catch (e) {}
})();
`;
