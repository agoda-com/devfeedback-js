import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        watch: false,
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
    },
});
