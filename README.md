# agoda-devfeedback: Your JavaScript Build's Personal Trainer 🏋️‍♂️

Welcome to agoda-devfeedback, the JavaScript/TypeScript package collection that's about to make your builds faster than a caffeinated squirrel on a sugar rush! We're here to collect metrics that relate to developers' experience, because who doesn't love a good statistic about how long they've been waiting for their build to finish?

## Build Time (Compilation Time): Because Life's Too Short for Slow Builds

This collection supports collecting build time (compilation time) metrics across multiple bundlers:
- Webpack (4.x or 5.x)
- Vite (4.x)
- Rspack/Rsbuild (1.x)

It's like a stopwatch for your builds, but cooler, and now with more bundlers! 🎮

### Consuming the data

The data is sent to the following default endpoints (customizable via environment variables):

| Bundler | Default | Environment Variable Override | Post Data Example
| --- | --- | --- | --- |
| WebPack | "<http://compilation-metrics/webpack>" | WEBPACK_ENDPOINT | [click here](examples/webpack.json) |
| Vite | "<http://compilation-metrics/vite>" | VITE_ENDPOINT | [click here](examples/vite.json) |
| Rspack | "<http://compilation-metrics/rspack>" | RSPACK_ENDPOINT | [click here](examples/rspack.json) |

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