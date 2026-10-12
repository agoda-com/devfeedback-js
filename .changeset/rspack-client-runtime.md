---
'agoda-devfeedback-rsbuild': minor
'agoda-devfeedback-common': minor
---

Raw Rspack (`RspackBuildStatsPlugin`) now reports what happens in the browser during `rspack serve`, as Vite and Rsbuild already do.

In watch mode only, the plugin injects a small runtime module that connects back to it. That gives two new events:

- a `command` event with `phase: 'clientready'` and `command: 'rspack watch'`, once per process, timed from the first `watchRun`, with `domContentLoadedMs` and `firstContentfulPaintMs`
- a new event type, `rspackhmr`, on `RSPACK_ENDPOINT`: edit → hot update applied, timed from the rebuild's `watchRun`, one per rebuild

HMR events (`rspackhmr` and Vite's `vitehmr`) are now sent without printing to the console, since they happen many times a session.

Production and other one-off builds are untouched. `RspackBuildData['type']` gains `'rspackhmr'`; ingestion needs to accept the new type.
