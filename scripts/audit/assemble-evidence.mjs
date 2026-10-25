// Re-inventory post-run audit deliverables while preserving the immutable runner manifest.
import {readFileSync,writeFileSync,copyFileSync,existsSync,cpSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceProvenance,sha256} from './evidence.mjs';
import {inventory} from '../cohort/common.mjs';
import {gzipSync} from 'node:zlib';

const root=path.resolve(process.argv[2]||''),file=path.join(root,'manifest.json'),manifest=JSON.parse(readFileSync(file));
if(manifest.status!=='complete')throw Error('Wait for the run to complete');
const original=path.join(root,'original-run-manifest.json');
if(!existsSync(original))copyFileSync(file,original);
cpSync('docs/production-readiness',path.join(root,'engineering'),{recursive:true,filter:source=>{
 const execution=path.join(source,'execution.json');
 return !(statSync(source).isDirectory()&&existsSync(execution)&&JSON.parse(readFileSync(execution)).status==='RUNNING');
}});
copyFileSync('scripts/audit/archive-evidence.py',path.join(root,'VERIFY.py'));
const runtime=readFileSync(path.join(root,'.runtime/worker.js'));
writeFileSync(path.join(root,'runtime-worker.mjs.gz'),gzipSync(runtime));
manifest.runtimeEvidence={path:'runtime-worker.mjs.gz',uncompressedSha256:sha256(runtime)};
manifest.evidenceAssembly={assembledAt:new Date().toISOString(),originalManifestSha256:sha256(readFileSync(original)),tool:'scripts/audit/assemble-evidence.mjs',toolSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),provenance:sourceProvenance(),
 distinction:'Simulation inputs and source/ are frozen at run start. Later engineering fixes, tests, D1 export and audit findings have separate current provenance and do not retroactively validate the baseline as current release acceptance.'};
manifest.files=inventory(root);writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({root,files:manifest.files.length,originalManifestSha256:manifest.evidenceAssembly.originalManifestSha256}));
