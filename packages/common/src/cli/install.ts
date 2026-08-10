#!/usr/bin/env node

type InstallHook = 'preinstall' | 'postinstall';

const usage = () => {
  process.stderr.write('Usage: devfeedback-install <preinstall|postinstall> [--self]\n');
};

const run = async (hook: InstallHook): Promise<void> => {
  if (hook === 'preinstall') {
    await import('../hooks/preinstall');
  } else {
    await import('../hooks/postinstall');
  }
};

const hook = process.argv[2];

if (hook !== 'preinstall' && hook !== 'postinstall') {
  usage();
  process.exitCode = 1;
} else {
  void run(hook).catch((error: unknown) => {
    // The hook modules are deliberately best-effort. This is only a guard for
    // unexpected module-loading failures in the CLI itself.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[devfeedback] install hook error: ${message}\n`);
    process.exitCode = 0;
  });
}
