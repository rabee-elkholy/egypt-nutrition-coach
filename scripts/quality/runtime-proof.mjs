import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {build} from 'esbuild';

/** Establish source bytes independently of Git metadata shared by archived workspaces. */
export async function runtimeProof({sourceRoot,referenceCommit=null,repositoryRoot=sourceRoot}){
 const root=path.resolve(sourceRoot),hash=value=>createHash('sha256').update(value).digest('hex');
 const bundle=await build({absWorkingDir:root,entryPoints:['scripts/cohort/local-worker.mjs'],outfile:'quality-runtime.js',bundle:true,format:'esm',platform:'browser',external:['node:async_hooks'],target:'es2022',minify:true,write:false,metafile:true});
 const inputs={};
 for(const file of Object.keys(bundle.metafile.inputs)){
  assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'),'Runtime input outside captured source: '+file);
  const actual=hash(readFileSync(path.join(root,file)));
  if(referenceCommit){
   const original=execFileSync('git',['show',referenceCommit+':'+file],{cwd:repositoryRoot,maxBuffer:32*1024*1024});
   assert.equal(actual,hash(original),'Captured reference source differs from Git object: '+file);
  }
  inputs[file]=actual;
 }
 return {bundleSha256:hash(bundle.outputFiles[0].contents),inputs,referenceCommit,referenceInputsVerified:!!referenceCommit};
}
