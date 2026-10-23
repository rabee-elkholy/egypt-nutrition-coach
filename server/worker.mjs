import {empty,command} from './coaching.mjs';
import {catalog} from './workouts.mjs';
import {recovery} from './recovery.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {async fetch(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/v1/'))return env.ASSETS.fetch(request);
 if(url.pathname==='/v1/health')return json({ok:true,apiVersion:'1',engineVersion:'0.7.0'});
 const user=request.headers.get('oai-authenticated-user-id');if(!user)return json({error:'سجّل الدخول لحفظ ومتابعة خطتك.'},401);
 try{
 if(!env.DB)return json({error:'قاعدة البيانات غير متاحة.'},503);
 if(request.method==='GET'&&url.pathname==='/v1/catalog/manifest')return json(catalog.manifest);
 if(request.method==='GET'&&url.pathname==='/v1/exercises'){
 const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,100),muscle=url.searchParams.get('muscle');const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
 const found=catalog.exercises.filter(e=>(!q||e.name.toLowerCase().includes(q))&&(!muscle||e.muscles.some(m=>m.muscle_id===muscle)));
 return json({total:found.length,items:found.slice(offset,offset+30),nextOffset:offset+30<found.length?offset+30:null});
 }
 const row=await env.DB.prepare('SELECT revision, body FROM coaching_accounts WHERE user_id = ?').bind(user).first();
 const s=row?JSON.parse(row.body):empty();
 if(request.method==='GET'&&url.pathname==='/v1/state')return json({...s,recovery:recovery(s.checkins)});
 if(request.method!=='POST'||url.pathname!=='/v1/commands')return json({error:'المسار غير موجود.'},404);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin غير مسموح.'},403);
 if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'JSON مطلوب.'},415);
 const raw=await request.text();if(raw.length>40000)return json({error:'الطلب أكبر من المسموح.'},413);
 const body=JSON.parse(raw),key=request.headers.get('Idempotency-Key');
 if(!key||key.length>100)return json({error:'Idempotency-Key مطلوب.'},400);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const previous=await env.DB.prepare('SELECT digest, response FROM coaching_requests WHERE user_id=? AND request_key=?').bind(user,key).first();
 if(previous)return previous.digest===digest?json(JSON.parse(previous.response)):json({error:'مفتاح الطلب مستخدم لمحتوى مختلف.'},409);
 if(body.revision!==s.revision)return json({error:'تم تحديث الحساب؛ حدّث الصفحة وحاول تاني.'},409);
 const next=command(structuredClone(s),body.action,body.payload||{});next.revision=s.revision+1;
 const encoded=JSON.stringify(next);if(encoded.length>1500000)return json({error:'وصلت لسعة النسخة التجريبية؛ صدّر بياناتك.'},413);
 // Compare-and-swap, then record the response only if the account contains our exact write.
 const result=await env.DB.batch([
 env.DB.prepare('INSERT INTO coaching_accounts(user_id,revision,body) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,body=excluded.body WHERE coaching_accounts.revision=?').bind(user,next.revision,encoded,s.revision),
 env.DB.prepare('INSERT OR IGNORE INTO coaching_requests(user_id,request_key,digest,response) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM coaching_accounts WHERE user_id=? AND revision=? AND body=?)').bind(user,key,digest,encoded,user,next.revision,encoded)
 ]);
 if(!result[0].meta.changes)return json({error:'تعارض تحديث؛ حدّث البيانات.'},409);
 return json({...next,recovery:recovery(next.checkins)});
 }catch(error){return json({error:error.status===409?error.message:error instanceof SyntaxError?'JSON غير صالح.':error.message||'تعذر تنفيذ الطلب.'},error.status||400);}
}};
