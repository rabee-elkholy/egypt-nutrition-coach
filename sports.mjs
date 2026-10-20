// 2024 Adult Compendium, verified 2026-10-17. METs are population estimates.
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
 if(!['included','separate'].includes(mode)||!Array.isArray(rows)||rows.length>8)throw Error('راجع طريقة حساب الرياضة');
 const days=Number(profile.trainingDays ?? profile.resistance ?? 0),seen=new Set();let minutes=0;
 const details=rows.map(r=>{
  if(!r||!Object.hasOwn(SPORTS,r.id)||seen.has(r.id))throw Error('رياضة غير معروفة أو مكررة');seen.add(r.id);
  const min=Number(r.minutes),sessions=Number(r.sessions);
  if(!['string','number'].includes(typeof r.minutes)||!['string','number'].includes(typeof r.sessions)||!Number.isInteger(min)||min<5||min>180||!Number.isInteger(sessions)||sessions<1||sessions>7||sessions>days)throw Error('راجع مدة الرياضة وعدد مرات ممارستها وأيام التمرين');
  minutes+=min*sessions;
  const s=SPORTS[r.id],gross=s.met*3.5*weight/200*min;
  // Replace the average baseline energy for these minutes, rather than add gross exercise twice.
  const extra=Math.max(0,gross-baseline/1440*min)*sessions/7;
  return {id:r.id,minutes:min,sessions,met:s.met,code:s.code,source:'https://pacompendium.com/'+s.page+'/',daily_extra:extra};
 });
 if(minutes>days*180)throw Error('مدة التمرين تتجاوز نطاق التخطيط الحالي: متوسط 3 ساعات لكل يوم تمرين');
 if(mode==='separate'&&days>0&&!rows.length)throw Error('أضف رياضة ومدتها، أو اختار النشاط الشامل للتمرين');
 if(mode==='separate'&&rows.length&&rows.reduce((s,r)=>s+Number(r.sessions),0)<days)throw Error('عدد أيام التمرين أكبر من مرات الرياضة التي أدخلتها');
 return {mode,details,daily_extra:mode==='separate'?details.reduce((s,r)=>s+r.daily_extra,0):0};
}
