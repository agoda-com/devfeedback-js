---
'agoda-devfeedback-rsbuild': patch
---

`RspackBuildStatsPlugin` now accepts its custom identifier as a string, like the webpack and Vite plugins: `new RspackBuildStatsPlugin('my-build')`. Previously only `{ customIdentifier }` worked, and a string from plain JavaScript was silently dropped, so every event reported `npm_lifecycle_event` instead. The options-object form is unchanged.
