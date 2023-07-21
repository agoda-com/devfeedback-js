## @agoda/devfeedback

This is an npm package that allows you to collect developer local metrics such as build data from your project that uses Webpack or Vite.

## Getting Started

### Prerequisites

This project has the following peer dependencies:

- **Webpack** version 4.x or 5.x
- **Vite** version 4.0+

To ensure compatibility, please include the correct versions of these dependencies in your environment.

### Installing

Make sure you have added Agoda's npm registry to your `.npmrc` file:

```bash
@agoda:registry=https://repo-hkg.agodadev.io/api/npm/agoda-npm-local
```

Then install the package:

```bash
npm install --save-dev @agoda/devfeedback
```

or

```bash
yarn add --dev @agoda/devfeedback
```

### Usage

#### Basic usage

##### Webpack

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

##### Vite

If you use **Vite** you can add the following to your `vite.config.js` file:

```javascript
const { viteBuildStatsPlugin } = require('@agoda/devfeedback');

export default defineConfig({
  // ...
  plugins: [
    // ...
    viteBuildStatsPlugin(),
  ],
});
```

See example here: [cronos-project-template !75](https://gitlab.agodadev.io/full-stack/templates/cronos-project-template/-/merge_requests/75/) for Webpack and [capybara !181](https://gitlab.agodadev.io/full-stack/crossplatform-workgroup/capybara/-/merge_requests/181/) for Vite.

In case of any errors, the plugin will neither break your build nor print any scary messages in the console. Instead, the error messages will go to a separate file `devfeedback.log`.
So, you might need to add the file to your `.gitignore` file to prevent people from accidentally commit it.

```plaintext
# @agoda/devfeedback error log file
devfeedback.log
```

#### Advanced usage

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

#### How to test

To test that you have set up the plugin correctly and messages are handled by the server, you can run the following query in Superset:

```sql
SELECT *
FROM messaging.vitebuildmessage
WHERE projectName = '%your-project-name%' AND userName = '%your-user-name%'
```

_\* remember that there is a delay between the time you run the build and the time the data is available in Hadoop_

## Notes

#### Migrating from @agoda/webpack-build-stats-collector

Your project might be already collecting the build data using `@agoda/webpack-build-stats-collector` ([see list of projects that are using it](https://superset.agodadev.io/superset/dashboard/2509/?native_filters_key=n4RLPn3wh9N63l5LT0r4EfaJI1j-o3wLb7vg0cjOy0_H31lXHAVjlhkjAOnF_tye)) which is already deprecated.

See example on [revenue-management !524](https://gitlab.agodadev.io/full-stack/ycs/revenue-management/-/merge_requests/524)

## Other

- [Dashboard](https://superset.agodadev.io/superset/dashboard/439/)
- [The server where the data is sent to](https://gitlab.agodadev.io/full-stack/tooling/developer-local-metrics)
