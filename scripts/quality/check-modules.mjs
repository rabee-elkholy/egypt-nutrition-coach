import {build} from 'esbuild';import {existsSync} from 'node:fs';
const result=await build({entryPoints:['coaching-ui.mjs'],bundle:true,write:false,metafile:true,platform:'browser',format:'esm',logLevel:'silent'});
const graph=result.metafile.inputs,visiting=new Set(),done=new Set();
function walk(name){if(visiting.has(name))throw Error('Circular client dependency: '+name);if(done.has(name))return;visiting.add(name);for(const next of graph[name]?.imports||[])if(!next.external)walk(next.path);visiting.delete(name);done.add(name);}
walk('coaching-ui.mjs');
for(const name of Object.keys(graph)){const local=name.split('?')[0];if(local.endsWith('.mjs')&&!existsSync('dist/client/'+local))throw Error('Missing deployed client module: '+local);}
console.log('Client dependency graph is acyclic; '+Object.keys(graph).length+' input modules have deployable assets.');
