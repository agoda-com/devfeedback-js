/**
 * pnpm wiring for the `devfeedback-shell` script-shell wrapper (pnpm ≥ 10.13):
 *
 *   // .pnpmfile.cjs
 *   try { module.exports = require('agoda-devfeedback-common/pnpmfile').pnpmfile(__dirname); } catch { module.exports = {}; }
 *
 * `hooks.updateConfig` runs on every pnpm command, so `scriptShell` is set only once the
 * wrapper is actually installed. A cold clone's first `pnpm install` runs with the
 * default shell, and the `try` covers the `require` itself failing before then.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isCiSuppressed } from './lib/ci';

export interface PnpmConfig {
  scriptShell?: string;
  shellEmulator?: boolean;
  [key: string]: unknown;
}

/**
 * The `updateConfig` hook on its own, for a `.pnpmfile.cjs` that already has hooks.
 * `rootDir` is the directory holding the root `node_modules`, normally `__dirname`.
 */
export const devfeedbackUpdateConfig =
  (rootDir: string) =>
  <T extends PnpmConfig>(config: T): T => {
    try {
      // pnpm wants a real executable on Windows; with shell-emulator it ignores scriptShell
      if (process.platform === 'win32' || config.shellEmulator || isCiSuppressed()) {
        return config;
      }
      const shell = join(rootDir, 'node_modules', '.bin', 'devfeedback-shell');
      if (!existsSync(shell)) return config;
      // A repo that already chose a shell keeps it, unwrapped. The choice can't be handed
      // to the wrapper from here: pnpm 12 runs this hook in a separate worker process, so
      // an env var set here never reaches scripts. DEVFEEDBACK_SHELL, set by the
      // developer, is the explicit way to wrap a non-default shell.
      if (
        config.scriptShell &&
        config.scriptShell !== shell &&
        !process.env.DEVFEEDBACK_SHELL
      ) {
        return config;
      }
      config.scriptShell = shell;
    } catch {
      /* never break pnpm */
    }
    return config; // must not return undefined
  };

export const pnpmfile = (rootDir: string) => ({
  hooks: { updateConfig: devfeedbackUpdateConfig(rootDir) },
});
