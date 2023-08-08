# @agoda/devfeedback

This is a JavaScript/TypeScript package to collect metrics that relate to developers' experience.

## Installing

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

Please note that when an error happens, the package will put the error message to `devfeedback.log` file in the current working directory.  
You might need to add this file to `.gitignore` to avoid committing it to the repository.

## Supported Metrics

### Build Time (Compilation Time)

This package supports collecting the build time (compilation time) of projects that are using Webpack (4.x or 5.x) or Vite (4.x).  
Follow this [instruction](BUILD_TIME.md) to get started.

### Test Data

This package also supports collecting the test data of projects that are using Vitest (0.x).  
Follow this [instruction](TEST_DATA.md) to get started.

## Other

- [Dashboard](https://superset.agodadev.io/superset/dashboard/439/)
- [The server where the data is sent to](https://gitlab.agodadev.io/full-stack/tooling/developer-local-metrics)
