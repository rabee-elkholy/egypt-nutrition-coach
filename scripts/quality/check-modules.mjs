import {build} from 'esbuild';
import {existsSync} from 'node:fs';
const entryPoints=['server/cloudflare-entry.mjs','server/worker.mjs'];
const result=await build({entryPoints,outdir:'dist/.check',bundle:true,write:false,metafile:true,platform:'browser',format:'esm',external:['node:async_hooks'],logLevel:'silent'});
const graph=result.metafile.inputs,visiting=new Set(),done=new Set();
function walk(name){if(visiting.has(name))throw Error('Circular server dependency: '+name);if(done.has(name))return;visiting.add(name);for(const next of graph[name]?.imports||[])if(!next.external)walk(next.path);visiting.delete(name);done.add(name);}
for(const ep of entryPoints)walk(ep);
for(const out of ['dist/server/index.js','dist/server/cloudflare.js']){if(!existsSync(out))throw Error('Missing built Worker artifact: '+out);}
console.log('Server dependency graph is acyclic; '+Object.keys(graph).length+' input modules bundled into Worker artifacts.');
