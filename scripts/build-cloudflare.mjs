// Build for the public Cloudflare Workers test deployment.
// Reuses the standard build (static client + migrations), then bundles the
// Cloudflare entry that adds anonymous per-browser identity.
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit'});
await build({entryPoints: ['server/cloudflare-entry.mjs'], outfile: 'dist/server/cloudflare.js', bundle: true, format: 'esm', platform: 'browser', external: ['node:async_hooks'], target: 'es2022', minify: true});
console.log('Built Cloudflare entry: dist/server/cloudflare.js');
