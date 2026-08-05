---
'agoda-devfeedback-common': minor
'agoda-devfeedback-vite2': minor
'agoda-devfeedback-rsbuild': minor
---

Extend devfeedback from single compilations to the whole local dev cycle.

- New `type: "command"` event with an `install`, `devserver` or `clientready` phase, posted to `COMMAND_ENDPOINT` (default `http://compilation-metrics/command`). Dev server ready time was previously never measured, because `closeBundle` does not fire in dev.
- Every event now carries a `sessionId`, so install → dev server ready → first HMR correlate into one timeline. Purely additive; existing payloads are unchanged.
- Install capture for npm, yarn and pnpm. Works with no repo change; a `preinstall`/`postinstall` pair in the consuming repo upgrades it to an exact span with a trustworthy `coldInstall` flag. Install events are spooled locally and delivered by the next dev server or build, so an install never waits on the network.
- Aborted runs are recorded: Ctrl-C produces a `devserver` event with `signal` set, without changing what Ctrl-C does.
- Rspack and Rsbuild events now post to `RSPACK_ENDPOINT` (`/rspack`) as the README always documented, instead of the webpack endpoint.
- Off the critical path: 1500 ms POST timeout, git metadata cached until the repo actually changes instead of three `git` spawns per HMR event, `stats.toJson()` no longer serializes the whole compilation on every Rsbuild rebuild, and startup chatter moved behind `DEVFEEDBACK_DEBUG`.
- Widened the Vite peer range to `>=4.0.0` (`rollup >=3.0.0`).
