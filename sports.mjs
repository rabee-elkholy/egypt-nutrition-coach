// 2024 Adult Compendium, verified 2026-10-17. METs are population estimates.
import {apiError} from './coaching-error.mjs';
export const SPORTS = {
 walk:{label:'مشي متوسط (4.5–5.5 كم/ساعة)',met:3.8,code:'17190',page:'walking'},
 brisk:{label:'مشي سريع (5.6–6.3 كم/ساعة)',met:4.8,code:'17200',page:'walking'},
 jog:{label:'جري خفيف بالسرعة المناسبة لك',met:7.5,code:'12020',page:'running'},
 cycle:{label:'عجلة هادئة (أقل من 16 كم/ساعة)',met:4,code:'01010',page:'bicycling'},
 swim:{label:'سباحة حرة بطيئة',met:5.8,code:'18240',page:'water-activities'},
 football:{label:'كرة قدم ترفيهية',met:7,code:'15610',page:'sports'},
 weights:{label:'جيم — أوزان متعددة، 8–15 تكرارًا',met:3.5,code:'02054',page:'conditioning-exercise'},
 yoga:{label:'يوجا عامة',met:2.3,code:'02175',page:'conditioning-exercise'},
};
export function sportsEnergy(profile,weight,baseline){
 const mode=profile.exerciseMode ?? 'included',rows=profile.sports ?? [];
 if(!['included','separate'].includes(mode)||!Array.isArray(rows)||rows.length>8)throw apiError('INVALID_SPORT_MODE','exerciseMode must be included or separate with up to 8 sports rows.',{status:400});
 const days=Number(profile.trainingDays ?? profile.resistance ?? 0),seen=new Set();let minutes=0;
 const details=rows.map(r=>{
  if(!r||!Object.hasOwn(SPORTS,r.id)||seen.has(r.id))throw apiError('UNKNOWN_OR_DUPLICATE_SPORT','Sport ID is unknown or duplicated.',{status:400});seen.add(r.id);
  const min=Number(r.minutes),sessions=Number(r.sessions);
  if(!['string','number'].includes(typeof r.minutes)||!['string','number'].includes(typeof r.sessions)||!Number.isInteger(min)||min<5||min>180||!Number.isInteger(sessions)||sessions<1||sessions>7||sessions>days)throw apiError('INVALID_SPORT_SCHEDULE','Check sport minutes (5..180) and sessions per week (1..7).',{status:400});
  minutes+=min*sessions;
  const s=SPORTS[r.id],gross=s.met*3.5*weight/200*min;
  // Replace the average baseline energy for these minutes, rather than add gross exercise twice.
  const extra=Math.max(0,gross-baseline/1440*min)*sessions/7;
  return {id:r.id,minutes:min,sessions,met:s.met,code:s.code,source:'https://pacompendium.com/'+s.page+'/',daily_extra:extra};
 });
 if(minutes>days*180)throw apiError('SPORT_DURATION_EXCEEDED','Weekly sport duration exceeds the planning cap of 180 minutes average per training day.',{status:400});
 if(mode==='separate'&&days>0&&!rows.length)throw apiError('SPORT_REQUIRED_FOR_SEPARATE_MODE','Add at least one sport with duration when exerciseMode is separate.',{status:400});
 if(mode==='separate'&&rows.length&&rows.reduce((s,r)=>s+Number(r.sessions),0)<days)throw apiError('WORKOUT_DAYS_EXCEED_SPORTS','Training days count exceeds total weekly sport sessions declared.',{status:400});
 return {mode,details,daily_extra:mode==='separate'?details.reduce((s,r)=>s+r.daily_extra,0):0};
}
