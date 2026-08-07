---
'agoda-devfeedback-common': minor
'agoda-devfeedback-vite2': minor
'agoda-devfeedback-rsbuild': minor
---

Make the Vite and Rsbuild build-time metrics apples-to-apples.

- **Vite production builds now measure the whole build.** The reported `timeTaken` was `buildEnd - buildStart`, and Rollup's `buildEnd` fires when the module graph is complete — before `renderChunk`, `generateBundle` and `writeBundle`. Minification and emitting assets were excluded: 18% of the build under esbuild, 64% under terser, on a 301-module project. It is now measured through `closeBundle`, matching what Rsbuild's `stats.endTime - stats.startTime` already covered. The transform phase is still reported, as a new `transformTimeMs` field, instead of being the headline number.
- **Rsbuild now emits `phase: 'clientready'` as a `command` event**, timed from dev server start so it shares an origin with Vite's. It previously existed only as a `clientReady` entry inside `devFeedback[]`, timed with `performance.now()` — i.e. from page navigation, excluding everything before the browser opened the page — which was not comparable with Vite's number. The browser-relative values are unchanged and still in `devFeedback[]`, and are also attached to the new event as `domContentLoadedMs` / `firstContentfulPaintMs`.
- **Vite's `prebundled` flag can now actually report `true`.** It compared the mtime of `node_modules/.vite/deps/_metadata.json` at `listening`, but dependency prebundling is triggered by the first browser request and has not run at that point — so it reported `false` on a warm cache and nothing on a cold one, never observing the cost it exists to measure. It is now sampled on the `clientready` report, and moves from the `devserver` event to the `clientready` event with it.

Documented in the README that `clientready` is the cross-bundler dev-startup metric and `devserver` ("socket is up") is not comparable across bundlers.
