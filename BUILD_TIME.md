# Build Time (Compilation Time)

Requires `@agoda-com/devfeedback` version 1.0.0 or later.

## Usage

### Basic usage

#### Webpack

If you use **Webpack**, you can add the following to your `webpack.config.js` file:

```javascript
const { WebpackBuildStatsPlugin } = require('@agoda-com/devfeedback');

module.exports = {
  // ...
  plugins: [
    // ...
    new WebpackBuildStatsPlugin(),
  ],
};
```

#### Vite

If you use **Vite** you can add the following to your `vite.config.js` file:

```javascript
import { viteBuildStatsPlugin } from '@agoda-com/devfeedback';

export default defineConfig({
  // ...
  plugins: [
    // ...
    viteBuildStatsPlugin(),
  ],
});
```

### Advanced usage

Both Webpack and Vite plugins will not only send the build data but also send the command that you used to run the build like `yarn dev` or `yarn build` to be the build identifier which should work in most cases in order to help you distinguish between different build configurations.

However, if you would like to define your own identifier, you can do so by passing it as a parameter to the plugin.

```javascript
new WebpackBuildStatsPlugin('production');
```

or

```javascript
viteBuildStatsPlugin('production');
```
