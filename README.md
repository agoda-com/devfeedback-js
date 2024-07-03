# agoda-devfeedback

This is a JavaScript/TypeScript package to collect metrics that relate to developers' experience.

## Installing

Install the package:

```bash
npm install --save-dev agoda-devfeedback
```

or

```bash
yarn add --dev agoda-devfeedback
```

Please note that when an error happens, the package will put the error message to `devfeedback.log` file in the current working directory.  
You might need to add this file to `.gitignore` to avoid committing it to the repository.

## Supported Metrics

### Build Time (Compilation Time)

This package supports collecting the build time (compilation time) of projects that are using Webpack (4.x or 5.x) or Vite (4.x).  

### Bundle Size

This package also supports collecting the bundle size of your project. This helps in understanding the size of the final output and optimizing it for better performance.

## Usage

### Configuration

You can define an endpoint in the environment variable and the stats data will be sent there via HTTP POST Request

| Environment Variable | Default Value                        |
| -------------------- | ------------------------------------ |
| WEBPACK_ENDPOINT     | <http://compilation-metrics/webpack> |
| VITE_ENDPOINT        | <http://compilation-metrics/vite>    |

### Basic usage

#### Webpack

If you use **Webpack**, you can add the following to your `webpack.config.js` file:

```javascript
const { WebpackBuildStatsPlugin } = require('agoda-devfeedback');

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
import { viteBuildStatsPlugin } from 'agoda-devfeedback';

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
