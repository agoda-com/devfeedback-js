# Test Data

Requires `@agoda/devfeedback` version 1.1.0 or later.

## Usage

### Basic usage

#### Vitest

If you use **Vitest**, you can add the following to your `vitest.config.js` file:

```javascript
import { VitestTestDataPlugin } from '@agoda/devfeedback'

export default defineConfig({
  ...,
  test: {
    ...,
    reporters: ['default', new VitestTestDataPlugin()],
  },
})
```

Don't forget to keep `'default'` reporter in the list, otherwise you won't be able to see your test result in the console.

See example here: [supply-iam !65](https://gitlab.agodadev.io/full-stack/ycs/supply-iam/-/merge_requests/65/).

or if you are running tests using command line, you might need to add `--reporter` flag to your command like:

```bash
yarn vitest --reporter ./node_modules/@agoda/devfeedback/lib/esm/VitestTestDataPlugin run
```

### Advanced usage

As same as build time, test data collection also sends the command that you used to run the build like `yarn test` to be the custom identifier which should work in most cases in order to help you distinguish between different test configurations.

However, if you would like to define your own identifier, you can do so by passing it as a parameter to the plugin.

```javascript
VitestTestDataPlugin(testOnlyPartA ? 'test-only-part-a' : 'test-everything');
```

## Note

Please note that the test collection doesn't work with IntelliJ IDEs because it will override your config file and use its own reporter in the command line

For now, it works only when you run the test in the command line directly like `yarn vitest`.
