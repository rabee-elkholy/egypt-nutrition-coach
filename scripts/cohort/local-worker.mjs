// Harness-only wrapper. Never included by scripts/build.mjs or wrangler.jsonc.
// Production routing, validation, planning, presentation and D1 persistence remain unchanged.
import worker from '../../server/worker.mjs';
const NativeDate=Date;
let now=NativeDate.parse('2026-10-24T12:00:00Z'),key='',sequence=0;
globalThis.Date=class extends NativeDate {constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
function word(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16).padStart(8,'0');}
Object.defineProperty(crypto,'randomUUID',{value:()=>{const s=key+':'+sequence++;const h=[0,1,2,3].map(i=>word(s+':'+i)).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20);}});
export default {async fetch(request,env){
 now=Number(request.headers.get('x-cohort-now'))||NativeDate.parse('2026-10-24T12:00:00Z');key=request.headers.get('x-cohort-key')||'local';sequence=0;
 return worker.fetch(request,env);
}};
