// Eight weeks is a product review interval, not a physiological expiry date.
export function splitReview(state, today) {
 const plan=state.workoutPlan;
 if(plan?.split!=='full_body')return null;
 const sessions=(state.sessions||[]).filter(s=>(plan.programId?s.programId===plan.programId:s.planId===plan.id)&&s.status==='completed'&&s.date<=today);
 const dates=[...new Set(sessions.map(s=>s.date))].sort();
 if(!dates.length)return null;
 const elapsed=(Date.parse(today)-Date.parse(dates[0]))/86400000;
 if(!Number.isFinite(elapsed)||elapsed<56)return null;
 const recent=dates.filter(d=>Date.parse(today)-Date.parse(d)<=28*86400000).length;
 const days=new Set(plan.days.map(d=>d.dayIndex)).size;
 const base='مراجعة بعد ٨ أسابيع: دي فرصة لتقييم الخطة، مش موعد انتهاء للـ Full Body. الدراسات بتلاقي نتائج متقاربة للقوة وبناء العضلات بين التقسيمات لما حجم التدريب الأسبوعي متساوي.';
 if(state.recovery?.status!=='ready')return {kind:'recovery',text:base+' سجّل حالتك واستشفاءك أولًا؛ مع الألم أو التعب الأولوية للراحة وتعديل الحمل، مش تغيير التقسيمة.'};
 if(dates.length<16||recent<Math.min(days*3,8))return {kind:'consistency',text:base+' خلّينا نثبت الانتظام الأول؛ محتاجين جلسات مكتملة وحديثة كفاية قبل اقتراح تغيير.'};
 if(days<4)return {kind:'stay',text:base+' مع '+days+' أيام أسبوعيًا، الاستمرار على الشامل اختيار عملي. لو وقتك يسمح بـ٤ أيام وعايز توزع مجهود الجلسة، تقدر تناقش علوي/سفلي من «بياناتي».'};
 return {kind:'suggest',text:base+' بما إنك بتتمرن ٤ أيام أو أكتر بانتظام واستشفاءك مناسب، نقترح تجربة علوي/سفلي لو الجلسات طويلة أو تفضل تركيزًا أكبر. تقسيم المجهود على الأيام قد يسهل إدارة التعب؛ مش ضمان لنتائج أسرع. تقدر تختاره من «بياناتي»، أو تكمل الشامل لو مناسبك.'};
}
