# agoda-devfeedback: Your JavaScript Build's Personal Trainer 🏋️‍♂️

Welcome to agoda-devfeedback, the JavaScript/TypeScript package that's about to make your builds faster than a caffeinated squirrel on a sugar rush! We're here to collect metrics that relate to developers' experience, because who doesn't love a good statistic about how long they've been waiting for their build to finish?

## Build Time (Compilation Time): Because Life's Too Short for Slow Builds

This package supports collecting the build time (compilation time) of projects using Webpack (4.x or 5.x) or Vite (4.x). It's like a stopwatch for your builds, but cooler.

### Basic Usage: Easy as Pie (Mmm... pie 🥧)

First, let's get this party started. Install the package:

```bash
npm install --save-dev agoda-devfeedback
```
or if you're yarn-clined:
```bash
yarn add --dev agoda-devfeedback
```

Pro tip: When an error happens, the package will write the error message to `devfeedback.log` in your current working directory. You might want to add this to `.gitignore`, unless you want your repo to know about all your build failures. We won't judge.

#### For Webpack Wizards 🧙‍♂️

If you're using **Webpack**, sprinkle this magic into your `webpack.config.js`:

```javascript
const { WebpackBuildStatsPlugin } = require('agoda-devfeedback');
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
import { viteBuildStatsPlugin } from 'agoda-devfeedback';
export default defineConfig({
  // ... your brilliant config options ...
  plugins: [
    // ... your other fantastic plugins ...
    viteBuildStatsPlugin(),
  ],
});
```

### Advanced Usage: For the Overachievers 🏆

Both Webpack and Vite plugins will send not just build data, but also the command you used to run the build (like `yarn dev` or `yarn build`) as the build identifier. It's like a name tag for your builds!

But wait, there's more! If you want to define your own identifier (because you're a rebel like that), you can pass it as a parameter:

```javascript
new WebpackBuildStatsPlugin('production-build-deluxe');
```
or for Vite:
```javascript
viteBuildStatsPlugin('vite-build-extraordinaire');
```

## The F5 Experience: Because Waiting is So Last Year

What is the F5 Experience? have a read [here](https://beerandserversdontmix.com/2024/08/15/an-introduction-to-the-f5-experience/)

Remember, we're all about that F5 Experience here at agoda-devfeedback. Our goal is to make your development process smoother than a JavaScript promise chain. Here's what that means for you:

1. **Setup Should Be a Breeze**: You should be able to install this package and get metrics faster than you can say "npm install".
2. **Fast Feedback Loop**: We want your builds to be so fast, you'll forget what you were working on by the time they finish. (Okay, maybe not that fast, but you get the idea.)

## Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding support for the next big JavaScript build tool, we appreciate your help in making agoda-devfeedback even better. Check out our [Contributing Guide](CONTRIBUTING.md) for more details on how to get started.

Remember, in the world of agoda-devfeedback, there are no stupid questions, only builds that are taking too long!

## And Finally...

Remember, in JavaScript development, there are only two types of projects: those that are measuring their build times, and those that are still waiting for their builds to finish. With agoda-devfeedback, you'll always know exactly how long you're waiting. (Spoiler alert: with our help, it won't be long!)

Happy coding, and may your builds be ever faster! 🚀
