import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
export const VERSION='1.0.0';
export const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export function rng(seed,state){let n=state??parseInt(hash(String(seed)).slice(0,8),16);return {next(){n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;},state(){return n>>>0;}};}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const round=(n,p=2)=>Math.round(n*10**p)/10**p;
export const pick=(r,a)=>a[Math.floor(r.next()*a.length)];
export const chance=(r,p)=>r.next()<clamp(p,0,1);
export function args(argv=process.argv.slice(2)){return Object.fromEntries(argv.map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.length?v.join('='):true];}));}
export const read=p=>JSON.parse(readFileSync(p,'utf8'));
export const lines=p=>existsSync(p)?readFileSync(p,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
export function json(p,v){mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
export function line(p,v){mkdirSync(path.dirname(p),{recursive:true});appendFileSync(p,JSON.stringify(v)+'\n');}
export function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]);}
export function distribution(v){const a=v.filter(Number.isFinite).sort((a,b)=>a-b),q=p=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*p))]:null;return {n:a.length,mean:a.length?a.reduce((x,y)=>x+y,0)/a.length:null,median:q(.5),p10:q(.1),p90:q(.9),p95:q(.95),p99:q(.99),min:a[0]??null,max:a.at(-1)??null};}
export const countBy=(a,f)=>a.reduce((o,x)=>{const k=f(x);o[k]=(o[k]||0)+1;return o;},{});
export function inventory(root){return files(root).filter(p=>!p.includes(path.sep+'.local-d1'+path.sep)&&!p.endsWith('manifest.json')&&!p.endsWith('verification.json')).map(p=>({path:path.relative(root,p).replaceAll('\\','/'),bytes:statSync(p).size,sha256:hash(readFileSync(p))}));}
