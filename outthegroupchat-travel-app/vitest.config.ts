import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/_archive/**', 'src/__tests__/_archive/**'],
    // --- Determinism: clear mock CALL HISTORY + cached return values between
    // every test so module-mock state (e.g. mockResolvedValue / mockResolvedValueOnce
    // queues on triggerCheckinEvent, prisma.*, getServerSession) cannot leak ACROSS
    // test files under the pool.
    // NOTE: deliberately NOT using `mockReset`/`restoreMocks` — those wipe the
    // mock IMPLEMENTATIONS installed by the global vi.mock() factories in
    // setup.ts. Also deliberately NOT using `unstubGlobals`/`unstubEnvs` —
    // geocoding.test.ts installs `vi.stubGlobal('fetch', ...)` at MODULE scope
    // (once, not per-test); unstubGlobals would restore the real fetch after the
    // first test and break every subsequent test in that file. `clearMocks`
    // alone is sufficient to flush leaking resolved-value queues while
    // preserving both setup.ts implementations and module-level global stubs.
    clearMocks: true,
    // --- Cross-file isolation: run test files serially in a single worker.
    // This is the config equivalent of `--no-file-parallelism` and is the most
    // reliable cure for cross-file module-state leakage that makes the suite
    // flaky (files pass alone, fail together). Determinism > marginal CI speed.
    fileParallelism: false,
    isolate: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
