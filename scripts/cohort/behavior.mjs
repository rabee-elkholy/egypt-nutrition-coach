import {rng,pick,chance,round,clamp,hash} from './common.mjs';
export function initialMemory(p,seed){return {rng:rng(seed+':behavior:'+p.userId).state(),stress:p.traits.workStress,fatigue:.2,motivation:p.traits.adherence,absence:0,travel:0,illness:0,plateau:0,weight:p.onboarding.weight,lastWorkout:{},previousMessages:[],previousOutcome:null,previousAcceptance:null};}
export function behavioralDay(p,m,context){
 const r=rng('',m.rng),t=p.traits,{day,date,planDay,workoutDay}=context;
 // Autoregressive latent stress and motivation, with persistent episodes and observed feedback.
 m.stress=clamp(.82*m.stress+.18*t.workStress+(r.next()-.5)*.28,0,1);
 if(chance(r,.04))m.stress=clamp(m.stress+.3,0,1);
 if(!m.travel&&chance(r,t.travelProbability))m.travel=2+Math.floor(r.next()*8);else m.travel=Math.max(0,m.travel-1);
 if(!m.illness&&chance(r,.007))m.illness=2+Math.floor(r.next()*5);else m.illness=Math.max(0,m.illness-1);
 if(!m.plateau&&chance(r,t.plateauPropensity*.1))m.plateau=5+Math.floor(r.next()*16);else m.plateau=Math.max(0,m.plateau-1);
 const sleep=round(clamp(t.sleepBaseline-m.stress*1.35-(m.travel?.6:0)+(r.next()-.5)*1.5,3,10),1);
 m.fatigue=clamp(.66*m.fatigue+.22*(8-sleep)/4+.15*m.stress+(m.illness?.2:0),0,1);
 const responseFeedback=m.previousMessages.some(x=>/مفيش|سجّل|تسجيل/.test(x))?.015:0;
 m.motivation=clamp(.94*m.motivation+.06*t.adherence+(m.previousOutcome==='completed'?.025:0)-m.stress*.015-t.burnoutSensitivity*.008+responseFeedback+(r.next()-.5)*.06,.05,.99);
 const open=m.absence?chance(r,t.returnProbability*(1-m.stress*.4)):chance(r,clamp(t.logging*.45+m.motivation*.65-m.fatigue*.18-(m.travel?.15:0),.04,.99));
 m.absence=open?0:m.absence+1;
 const pain=chance(r,.008+m.fatigue*.045),mealChoices=(planDay?.meals||[]).map(meal=>{const liked=meal.snapshot.ingredients.some(i=>t.foodLikes.some(l=>i.key.includes(l)||i.role===l)),burden=(planDay.meals.length>3&&t.work==='shift')?.08:0;return {mealId:meal.id,slot:meal.slot,eaten:chance(r,t.foodAdherence*.65+m.motivation*.35-m.stress*.18+(liked?.06:-.03)-burden),quantity:pick(r,[.6,.8,1,1,1,1.2,1.5]),logged:open&&chance(r,t.logging-m.stress*.18),late:chance(r,.08)};});
 const extra=chance(r,.16+m.stress*.25),outside=chance(r,(m.travel?.4:.08)+m.stress*.15),performed=!!workoutDay&&!m.illness&&chance(r,t.exerciseAdherence*.65+m.motivation*.4-m.fatigue*.35-(pain?.4:0));
 const partial=performed&&chance(r,.12+m.fatigue*.35),water=round(clamp(1.3+r.next()*2.2-(m.travel?.4:0),.5,4.8),2),steps=Math.round(clamp((p.onboarding.dailyActivity==='active'?11500:6000)*(1-m.fatigue*.45)+(r.next()-.5)*4000,500,20000));
 const direction=p.onboarding.goal==='lose'?-1:['gain','muscle_gain'].includes(p.onboarding.goal)&&p.onboarding.targetWeight!==p.onboarding.weight?1:0;
 // Hypothetical latent trajectory, never sent to the application except noisy measurements.
 m.weight=clamp(m.weight+(m.plateau?0:direction*.035*m.motivation)+(r.next()-.5)*.07,35,240);
 const chosen={openedApp:open,food:mealChoices,extra,outside,exercise:performed?(partial?'partial':'completed'):'missed',logExercise:open&&chance(r,t.logging),pain,sleepHours:sleep,fatigue:Math.max(1,Math.round(1+m.fatigue*4)),stress:Math.max(1,Math.round(1+m.stress*4)),soreness:round(m.fatigue*7,1),illness:!!m.illness,waterLiters:water,steps,trueWeight:round(m.weight,2),measuredWeight:open&&chance(r,t.weightLogging)?round(m.weight+(r.next()-.5)*.65,1):null,logRecovery:open&&chance(r,t.checkinLogging),logWater:open&&chance(r,t.logging),logSteps:open&&chance(r,t.logging*.6),travel:!!m.travel,absence:m.absence,motivation:round(m.motivation),swapMeal:open&&chance(r,.045),swapExercise:open&&chance(r,.025),reschedule:open&&chance(r,.025),correctOld:open&&chance(r,.035),changeGoal:open&&chance(r,.0015),changeDays:open&&chance(r,.0015),changeTimezone:open&&m.travel>0&&chance(r,.08),accept:chance(r,t.acceptAdvice),acceptLoad:chance(r,t.acceptAdvice),omitMetrics:chance(r,.22),truthCaveat:'hypothetical behavior; not clinical evidence'};
 m.previousOutcome=performed?chosen.exercise:'missed';m.rng=r.state();return chosen;
}
export function behaviorSignature(days){return hash(days.map(d=>({open:d.openedApp,exercise:d.exercise,travel:d.travel,pain:d.pain,food:d.food?.map(x=>[x.eaten,x.logged,x.quantity]),sleep:d.sleepHours})));}
