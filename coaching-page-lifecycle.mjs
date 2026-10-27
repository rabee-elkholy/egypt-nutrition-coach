// @ts-check
/** One timer and one set of listeners for each mounted page.
 * @param {{root:HTMLElement,refresh:()=>unknown,invalidate:()=>void,windowTarget?:Window,documentTarget?:Document,intervalMs?:number}} options
 */
export function createPageLifecycle({root,refresh,invalidate,windowTarget=window,documentTarget=document,intervalMs=60000}){
 let disposed=false,timer=null;
 const visible=()=>!disposed&&root.isConnected&&!root.hidden;
 const pause=()=>{if(timer!==null){windowTarget.clearInterval(timer);timer=null;}invalidate();root.ownerDocument.body?.classList.remove('planner-active');};
 const sync=()=>{if(!visible()){pause();return;}root.ownerDocument.body?.classList.add('planner-active');if(timer===null)timer=windowTarget.setInterval(refresh,intervalMs);};
 const onHash=()=>queueMicrotask(()=>{sync();if(visible())refresh();});
 const onFocus=()=>{sync();if(visible())refresh();};
 windowTarget.addEventListener('hashchange',onHash);
 windowTarget.addEventListener('planner-leave',pause);
 windowTarget.addEventListener('focus',onFocus);
 documentTarget.addEventListener('visibilitychange',onFocus);
 sync();
 return {sync,dispose(){if(disposed)return;disposed=true;pause();windowTarget.removeEventListener('hashchange',onHash);windowTarget.removeEventListener('planner-leave',pause);windowTarget.removeEventListener('focus',onFocus);documentTarget.removeEventListener('visibilitychange',onFocus);},get disposed(){return disposed;}};
}
