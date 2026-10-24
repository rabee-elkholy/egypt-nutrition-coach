import {createServer} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {args} from './common.mjs';
export function serve(root,port=8794){const types={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.jsonl':'application/x-ndjson; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8','.gz':'application/gzip','.png':'image/png','.woff2':'font/woff2'};
 const server=createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return}const file=path.resolve(root,'.'+(name==='/'?'/explorer.html':name));if(!file.startsWith(path.resolve(root)+path.sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end('Not found');return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});createReadStream(file).pipe(res)});server.listen(port,'127.0.0.1');return server;}
if(process.argv[1]?.endsWith('serve.mjs')){const a=args(),port=Number(a.port||8794);serve(path.resolve(String(a.output||'reports/simulation-100-users-90-days/baseline-v1')),port);console.log('Local explorer: http://127.0.0.1:'+port);}
