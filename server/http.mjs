import {createApiError} from './logger.mjs';
import {integer,validDate} from '../coaching-shared.mjs';
export async function requestJson(request){
 const reader=request.body?.getReader();if(!reader)throw createApiError('محتوى JSON مطلوب.',400,{code:'EMPTY_BODY'});
 const chunks=[];let size=0;
 while(true){
  const {done,value}=await reader.read();
  if(done)break;
  size+=value.byteLength;
  if(size>40000){await reader.cancel();throw createApiError('الطلب أكبر من المسموح.',413,{code:'PAYLOAD_TOO_LARGE'});}
  chunks.push(value);
 }
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{throw createApiError('ترميز JSON غير صالح.',400,{code:'INVALID_UTF8'});}
}

export function cursor(value,label){return value==null?0:integer(value,0,Number.MAX_SAFE_INTEGER,label);}

export function paginateDateCollection(items,url,{defaultLimit=30,maxLimit=100}={}){
 const from=url.searchParams.get('from');
 const to=url.searchParams.get('to');
 if(from&&!validDate(from))throw createApiError('تاريخ البداية غير صالح.',400,{code:'INVALID_DATE_RANGE'});
 if(to&&!validDate(to))throw createApiError('تاريخ النهاية غير صالح.',400,{code:'INVALID_DATE_RANGE'});
 const offset=cursor(url.searchParams.get('offset'),'بداية الصفحة');
 const limit=url.searchParams.get('limit')==null?defaultLimit:integer(url.searchParams.get('limit'),1,maxLimit,'حجم الصفحة');
 const filtered=(items||[]).filter(x=>(!from||x.date>=from)&&(!to||x.date<=to)).slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.at||'').localeCompare(a.at||''));
 return {
  total:filtered.length,
  offset,
  limit,
  nextOffset:offset+limit<filtered.length?offset+limit:null,
  items:filtered.slice(offset,offset+limit)
 };
}

export function wantsMinimalResponse(request,url){
 const view=url.searchParams.get('view')||url.searchParams.get('response');
 if(view==='receipt'||view==='minimal'||view==='delta')return true;
 const prefer=request.headers.get('Prefer')||'';
 if(/\breturn=minimal\b/i.test(prefer))return true;
 return false;
}
