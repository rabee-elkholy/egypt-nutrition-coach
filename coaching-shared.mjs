export const MUSCLE_REGIONS = {
  chest:'الصدر',back:'الظهر',lower_back:'أسفل الظهر',shoulders:'الكتف',biceps:'البايسبس',triceps:'الترايسبس',forearms:'الساعد',abs:'البطن',glutes:'المقعدة',quadriceps:'الأماميات',hamstrings:'الخلفيات',calves:'السمانة',hips:'الحوض',neck:'الرقبة'
};
export const FOCUS_LABELS={full_body:'الجسم كله',upper:'الجزء العلوي',lower:'الجزء السفلي',push:'دفع',pull:'سحب',legs:'أرجل',chest:'صدر',back:'ظهر',shoulders:'أكتاف',arms:'ذراع',core:'بطن'};
export const SLOTS={breakfast:'فطار',lunch:'غداء',dinner:'عشاء',snack:'سناك'};
export function localDate(now=Date.now(),timeZone='Africa/Cairo'){
  return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
}
export function dateOffset(date,offset){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export function number(value,min,max,label){
 if(value==null||typeof value==='boolean'||!['number','string'].includes(typeof value)||(typeof value==='string'&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw Error(label+' خارج النطاق');
 return Number(value);
}
export function integer(value,min,max,label){const n=number(value,min,max,label);if(!Number.isSafeInteger(n))throw Error(label+' لازم يكون عددًا صحيحًا');return n;}
export function boolean(value,label,fallback){if(value===undefined&&fallback!==undefined)return fallback;if(typeof value!=='boolean')throw Error(label+' لازم يكون اختيار نعم أو لا');return value;}
export function stringList(value,label,max=100){if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!v||v.length>120))throw Error(label+' غير صالحة');return [...new Set(value)];}
export function plainRecord(value,label){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(label+' غير صالحة');return value;}
export function effectiveSets(s,exercise,date=localDate(),now=Date.now()){
 const a=s.sessionAdjustment;
 const factor=a&&date===localDate(now)&&Date.parse(a.expiresAt)>now&&(!a.planId||a.planId===s.workoutPlan?.id)?a.setFactor:1;
 return Math.max(1,Math.round(exercise.sets*factor));
}
export function dateForLog(date,now=Date.now()){if(!validDate(date)||date>localDate(now))throw Error('تاريخ التسجيل غير صالح أو في المستقبل.');if(date<dateOffset(localDate(now),-90))throw Error('التسجيل بأثر رجعي متاح لآخر 90 يومًا.');return date;}
export const needsHealthConfirmation=s=>s.onboarding?.serviceTrack==='workouts_only'&&s.onboarding?.workoutPrefs?.healthConfirmed!==true;
export function normalizeWeekdayDraft(draft){
 const basis=draft.weekdayConvention??'js_sunday_0';if(!['js_sunday_0','saturday_0'].includes(basis))throw Error('ترقيم أيام الأسبوع غير صالح.');
 const convert=value=>{const n=integer(value,0,6,'يوم الأسبوع');return basis==='saturday_0'?(n+6)%7:n;};
 const result={...draft,weekdayConvention:'js_sunday_0'};
 for(const key of ['selectedWorkoutDays','externalTrainingDays'])if(draft[key]!=null){if(!Array.isArray(draft[key])||draft[key].length>6)throw Error('أيام الأسبوع غير صالحة.');result[key]=draft[key].map(convert);}
 if(draft.dayLocations!=null){const value=plainRecord(draft.dayLocations,'أماكن الأيام');if(Object.keys(value).some(k=>!/^[0-6]$/.test(k)))throw Error('يوم الأسبوع غير صالح.');result.dayLocations=Object.fromEntries(Object.entries(value).map(([day,place])=>[convert(day),place]));}
 return result;
}
export function onboardingState(state){
 if(state.profile?.weekdayConvention!=='js_sunday_0')return state;
 const wp=state.onboarding?.workoutPrefs||{},convert=d=>(Number(d)+1)%7;
 return {...state,profile:{...state.profile,weekdayConvention:'saturday_0',workoutDays:state.profile.workoutDays?.map(convert)},onboarding:{...state.onboarding,workoutPrefs:{...wp,weekdayConvention:'saturday_0',selectedWorkoutDays:wp.selectedWorkoutDays?.map(convert),dayLocations:wp.dayLocations?Object.fromEntries(Object.entries(wp.dayLocations).map(([d,p])=>[convert(d),p])):null}}};
}
export const needsScheduleConfirmation=s=>!!s.workoutPlan&&s.profile?.weekdayConvention!=='js_sunday_0';
