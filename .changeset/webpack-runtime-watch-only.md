---
"agoda-devfeedback-webpack": patch
---

Only inject the DevFeedback client runtime module in watch mode (dev server). The browser snippet was previously added to every compilation's initial chunks, including one-off production/CI builds and SSR bundles — it broke html-webpack-plugin template evaluation (`window is not defined` in node:vm) and would crash SSR bundles running in Node. The generated client code also now guards on `typeof window`/`document` as a defensive measure.
