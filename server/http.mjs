import {createApiError} from './logger.mjs';
import {integer,validDate} from '../coaching-shared.mjs';

export async function requestJson(request,maxBytes=40000){
 const reader=request.body?.getReader();
 if(!reader)throw createApiError('A JSON request body is required.',400,{code:'EMPTY_BODY'});
 const chunks=[];let size=0;
 while(true){
  const {done,value}=await reader.read();
  if(done)break;
  size+=value.byteLength;
  if(size>maxBytes){await reader.cancel();throw createApiError(maxBytes===40000?'Request body exceeds the 40 KB limit.':'Request body exceeds the maximum allowed byte limit.',413,{code:'PAYLOAD_TOO_LARGE'});}
  chunks.push(value);
 }
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{throw createApiError('Request body must be valid UTF-8 encoded text.',400,{code:'INVALID_UTF8'});}
}

export function cursor(value,label='offset'){return value==null?0:integer(value,0,Number.MAX_SAFE_INTEGER,label);}

export function paginateDateCollection(items,url,{defaultLimit=30,maxLimit=100}={}){
 const from=url.searchParams.get('from');
 const to=url.searchParams.get('to');
 if(from&&!validDate(from))throw createApiError('Invalid from date query parameter; expected YYYY-MM-DD.',400,{code:'INVALID_DATE_RANGE',params:{field:'from'}});
 if(to&&!validDate(to))throw createApiError('Invalid to date query parameter; expected YYYY-MM-DD.',400,{code:'INVALID_DATE_RANGE',params:{field:'to'}});
 const offset=cursor(url.searchParams.get('offset'),'offset');
 const limit=url.searchParams.get('limit')==null?defaultLimit:integer(url.searchParams.get('limit'),1,maxLimit,'limit');
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
