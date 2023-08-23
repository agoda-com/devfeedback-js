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

## How to test

To test that you have set up the plugin correctly and messages are handled by the server, you can run the following query in Superset:

```sql
SELECT *
FROM messaging.vitebuildmessage
WHERE projectName = '%your-project-name%' AND userName = '%your-user-name%'
```

For compilation time, Webpack data goes to `messaging.webpackstatsmessage` and Vite data goes to `messaging.vitebuildmessage`.

For test data, Vitest data goes to `messaging.vitesttestrunmessage`, `messaging.vitesttestfilemessage`, and `messaging.vitesttestcasemessage` for test run, test file, and test case respectively.

\* _remember that there is a delay between the time you run the build and the time the data is available in Hadoop_

## Other

- [Dashboard](https://superset.agodadev.io/superset/dashboard/439/)
- [The server where the data is sent to](https://gitlab.agodadev.io/full-stack/tooling/developer-local-metrics)
