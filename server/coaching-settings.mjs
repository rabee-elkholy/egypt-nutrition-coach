import {clockNow,isoNow} from './clock.mjs';
import {localDate,dateForLog,validTimeZone,plainRecord,boolean,number,integer,normalizeLocale} from '../coaching-shared.mjs';
import {apiError} from '../coaching-error.mjs';
export const settingsActions=new Set(['timezone','notification_preferences','steps','activity']);
export function applySettingsCommand(s,action,p){
 const tz=s.profile?.timezone||'Africa/Cairo',currDate=localDate(clockNow(),tz);
 const dateForLogLocal=date=>dateForLog(date,clockNow(),tz);
 if(action==='timezone'){
  const hasTz=p.timezone!=null&&String(p.timezone).trim()!=='';
  const hasLocale=p.locale!=null&&String(p.locale).trim()!=='';
  if(!hasTz&&!hasLocale)throw apiError('INVALID_TIMEZONE','Provide a valid IANA timezone or locale.',{status:400,fieldErrors:[{field:'timezone',code:'INVALID_TIMEZONE',message:'Invalid IANA timezone identifier.'}]});
  const previousTz=s.profile.timezone||'Africa/Cairo';
  let nextTz=previousTz;
  if(hasTz){
   nextTz=String(p.timezone).trim();
   if(!validTimeZone(nextTz))throw apiError('INVALID_TIMEZONE','Invalid IANA timezone identifier.',{status:400,fieldErrors:[{field:'timezone',code:'INVALID_TIMEZONE',message:'Invalid IANA timezone identifier.'}]});
   s.profile.timezone=nextTz;
  }
  if(hasLocale){
   const rawLoc=String(p.locale).trim();
   const loc=normalizeLocale(rawLoc,null);
   if(!loc)throw apiError('INVALID_LOCALE','Unsupported locale code.',{status:400,params:{locale:rawLoc},fieldErrors:[{field:'locale',code:'INVALID_LOCALE',message:'Unsupported locale code.'}]});
   s.profile.locale=loc;
  }
  if(nextTz!==previousTz)s.history.push({kind:'timezone_change',at:isoNow(),from:previousTz,to:nextTz});
  return s;
 }
 if(action==='notification_preferences'){
  const prefs=plainRecord(p,'notificationPreferences'),next={...s.notificationPreferences};
  for(const k of ['dailyReminder','workoutReminder','waterReminder','weeklyReviewReminder','mealReminders','fastingReminder','ramadanSuhoorReminder','exemptSuhoorFromQuietHours']){
   if(prefs[k]!==undefined)next[k]=boolean(prefs[k],k);
  }
  if(prefs.preferredWorkoutReminderMinutesBefore!==undefined){
   const mins=integer(prefs.preferredWorkoutReminderMinutesBefore,15,120,'preferredWorkoutReminderMinutesBefore');
   if(![15,30,60,120].includes(mins))throw apiError('NUMBER_OUT_OF_RANGE','preferredWorkoutReminderMinutesBefore must be 15, 30, 60, or 120.',{status:400,params:{field:'preferredWorkoutReminderMinutesBefore',min:15,max:120}});
   next.preferredWorkoutReminderMinutesBefore=mins;
  }
  if(prefs.channels!==undefined){
   if(!Array.isArray(prefs.channels)||prefs.channels.some(c=>!['in_app','push'].includes(c)))throw apiError('INVALID_STRING_LIST','channels must contain only in_app or push.',{status:400,params:{field:'channels'}});
   next.channels=[...new Set(prefs.channels)];
   next.channelsConfigured=true;
  }
  if(prefs.quietHoursStart!==undefined){
   if(typeof prefs.quietHoursStart!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.quietHoursStart))throw apiError('INVALID_QUIET_HOURS','quietHoursStart must be formatted as 24-hour HH:mm.',{status:400,params:{field:'quietHoursStart'},fieldErrors:[{field:'quietHoursStart',code:'INVALID_QUIET_HOURS',message:'quietHoursStart must be formatted as 24-hour HH:mm.'}]});
   next.quietHoursStart=String(prefs.quietHoursStart);
  }
  if(prefs.quietHoursEnd!==undefined){
   if(typeof prefs.quietHoursEnd!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs.quietHoursEnd))throw apiError('INVALID_QUIET_HOURS','quietHoursEnd must be formatted as 24-hour HH:mm.',{status:400,params:{field:'quietHoursEnd'},fieldErrors:[{field:'quietHoursEnd',code:'INVALID_QUIET_HOURS',message:'quietHoursEnd must be formatted as 24-hour HH:mm.'}]});
   next.quietHoursEnd=String(prefs.quietHoursEnd);
  }
  if(next.quietHoursStart&&next.quietHoursEnd&&next.quietHoursStart===next.quietHoursEnd){
   throw apiError('INVALID_QUIET_HOURS','quietHoursStart and quietHoursEnd cannot be identical.',{status:400,params:{field:'quietHoursEnd'},fieldErrors:[{field:'quietHoursEnd',code:'INVALID_QUIET_HOURS',message:'quietHoursStart and quietHoursEnd cannot be identical.'}]});
  }
  s.notificationPreferences=next;
  return s;
 }
 if(action==='steps'||action==='activity'){
  const date=dateForLogLocal(p.date||currDate);
  const steps=p.steps!=null?integer(p.steps,0,100000,'steps'):null;
  const activeEnergyKcal=p.activeEnergyKcal!=null?number(p.activeEnergyKcal,0,5000,'activeEnergyKcal'):null;
  if(steps==null&&activeEnergyKcal==null)throw apiError('EMPTY_ACTIVITY_RECORD','Provide steps or activeEnergyKcal for an activity log.',{status:400});
  const source=['manual','health_connect','apple_health','wearable'].includes(p.source)?p.source:'manual';
  const externalRecordId=p.externalRecordId?String(p.externalRecordId).slice(0,120):null;
  s.activityLogs||=[];
  if(externalRecordId&&s.activityLogs.some(x=>x.externalRecordId===externalRecordId))return s;
  s.activityLogs=s.activityLogs.filter(x=>!(x.date===date&&x.source===source&&(!externalRecordId||!x.externalRecordId)));
  s.activityLogs.push({id:crypto.randomUUID(),date,steps,activeEnergyKcal,source,externalRecordId,at:isoNow()});
  return s;
 }
}
