---
'agoda-devfeedback-common': minor
'agoda-devfeedback-rsbuild': minor
---

Bootstrap chunk size budget for Rspack and Rsbuild, matching the Vite plugin. Production builds now report `bundleStats` (`bootstrapChunkSizeBytes`, `bootstrapChunkSizeLimitBytes`) for the chunk named `bootstrap`. Pass the limit with `new RspackBuildStatsPlugin({ bootstrapBundleSizeLimitKb })`, or with the new `rsbuildBuildStatsPlugin({ bootstrapBundleSizeLimitKb })` factory. The plain `RsbuildBuildStatsPlugin` still works and reports the size without a limit. Dev and watch builds don't report it.

`agoda-devfeedback-common` adds `bundleStats?` to `RspackBuildData` and exports the shape as `BundleStats`. `ViteBundleStats` is kept as an alias.
