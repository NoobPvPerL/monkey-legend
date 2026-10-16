import {build} from 'esbuild';
await build({entryPoints:['apps/server/src/index.ts'],outfile:'server-dist/index.mjs',bundle:true,packages:'external',platform:'node',target:'node22.12',format:'esm',sourcemap:true});
