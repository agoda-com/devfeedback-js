# Build Time (Compilation Time)

Requires `@agoda/devfeedback` version 1.0.0 or later.

## Usage

### Basic usage

#### Webpack

If you use **Webpack**, you can add the following to your `webpack.config.js` file:

```javascript
const { WebpackBuildStatsPlugin } = require('@agoda/devfeedback');

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
import { viteBuildStatsPlugin } from '@agoda/devfeedback';

export default defineConfig({
  // ...
  plugins: [
    // ...
    viteBuildStatsPlugin(),
  ],
});
```

See example here: [cronos-project-template !75](https://gitlab.agodadev.io/full-stack/templates/cronos-project-template/-/merge_requests/75/).

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

See examples on [agoda-com-spa-mobile !14885](https://gitlab.agodadev.io/full-stack/monoliths/agoda-com-spa-mobile/-/merge_requests/14885) and [accom-web !4698](https://gitlab.agodadev.io/full-stack/accommodation/accom-web/-/merge_requests/4698).

## Notes

### Migrating from @agoda/webpack-build-stats-collector

Your project might be already collecting the build data using `@agoda/webpack-build-stats-collector` ([see list of projects that are using it](https://superset.agodadev.io/superset/dashboard/2509/?native_filters_key=n4RLPn3wh9N63l5LT0r4EfaJI1j-o3wLb7vg0cjOy0_H31lXHAVjlhkjAOnF_tye)) which is already deprecated.

Please follow this example [revenue-management !524](https://gitlab.agodadev.io/full-stack/ycs/revenue-management/-/merge_requests/524) to migrate to this new plugin.
