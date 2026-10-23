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
export function number(value,min,max,label){if(value==null||value===''||typeof value==='boolean'||!['number','string'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw Error(label+' خارج النطاق');return Number(value);}
export function dateForLog(date,now=Date.now()){if(!validDate(date)||date>localDate(now))throw Error('تاريخ التسجيل غير صالح أو في المستقبل.');if(date<dateOffset(localDate(now),-90))throw Error('التسجيل بأثر رجعي متاح لآخر 90 يومًا.');return date;}
