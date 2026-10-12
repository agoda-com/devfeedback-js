# agoda-devfeedback-webpack

## 2.0.11

### Patch Changes

- Updated dependencies [ea4888e]
- Updated dependencies [ea4888e]
- Updated dependencies [ea4888e]
- Updated dependencies [83413f6]
  - agoda-devfeedback-common@2.2.0

## 2.0.10

### Patch Changes

- b4c7423: Only inject the DevFeedback client runtime module in watch mode (dev server). The browser snippet was previously added to every compilation's initial chunks, including one-off production/CI builds and SSR bundles — it broke html-webpack-plugin template evaluation (`window is not defined` in node:vm) and would crash SSR bundles running in Node. The generated client code also now guards on `typeof window`/`document` as a defensive measure.
- Updated dependencies [6da9ddd]
  - agoda-devfeedback-common@2.1.0

## 2.0.9

### Patch Changes

- 6233d61: fix package.json entrypoints
- Updated dependencies [6233d61]
  - agoda-devfeedback-common@2.0.9

## 2.0.8

### Patch Changes

- f201db2: Optimize Rspack plugin
- Updated dependencies [f201db2]
  - agoda-devfeedback-common@2.0.8

## 2.0.7

### Patch Changes

- Updated dependencies [4a39731]
  - agoda-devfeedback-common@2.0.7
