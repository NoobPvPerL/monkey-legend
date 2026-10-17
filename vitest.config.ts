import { defineConfig } from 'vitest/config';
// Each SQL test worker owns a PostgreSQL WASM instance. Bound concurrent memory use.
export default defineConfig({test:{include:['tests/**/*.test.ts'],environment:'node',testTimeout:15000,maxWorkers:2}});
