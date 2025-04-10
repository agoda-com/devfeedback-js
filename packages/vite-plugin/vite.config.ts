import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    plugins: [],
    resolve: {
        alias: {
            'agoda-devfeedback-common': path.resolve(__dirname, '../common/dist/index.mjs')
        }
    },
    test: {
        watch: false,
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
    },
});
