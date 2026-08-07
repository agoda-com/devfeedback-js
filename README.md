# agoda-devfeedback: Your JavaScript Build's Personal Trainer 🏋️‍♂️

Welcome to agoda-devfeedback, the JavaScript/TypeScript package collection that's about to make your builds faster than a caffeinated squirrel on a sugar rush! We're here to collect metrics that relate to developers' experience, because who doesn't love a good statistic about how long they've been waiting for their build to finish?

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

### Advanced Usage: For the Overachievers 🏆

All plugins accept a custom identifier for your builds. It's like a name tag for your builds! By default, they'll use your npm script name (like `yarn dev` or `yarn build`).

But if you want to be fancy:

```javascript
// Webpack
new WebpackBuildStatsPlugin('production-build-deluxe');

// Vite
viteBuildStatsPlugin('vite-build-extraordinaire');

// Rspack
RsbuildBuildStatsPlugin.setup({ identifier: 'rspack-build-supreme' });
```

Want to track bootstrap chunk sizes? We've got you covered! Pass a size limit (in KB) as the second parameter (Vite and Webpack only):

```javascript
viteBuildStatsPlugin('vite-build-extraordinaire', 1000); // 1 mega byte
```

## The Whole Dev Cycle, Not Just The Compile

A compile time is one number out of the several a developer actually waits through. Between `git pull` and a working app there is an install, a dev server start, and a browser that has to finish booting. Vite and Rspack/Rsbuild now report all of them.

These arrive as a new event type, `type: "command"`, on the `COMMAND_ENDPOINT`:

| `phase`       | What it measures                                                                                                                   | Emitted by                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `install`     | The package manager run, plus cold/warm and whether the lockfile changed                                                           | install hooks (npm, yarn, pnpm) |
| `devserver`   | Time until the dev server is listening — the number that was previously never measured, because `closeBundle` does not fire in dev | Vite, Rsbuild, Rspack watch     |
| `clientready` | Time until the app is usable in the browser, with DOMContentLoaded and first contentful paint                                      | Vite, Rsbuild                   |

Aborted runs count too: Ctrl-C on a dev server produces a `devserver` event with `success: false` and `signal: "SIGINT"`. A developer who gave up waiting is the most interesting data point on the chart.

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
- **pnpm blocks dependency lifecycle scripts by default.** Allow it once during dev machine bootstrap, in `~/.config/pnpm/config.yaml`, so repos stay untouched:
  ```yaml
  allowBuilds:
    agoda-devfeedback-common: true
  ```
  (pnpm 10 and earlier call this `onlyBuiltDependencies`.)
- npm only: with `timing=true` in `.npmrc`, npm's own per-phase timers are scraped from `~/.npm/_logs/*-timing.json` and attached as `npmTimers`. That is where you find out a Playwright browser download or a `node-gyp` rebuild is what actually costs you three minutes.

### Rollout tiers

| Tier                                                                            | Repo change                                  | What you get                                |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Shared preset (e.g. `@agoda/vite-config` re-exporting `viteBuildStatsPlugin()`) | none, just a version bump                    | everything below except exact install spans |
| Direct install                                                                  | one plugin line                              | same                                        |
| Exact install timing                                                            | two `scripts` lines + a direct devDependency | true install span and cold-clone accuracy   |
| npm repos, opt-in                                                               | one `.npmrc` line (`timing=true`)            | per-phase and per-package install breakdown |
| Advanced                                                                        | `DEVFEEDBACK_SESSION_ID` in your shell       | precise session boundaries                  |

### Staying off the critical path

Telemetry that slows people down gets deleted from configs, so:

- Every POST has a 1500 ms timeout. Off-VPN, nothing hangs.
- Git metadata is read once and cached until the repository actually changes, instead of spawning three `git` processes per HMR event.
- The session id is resolved once per process; the HMR path performs no synchronous filesystem writes and no process spawns.
- Signal handlers write synchronously and then get out of the way, so Ctrl-C behaves exactly as it would without the plugin.
- The spool is capped at 256 KB and events older than a week are dropped rather than accumulated.
- Startup chatter is behind `DEVFEEDBACK_DEBUG=1`. At the default log level the lifecycle events print nothing at all.

## The F5 Experience: Because Waiting is So Last Year

What is the F5 Experience? Have a read [here](https://beerandserversdontmix.com/2024/08/15/an-introduction-to-the-f5-experience/)

Remember, we're all about that F5 Experience here at agoda-devfeedback. Our goal is to make your development process smoother than a JavaScript promise chain. Here's what that means for you:

1. **Setup Should Be a Breeze**: You should be able to install these packages and get metrics faster than you can say "npm install".
2. **Fast Feedback Loop**: We want your builds to be so fast, you'll forget what you were working on by the time they finish. (Okay, maybe not that fast, but you get the idea.)

## Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding support for the next big JavaScript build tool, we appreciate your help in making agoda-devfeedback even better. Check out our [Contributing Guide](CONTRIBUTING.md) for more details on how to get started.

Remember, in the world of agoda-devfeedback, there are no stupid questions, only builds that are taking too long!

## And Finally

Remember, in JavaScript development, there are only two types of projects: those that are measuring their build times, and those that are still waiting for their builds to finish. With agoda-devfeedback, you'll always know exactly how long you're waiting. (Spoiler alert: with our help, it won't be long!)

Happy coding, and may your builds be ever faster! 🚀
