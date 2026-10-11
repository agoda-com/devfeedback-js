# agoda-devfeedback: Your JavaScript Build's Personal Trainer 🏋️‍♂️

Welcome to agoda-devfeedback, the JavaScript/TypeScript package collection that's about to make your builds faster than a caffeinated squirrel on a sugar rush! We're here to collect metrics that relate to developers' experience, because who doesn't love a good statistic about how long they've been waiting for their build to finish?

## The F5 Experience: Because Waiting is So Last Year

What is the F5 Experience? Have a read [here](https://beerandserversdontmix.com/2024/08/15/an-introduction-to-the-f5-experience/)

Remember, we're all about that F5 Experience here at agoda-devfeedback. Our goal is to make your development process smoother than a JavaScript promise chain. Here's what that means for you:

1. **Setup Should Be a Breeze**: You should be able to install these packages and get metrics faster than you can say "npm install".
2. **Fast Feedback Loop**: We want your builds to be so fast, you'll forget what you were working on by the time they finish. (Okay, maybe not that fast, but you get the idea.)

## Build Time (Compilation Time): Because Life's Too Short for Slow Builds

This collection supports collecting build time (compilation time) metrics across multiple bundlers:

- Webpack (4.x or 5.x)
- Vite (4.x and up, including 6.x and Rolldown-based builds)
- Rspack/Rsbuild (1.x)
 
It's like a stopwatch for your builds, but cooler, and now with more bundlers! 🎮

### Consuming the data

The data is sent to the following default endpoints (customizable via environment variables):

| Bundler                       | Default                                | Environment Variable Override | Post Data Example                   |
| ----------------------------- | -------------------------------------- | ----------------------------- | ----------------------------------- |
| WebPack                       | "<http://compilation-metrics/webpack>" | WEBPACK_ENDPOINT              | [click here](examples/webpack.json) |
| Vite                          | "<http://compilation-metrics/vite>"    | VITE_ENDPOINT                 | [click here](examples/vite.json)    |
| Rspack                        | "<http://compilation-metrics/rspack>"  | RSPACK_ENDPOINT               | [click here](examples/rspack.json)  |
| Lifecycle (`type: "command"`) | "<http://compilation-metrics/command>" | COMMAND_ENDPOINT              | [click here](examples/command.json) |

> **Heads up:** Rspack and Rsbuild events used to be posted to the _webpack_ endpoint despite the table above. They now go to `/rspack` as documented. If your dashboards were reading them off the webpack endpoint, point them at `/rspack` (or set `RSPACK_ENDPOINT` back to the webpack URL during the transition).

### Basic Usage: Easy as Pie (Mmm... pie 🥧)

First, let's get this party started. Install the package for your bundler of choice:

```bash
# For Webpack
npm install --save-dev agoda-devfeedback-webpack

# For Vite
npm install --save-dev agoda-devfeedback-vite2

# For Rspack/Rsbuild
npm install --save-dev agoda-devfeedback-rsbuild
```

Pro tip: When an error happens, the package will write the error message to `devfeedback.log` in your current working directory. You might want to add this to `.gitignore`, unless you want your repo to know about all your build failures. We won't judge.

#### For Webpack Wizards 🧙‍♂️

If you're using **Webpack**, sprinkle this magic into your `webpack.config.js`:

```javascript
const { WebpackBuildStatsPlugin } = require('agoda-devfeedback-webpack');
module.exports = {
  // ... your other awesome config stuff ...
  plugins: [
    // ... your other cool plugins ...
    new WebpackBuildStatsPlugin(),
  ],
};
```

#### For Vite Virtuosos 🎻

If **Vite** is your jam, add this to your `vite.config.js`:

```javascript
import { viteBuildStatsPlugin } from 'agoda-devfeedback-vite2';
export default defineConfig({
  // ... your brilliant config options ...
  plugins: [
    // ... your other fantastic plugins ...
    viteBuildStatsPlugin(),
  ],
});
```

#### For Rspack Rockstars 🎸

If you're rocking with **Rspack/Rsbuild**, add this to your `rsbuild.config.js`:

```javascript
import { RsbuildBuildStatsPlugin } from 'agoda-devfeedback-rsbuild';
export default {
  // ... your awesome config options ...
  plugins: [
    // ... your other amazing plugins ...
    RsbuildBuildStatsPlugin,
  ],
};
```

Using **raw Rspack** (`@rspack/cli`, `rspack serve`) without Rsbuild? Add the plugin to your `rspack.config.js` instead:

```javascript
const { RspackBuildStatsPlugin } = require('agoda-devfeedback-rsbuild');
module.exports = {
  // ... your config ...
  plugins: [new RspackBuildStatsPlugin()],
};
```

### Advanced Usage: For the Overachievers 🏆

All plugins accept a custom identifier for your builds. It's like a name tag for your builds! By default, they'll use your npm script name (like `yarn dev` or `yarn build`).

But if you want to be fancy:

```javascript
// Webpack
new WebpackBuildStatsPlugin('production-build-deluxe');

// Vite
viteBuildStatsPlugin('vite-build-extraordinaire');

// Raw Rspack (rspack.config.js) — positional, or as an options object
new RspackBuildStatsPlugin('rspack-build-supreme');
new RspackBuildStatsPlugin({ customIdentifier: 'rspack-build-supreme' });
```

The Rsbuild plugin always uses the npm script name.

Want to track bootstrap chunk sizes? We've got you covered! Pass a size limit (in KB) and production builds report `bundleStats` for the chunk named `bootstrap` (Vite, Rspack and Rsbuild):

```javascript
// Vite: the second parameter
viteBuildStatsPlugin('vite-build-extraordinaire', 1000); // 1 mega byte

// Raw Rspack: an option
new RspackBuildStatsPlugin({ bootstrapBundleSizeLimitKb: 1000 });

// Rsbuild: use the factory instead of the plain plugin
import { rsbuildBuildStatsPlugin } from 'agoda-devfeedback-rsbuild';
plugins: [rsbuildBuildStatsPlugin({ bootstrapBundleSizeLimitKb: 1000 })];
```

`bootstrapChunkSizeBytes` is the size of the chunk's emitted JavaScript, and `bootstrapChunkSizeLimitBytes` is the limit you passed, in bytes. The size is reported without a limit too, and is left out when there is no `bootstrap` chunk. Rspack and Rsbuild only report it for production builds, since dev chunk sizes say nothing about the budget. See [examples/rspack.json](examples/rspack.json).

## The Whole Dev Cycle, Not Just The Compile

A compile time is one number out of the several a developer actually waits through. Between `git pull` and a working app there is an install, a dev server start, and a browser that has to finish booting. Vite and Rspack/Rsbuild now report all of them.

These arrive as a new event type, `type: "command"`, on the `COMMAND_ENDPOINT`:

| `phase`       | What it measures                                                                                                                   | Emitted by                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `install`     | The package manager run, plus cold/warm and whether the lockfile changed                                                           | install hooks (npm, yarn, pnpm) |
| `devserver`   | Time until the dev server is listening — the number that was previously never measured, because `closeBundle` does not fire in dev | Vite, Rsbuild, Rspack watch     |
| `clientready` | Time until the app is usable in the browser, with DOMContentLoaded and first contentful paint                                      | Vite, Rsbuild, Rspack watch     |
| `codegen`, `typecheck`, `lint`, `test`, `build`, `other` | A package script or task-runner task, see [Package scripts and task runners](#package-scripts-and-task-runners) | pnpm script-shell wrapper, Nx plugin |

Aborted runs count too: Ctrl-C on a dev server produces a `devserver` event with `success: false` and `signal: "SIGINT"`. A developer who gave up waiting is the most interesting data point on the chart.

### Raw Rspack in watch mode

`RspackBuildStatsPlugin` only sees compiler hooks, not the dev server, so its spans are anchored on the compiler. All of them carry `command: "rspack watch"`, which is how a dashboard tells them apart from the Vite and Rsbuild numbers.

- **`devserver`** runs from the first `watchRun` to the first completed compile. Unlike Vite and Rsbuild, which stop the clock when the server is listening, it **includes the first compile**: under `rspack serve` the server is not usable until that compile is done anyway, but don't put the two on one axis without a filter.
- **`clientready`** runs from the same first `watchRun` until the browser has loaded the page and painted, with `domContentLoadedMs` and `firstContentfulPaintMs` as detail. Once per process: reloads and extra tabs are not new dev server starts.
- **`rspackhmr`** (a separate event type on `RSPACK_ENDPOINT`, like Vite's `vitehmr`): edit → hot update applied in the browser, timed from the rebuild's `watchRun`. One per rebuild, however many tabs are open, carrying that rebuild's `compilationHash`. Sent without printing anything, like `vitehmr`. [Example](examples/rspackhmr.json).

To report back, the plugin adds a small runtime module to the bundle, **in watch mode only**: production, one-off and child compilations are untouched. It connects to `ws://<page hostname>:<random port>`, so it also works when the dev server runs on a remote machine, as long as that port is reachable. No HMR (`hot: false`) means no `rspackhmr` events; `clientready` still works.

### Session correlation

Every event — including the existing `webpack`, `vite`, `vitehmr`, `rspack` and `rsbuild` payloads — now carries a `sessionId`, so install → dev server ready → first HMR stitch into one timeline. It is purely additive; nothing that existed changed shape.

The session id is resolved with zero setup: a small state file under `node_modules/.cache/devfeedback` (or a tmpdir, before `node_modules` exists) that rolls over after four idle hours. If you want exact session boundaries, set one yourself and it wins:

```bash
export DEVFEEDBACK_SESSION_ID=$(uuidgen)
```

### Install timing

Two tiers, and the first one needs nothing from you.

**Default — no repo change.** `agoda-devfeedback-common` runs its own `postinstall` hook, which infers the install duration from the package manager's process start time. The span ends when our package is linked rather than when the whole install finishes, so it undercounts a little.

**Exact — two lines in the consuming repo.** Add both hooks and you get the true install span, plus a trustworthy cold/warm flag on a fresh clone:

```json
{
  "scripts": {
    "preinstall": "node -e \"try{require('agoda-devfeedback-common/hooks/preinstall')}catch(e){}\"",
    "postinstall": "node -e \"try{require('agoda-devfeedback-common/hooks/postinstall')}catch(e){}\""
  },
  "devDependencies": {
    "agoda-devfeedback-common": "^2.0.0"
  }
}
```

Add `agoda-devfeedback-common` as a direct devDependency for this tier — under pnpm a transitive dependency is not resolvable from the repo root. When these hooks are present the bundled one stands down, so you get one event, not two. On a genuinely cold clone the `preinstall` file does not exist yet, the `try/catch` swallows it, and the bundled hook falls back to process start time — cold clones are still measured, just less precisely.

Known gaps, so nobody is surprised:

- Install events are **spooled, not sent**. An install must never wait on the network, so events are written to a small local NDJSON file and delivered by the next dev server or build start. `spooledAt` tells you the delivery was deferred. Nobody watches an install dashboard in real time.
- `--ignore-scripts` skips everything here.
- **pnpm blocks dependency lifecycle scripts by default.** Allow `agoda-devfeedback-common` in one of two places:
  - **In the repo** (recommended for monorepos that already keep a build allowlist): add it to the allowlist in `pnpm-workspace.yaml`, or in the `pnpm` field of the root `package.json`. Every clone then works without a bootstrap step.
    ```yaml
    # pnpm-workspace.yaml, newer pnpm
    allowBuilds:
      agoda-devfeedback-common: true
    ```
    ```yaml
    # pnpm-workspace.yaml, pnpm 10 and earlier
    onlyBuiltDependencies:
      - agoda-devfeedback-common
    ```
    ```jsonc
    // root package.json, pnpm 10 and earlier
    "pnpm": { "onlyBuiltDependencies": ["agoda-devfeedback-common"] }
    ```
  - **Per machine**, once during dev machine bootstrap, in `~/.config/pnpm/config.yaml`, so repos stay untouched:
    ```yaml
    allowBuilds:
      agoda-devfeedback-common: true
    ```
    (pnpm 10 and earlier call this `onlyBuiltDependencies`.)
- npm only: with `timing=true` in `.npmrc`, npm's own per-phase timers are scraped from `~/.npm/_logs/*-timing.json` and attached as `npmTimers`. That is where you find out a Playwright browser download or a `node-gyp` rebuild is what actually costs you three minutes.

### Package scripts and task runners

The bundler plugins only see the bundler. Typecheck, lint, test, codegen and every other package script run around it, so `agoda-devfeedback-common` ships two more emitters for those. Both produce `command` events that share the `sessionId`, the spool and the transport with everything else.

**pnpm: every `pnpm run <script>` (pnpm ≥ 10.13, macOS and Linux).** `devfeedback-shell` is a `scriptShell` that runs the real shell (`/bin/sh`) and records the script. Wire it up in `.pnpmfile.cjs`, with `agoda-devfeedback-common` as a root devDependency:

```js
// .pnpmfile.cjs
try { module.exports = require('agoda-devfeedback-common/pnpmfile').pnpmfile(__dirname); } catch { module.exports = {}; }
```

`hooks.updateConfig` runs on every pnpm command and sets `scriptShell` to the absolute path of the wrapper only once it is installed, so a cold clone's first `pnpm install` runs exactly as before. Don't put `script-shell=./node_modules/.bin/devfeedback-shell` in `.npmrc`: that path doesn't exist on a fresh clone and breaks the install itself. If your pnpmfile already has hooks, compose `devfeedbackUpdateConfig(__dirname)` from the same module into your own `updateConfig`.

**Nx: every task, cache hits included (Nx ≥ 20.4).** Register the plugin in `nx.json`; it uses `postTasksExecution` and needs no dependency on `nx` beyond the one you already have:

```json
{ "plugins": ["agoda-devfeedback-common/nx"] }
```

Scripts that Nx runs are recorded by the Nx plugin, not the wrapper, so nothing is counted twice. A `pnpm build` that runs `nx run-many -t build` gives one `pnpm run build` event for the whole run and one `nx run build` event per project, all with `rootCommand: "pnpm run build"`.

What each event adds to the usual `command` fields:

| Field         | Example                     | Meaning                                                                             |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `phase`       | `test`                      | From the script or target name, see below                                           |
| `target`      | `test:unit`                 | Script or task-runner target name                                                   |
| `project`     | `@acme/web`                 | Workspace package or Nx project. `projectName` stays the repo                       |
| `runner`      | `pnpm`, `nx`                | What ran it                                                                         |
| `command`     | `pnpm run test:unit`        | Built from the runner and the target                                                |
| `rootCommand` | `nx run-many -t build,test` | The top-level invocation, for nested `pnpm run` calls and Nx tasks                  |
| `outcome`     | `cache`                     | `success`, `failure`, `aborted` (signal or exit 130, so a script that exits 130 on purpose counts too), `cache` (Nx cache hit), `skipped` |
| `runId`       | `1481533057…`               | Nx only: one per Nx invocation                                                      |
| `exitCode`, `signal` |                      | `130` and `SIGINT` for Ctrl-C                                                       |

Phases come from the name: `typecheck`/`type-check`/`tsc`/`check-types` → `typecheck`, `lint`/`eslint`/`lint:*` → `lint`, `test`/`test:*`/`vitest`/`jest` → `test`, `build`/`build:*` → `build`, `codegen`/`generate`/`gen:*` → `codegen`, anything else → `other` with the name in `target`. Override it per repo in the root `package.json`:

```json
{
  "devfeedback": {
    "phases": { "e2e": "test", "openapi": "codegen" },
    "skip": ["dev", "start", "serve", "watch", "storybook"]
  }
}
```

`skip` replaces the default list, which is `dev`, `start`, `serve` and `watch`: a long-running command's duration is the length of the session, not a measurement, and dev server time-to-ready already comes from the bundler plugins. A skipped script still passes `DEVFEEDBACK_SESSION_ID` on, so the dev server it starts joins the session. Nx continuous tasks are skipped for the same reason. Install lifecycle scripts (`preinstall`, `postinstall`, `prepare`, …) are part of the `install` span and are never recorded on their own, and neither are dependencies' own scripts.

What is never sent:

- **No argv, no script bodies, no output.** `command`, `target` and `rootCommand` are built only from the script name, the Nx project and target, the runner and a known Nx verb. `npm_lifecycle_script` and Nx `terminalOutput` are never read. There is no free-text error field.
- **Nothing from CI.** Both emitters do nothing when `CI` is set, unless `DEVFEEDBACK_CI=true`. The bundler plugins are unchanged.

And what the wrapper does not change: stdio, cwd, exit codes and signals pass straight through, SIGINT/SIGTERM/SIGHUP are forwarded to the script, and on pnpm 11.28.1+ and 12.8.0+ the wrapper adds back the SIGINT trap pnpm wraps Bourne-shell scripts in (pnpm drops it for a custom `scriptShell`), so Ctrl-C behaves exactly as it would without it. A CI job checks this against the newest pnpm. Events are handed to a detached process that adds the metadata, spools and delivers them after the script has returned; the wrapper itself never touches the network. It does cost one Node.js process start per `pnpm run`, and loading a pnpmfile has a cost of its own on pnpm 12, about 100 ms per command, since pnpm starts a worker for it.

In CI nothing is recorded, but pnpm 12 still pays for the pnpmfile worker. To skip it, set `PNPM_CONFIG_IGNORE_PNPMFILE=true` on the CI steps that run scripts, after `pnpm install`. Don't set it for the install itself if your pnpmfile has other hooks.

Known gaps:

- **Windows:** not wrapped. pnpm only accepts a real `.exe` as `scriptShell`, and a Node.js bin is a `.cmd` shim there, so the pnpmfile hook leaves Windows alone. The Nx plugin works everywhere.
- A repo that already sets `scriptShell` keeps it and is not wrapped. To wrap a non-default shell, set `DEVFEEDBACK_SHELL=/bin/bash` in the developer's environment.
- With `shell-emulator=true` pnpm ignores `scriptShell`, so nothing is recorded.
- npm and yarn scripts are not covered yet.

### Rollout tiers

| Tier                                                                            | Repo change                                  | What you get                                |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Shared preset (e.g. `@agoda/vite-config` re-exporting `viteBuildStatsPlugin()`) | none, just a version bump                    | everything below except exact install spans |
| Direct install                                                                  | one plugin line                              | same                                        |
| Exact install timing                                                            | two `scripts` lines + a direct devDependency | true install span and cold-clone accuracy   |
| npm repos, opt-in                                                               | one `.npmrc` line (`timing=true`)            | per-phase and per-package install breakdown |
| pnpm scripts                                                                    | a one-line `.pnpmfile.cjs` + a direct devDependency | every `pnpm run`: typecheck, lint, test, codegen, … |
| Nx                                                                              | one `nx.json` plugin entry                   | every Nx task, cache hits included          |
| Advanced                                                                        | `DEVFEEDBACK_SESSION_ID` in your shell       | precise session boundaries                  |

### Staying off the critical path

Telemetry that slows people down gets deleted from configs, so:

- Every POST has a 1500 ms timeout. Off-VPN, nothing hangs.
- Git metadata is read once and cached until the repository actually changes, instead of spawning three `git` processes per HMR event.
- The session id is resolved once per process; the HMR path performs no synchronous filesystem writes and no process spawns.
- Signal handlers write synchronously and then get out of the way, so Ctrl-C behaves exactly as it would without the plugin.
- The spool is capped at 256 KB and events older than a week are dropped rather than accumulated.
- Startup chatter is behind `DEVFEEDBACK_DEBUG=1`. At the default log level the lifecycle events print nothing at all.

## Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding support for the next big JavaScript build tool, we appreciate your help in making agoda-devfeedback even better. Check out our [Contributing Guide](CONTRIBUTING.md) for more details on how to get started.

Remember, in the world of agoda-devfeedback, there are no stupid questions, only builds that are taking too long!

## And Finally

Remember, in JavaScript development, there are only two types of projects: those that are measuring their build times, and those that are still waiting for their builds to finish. With agoda-devfeedback, you'll always know exactly how long you're waiting. (Spoiler alert: with our help, it won't be long!)

Happy coding, and may your builds be ever faster! 🚀
