import {clockNow,isoNow} from './clock.mjs';
import {localDate,dateForLog,validTimeZone,plainRecord,boolean,number,integer} from '../coaching-shared.mjs';
export const settingsActions=new Set(['timezone','notification_preferences','steps','activity']);
export function applySettingsCommand(s,action,p){
 const tz=s.profile?.timezone||'Africa/Cairo',currDate=localDate(clockNow(),tz);
 const dateForLogLocal=date=>dateForLog(date,clockNow(),tz);
 if(action==='timezone'){
  const nextTz=String(p.timezone||'').trim();
  if(!validTimeZone(nextTz))throw Error('المنطقة الزمنية غير صالحة.');
  const previousTz=s.profile.timezone||'Africa/Cairo';
  s.profile.timezone=nextTz;
  if(p.locale&&['ar-EG','ar-SA','en'].includes(p.locale))s.profile.locale=p.locale;
  s.history.push({kind:'timezone_change',at:isoNow(),from:previousTz,to:nextTz});
  return s;
 }
 if(action==='notification_preferences'){
  const prefs=plainRecord(p,'تفضيلات الإشعارات'),next={...s.notificationPreferences};
  for(const k of ['dailyReminder','workoutReminder','waterReminder','weeklyReviewReminder']){
   if(prefs[k]!==undefined)next[k]=boolean(prefs[k],k);
  }
  if(prefs.quietHoursStart!==undefined){
   if(typeof prefs.quietHoursStart!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.quietHoursStart))throw Error('وقت بداية الهدوء غير صالح.');
   next.quietHoursStart=String(prefs.quietHoursStart);
  }
  if(prefs.quietHoursEnd!==undefined){
   if(typeof prefs.quietHoursEnd!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.quietHoursEnd))throw Error('وقت نهاية الهدوء غير صالح.');
   next.quietHoursEnd=String(prefs.quietHoursEnd);
  }
  s.notificationPreferences=next;
  return s;
 }
 if(action==='steps'||action==='activity'){
  const date=dateForLogLocal(p.date||currDate);
  const steps=p.steps!=null?integer(p.steps,0,100000,'عدد الخطوات'):null;
  const activeEnergyKcal=p.activeEnergyKcal!=null?number(p.activeEnergyKcal,0,5000,'الطاقة النشطة'):null;
  const source=['manual','health_connect','apple_health','wearable'].includes(p.source)?p.source:'manual';
  const externalRecordId=p.externalRecordId?String(p.externalRecordId).slice(0,120):null;
  s.activityLogs||=[];
  if(externalRecordId&&s.activityLogs.some(x=>x.externalRecordId===externalRecordId))return s;
  s.activityLogs=s.activityLogs.filter(x=>!(x.date===date&&x.source===source&&!externalRecordId));
  s.activityLogs.push({id:crypto.randomUUID(),date,steps,activeEnergyKcal,source,externalRecordId,at:isoNow()});
  return s;
 }
}
