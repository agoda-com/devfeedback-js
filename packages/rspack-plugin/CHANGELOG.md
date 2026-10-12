# agoda-devfeedback-rsbuild

## 2.2.0

### Minor Changes

- ea4888e: Bootstrap chunk size budget for Rspack and Rsbuild, matching the Vite plugin. Production builds now report `bundleStats` (`bootstrapChunkSizeBytes`, `bootstrapChunkSizeLimitBytes`) for the chunk named `bootstrap`. Pass the limit with `new RspackBuildStatsPlugin({ bootstrapBundleSizeLimitKb })`, or with the new `rsbuildBuildStatsPlugin({ bootstrapBundleSizeLimitKb })` factory. The plain `RsbuildBuildStatsPlugin` still works and reports the size without a limit. Dev and watch builds don't report it.

  `agoda-devfeedback-common` adds `bundleStats?` to `RspackBuildData` and exports the shape as `BundleStats`. `ViteBundleStats` is kept as an alias.

- ea4888e: Raw Rspack (`RspackBuildStatsPlugin`) now reports what happens in the browser during `rspack serve`, as Vite and Rsbuild already do.

  In watch mode only, the plugin injects a small runtime module that connects back to it. That gives two new events:

  - a `command` event with `phase: 'clientready'` and `command: 'rspack watch'`, once per process, timed from the first `watchRun`, with `domContentLoadedMs` and `firstContentfulPaintMs`
  - a new event type, `rspackhmr`, on `RSPACK_ENDPOINT`: edit → hot update applied, timed from the rebuild's `watchRun`, one per rebuild

  HMR events (`rspackhmr` and Vite's `vitehmr`) are now sent without printing to the console, since they happen many times a session.

  Production and other one-off builds are untouched. `RspackBuildData['type']` gains `'rspackhmr'`; ingestion needs to accept the new type.

- 83413f6: Make the Vite and Rsbuild build-time metrics apples-to-apples.

  - **Vite production builds now measure the whole build.** The reported `timeTaken` was `buildEnd - buildStart`, and Rollup's `buildEnd` fires when the module graph is complete — before `renderChunk`, `generateBundle` and `writeBundle`. Minification and emitting assets were excluded: 18% of the build under esbuild, 64% under terser, on a 301-module project. It is now measured through `closeBundle`, matching what Rsbuild's `stats.endTime - stats.startTime` already covered. The transform phase is still reported, as a new `transformTimeMs` field, instead of being the headline number.
  - **Rsbuild now emits `phase: 'clientready'` as a `command` event**, timed from dev server start so it shares an origin with Vite's. It previously existed only as a `clientReady` entry inside `devFeedback[]`, timed with `performance.now()` — i.e. from page navigation, excluding everything before the browser opened the page — which was not comparable with Vite's number. The browser-relative values are unchanged and still in `devFeedback[]`, and are also attached to the new event as `domContentLoadedMs` / `firstContentfulPaintMs`.
  - **Vite's `prebundled` flag can now actually report `true`.** It compared the mtime of `node_modules/.vite/deps/_metadata.json` at `listening`, but dependency prebundling is triggered by the first browser request and has not run at that point — so it reported `false` on a warm cache and nothing on a cold one, never observing the cost it exists to measure. It is now sampled on the `clientready` report, and moves from the `devserver` event to the `clientready` event with it.

### Patch Changes

- ea4888e: `RspackBuildStatsPlugin` now accepts its custom identifier as a string, like the webpack and Vite plugins: `new RspackBuildStatsPlugin('my-build')`. Previously only `{ customIdentifier }` worked, and a string from plain JavaScript was silently dropped, so every event reported `npm_lifecycle_event` instead. The options-object form is unchanged.
- Updated dependencies [ea4888e]
- Updated dependencies [ea4888e]
- Updated dependencies [ea4888e]
- Updated dependencies [83413f6]
  - agoda-devfeedback-common@2.2.0

## 2.1.0

### Minor Changes

- 6da9ddd: Extend devfeedback from single compilations to the whole local dev cycle.

  - New `type: "command"` event with an `install`, `devserver` or `clientready` phase, posted to `COMMAND_ENDPOINT` (default `http://compilation-metrics/command`). Dev server ready time was previously never measured, because `closeBundle` does not fire in dev.
  - Every event now carries a `sessionId`, so install → dev server ready → first HMR correlate into one timeline. Purely additive; existing payloads are unchanged.
  - Install capture for npm, yarn and pnpm. Works with no repo change; a `preinstall`/`postinstall` pair in the consuming repo upgrades it to an exact span with a trustworthy `coldInstall` flag. Install events are spooled locally and delivered by the next dev server or build, so an install never waits on the network.
  - Aborted runs are recorded: Ctrl-C produces a `devserver` event with `signal` set, without changing what Ctrl-C does.
  - Rspack and Rsbuild events now post to `RSPACK_ENDPOINT` (`/rspack`) as the README always documented, instead of the webpack endpoint.
  - Off the critical path: 1500 ms POST timeout, git metadata cached until the repo actually changes instead of three `git` spawns per HMR event, `stats.toJson()` no longer serializes the whole compilation on every Rsbuild rebuild, and startup chatter moved behind `DEVFEEDBACK_DEBUG`.
  - Widened the Vite peer range to `>=4.0.0` (`rollup >=3.0.0`).

### Patch Changes

- Updated dependencies [6da9ddd]
  - agoda-devfeedback-common@2.1.0

## 2.0.9

### Patch Changes

- 6233d61: fix package.json entrypoints
- Updated dependencies [6233d61]
  - agoda-devfeedback-common@2.0.9

## 2.0.8

### Patch Changes

- f201db2: Optimize Rspack plugin
- Updated dependencies [f201db2]
  - agoda-devfeedback-common@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies [4a39731]
  - agoda-devfeedback-common@2.0.7
