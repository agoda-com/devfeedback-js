# @agoda-com/devfeedback

This is a JavaScript/TypeScript package to collect metrics that relate to developers' experience.

## Installing

Install the package:

```bash
npm install --save-dev @agoda-com/devfeedback
```

or

```bash
yarn add --dev @agoda-com/devfeedback
```

Please note that when an error happens, the package will put the error message to `devfeedback.log` file in the current working directory.  
You might need to add this file to `.gitignore` to avoid committing it to the repository.

## Supported Metrics

### Build Time (Compilation Time)

This package supports collecting the build time (compilation time) of projects that are using Webpack (4.x or 5.x) or Vite (4.x).  
Follow this [instruction](BUILD_TIME.md) to get started.
