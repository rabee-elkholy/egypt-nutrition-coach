import {AsyncLocalStorage} from 'node:async_hooks';
import {localDate} from '../coaching-shared.mjs';
const context=new AsyncLocalStorage();
export const clockNow=()=>context.getStore()??Date.now();
export const isoNow=()=>new Date(clockNow()).toISOString();
export const clockDate=()=>localDate(clockNow());
export function withClock(timestamp,operation){return context.run(timestamp,operation);}
export function simulationTime(state){
 const simulation=state?.simulation;
 if(!simulation)return undefined;
 return Date.parse(simulation.startedDate+'T12:00:00Z')+(simulation.day-1)*86400000+(state.revision||0)*1000;
}
