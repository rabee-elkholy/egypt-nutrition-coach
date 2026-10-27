// @ts-check
/** Reads are disposable. Mutations keep their original envelope across uncertainty.
 * @param {{scope?:()=>boolean,fetcher?:typeof fetch}} options
 */
export function createCoachingApiClient({scope=()=>false,fetcher=globalThis.fetch}={}){
 let epoch=0,disposed=false;
 const reads=new Set();
 const stale=()=>new DOMException('', 'AbortError');
 function invalidateReads(){epoch++;for(const controller of reads)controller.abort();reads.clear();}
 /** @param {string} path @param {RequestInit} [options] */
 async function request(path,options={}){
  const read=(options.method||'GET')==='GET',version=epoch,namespace=scope();
  if(disposed)throw stale();
  const controller=read?new AbortController():null;
  if(controller)reads.add(controller);
  try{
   const response=await fetcher('/v1/'+path+(namespace?(path.includes('?')?'&':'?')+'simulation=1':''),{...options,...(controller?{signal:controller.signal}:{})});
   const data=await response.json();
   if(read&&(disposed||version!==epoch||namespace!==scope()))throw stale();
   if(!response.ok)throw Object.assign(Error(data.error||'تعذر الاتصال'),{status:response.status});
   return data;
  }catch(error){if(read&&(disposed||version!==epoch||controller?.signal.aborted))throw stale();throw error;}
  finally{if(controller)reads.delete(controller);}
 }
 return {request,invalidateReads,dispose(){disposed=true;invalidateReads();},get pendingReads(){return reads.size;}};
}
