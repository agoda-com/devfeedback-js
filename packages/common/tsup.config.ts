import { defineConfig } from 'tsup'

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        // install hooks are executed by the package manager rather than imported, so
        // they need their own stable entry points under dist/hooks
        'hooks/preinstall': 'src/hooks/preinstall.ts',
        'hooks/postinstall': 'src/hooks/postinstall.ts',
        'cli/install': 'src/cli/install.ts',
    },
    format: ['cjs', 'esm'],
    splitting: true,
    sourcemap: true,
    clean: true,
    dts: { entry: 'src/index.ts' },
})
