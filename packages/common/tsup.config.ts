import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        // install hooks are executed by the package manager rather than imported, so
        // they need their own stable entry points under dist/hooks
        'hooks/preinstall': 'src/hooks/preinstall.ts',
        'hooks/postinstall': 'src/hooks/postinstall.ts',
        // command emitters: the script-shell wrapper and its detached flusher are
        // executed rather than imported; nx and pnpmfile are subpath exports
        'cli/shell': 'src/cli/shell.ts',
        'cli/flush': 'src/cli/flush.ts',
        nx: 'src/nx.ts',
        pnpmfile: 'src/pnpmfile.ts',
    },
    format: ['cjs', 'esm'],
    splitting: true,
    sourcemap: true,
    clean: true,
    // the command emitters find cli/flush next to themselves, in both formats
    shims: true,
    dts: { entry: { index: 'src/index.ts', nx: 'src/nx.ts', pnpmfile: 'src/pnpmfile.ts' } },
})
