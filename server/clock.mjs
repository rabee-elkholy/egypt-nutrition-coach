import {AsyncLocalStorage} from 'node:async_hooks';
import {localDate,validTimeZone} from '../coaching-shared.mjs';
const context=new AsyncLocalStorage();
export const clockNow=()=>{
 const store=context.getStore();
 if(typeof store==='number')return store;
 return store?.timestamp??Date.now();
};
export const clockTimeZone=()=>{
 const store=context.getStore();
 if(typeof store==='object'&&store?.timeZone&&validTimeZone(store.timeZone))return store.timeZone;
 return 'Africa/Cairo';
};
export const isoNow=()=>new Date(clockNow()).toISOString();
export const clockDate=()=>localDate(clockNow(),clockTimeZone());
export function withClock(timestampOrContext,operation){
 const prev=context.getStore();
 if(timestampOrContext==null)return operation();
 if(typeof timestampOrContext==='number'){
  const tz=typeof prev==='object'&&prev?.timeZone?prev.timeZone:'Africa/Cairo';
  return context.run({timestamp:timestampOrContext,timeZone:tz},operation);
 }
 return context.run({
  timestamp:timestampOrContext.timestamp??(typeof prev==='number'?prev:(prev?.timestamp??Date.now())),
  timeZone:validTimeZone(timestampOrContext.timeZone)?timestampOrContext.timeZone:(typeof prev==='object'&&prev?.timeZone?prev.timeZone:'Africa/Cairo')
 },operation);
}
export function simulationTime(state){
 const simulation=state?.simulation;
 const timeZone=state?.profile?.timezone||'Africa/Cairo';
 if(!simulation)return {timestamp:undefined,timeZone};
 const ts=Date.parse(simulation.startedDate+'T12:00:00Z')+(simulation.day-1)*86400000+(state.revision||0)*1000;
 return {timestamp:ts,timeZone};
}
