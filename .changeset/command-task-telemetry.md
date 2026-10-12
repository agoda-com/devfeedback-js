---
'agoda-devfeedback-common': minor
---

Record package scripts and task-runner tasks as `command` events.

- `devfeedback-shell`: a pnpm `scriptShell` wrapper, wired up through
  `agoda-devfeedback-common/pnpmfile` in `.pnpmfile.cjs` (pnpm ≥ 10.13, macOS and
  Linux), that records every `pnpm run <script>` without changing exit codes, signals
  or stdio.
- `agoda-devfeedback-common/nx`: an Nx plugin (`postTasksExecution`, Nx ≥ 20.4) that
  records every task, with cache hits reported as `outcome: "cache"`.
- New optional `CommandBuildData` fields: `outcome`, `runner`, `project`, `target`,
  `rootCommand`, `runId`; new `CommandPhase` value `other` for unmapped names.
- Per-repo `devfeedback.phases` / `devfeedback.skip` in the root `package.json`. A
  phase that isn't a known `CommandPhase` is reported as `other`.
- Neither emitter records anything when `CI` is set, unless `DEVFEEDBACK_CI=true`.
  Script bodies, argv and task output are never sent.
