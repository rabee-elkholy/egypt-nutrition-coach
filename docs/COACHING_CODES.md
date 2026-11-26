# CuraFit API — Canonical Coaching & Brief Codes Reference

Generated automatically from [`contracts/coaching-codes.json`](../contracts/coaching-codes.json).

> **KMM Localization Rule:** Server coaching, readiness, brief, eligibility, and adaptation responses emit canonical pure-English text alongside a stable `code` / `reasonCode` and structured `params`. Mobile clients localize into Arabic and any other locale strictly by `code` + `params`.

| Code | Domain | Severity | Params | Canonical English Message |
| :--- | :--- | :---: | :--- | :--- |
| `RED_FLAGS_STOP` | `recovery` | `urgent` | — | Urgent safety notice: stop exercising immediately and seek medical evaluation for symptoms such as chest pain or severe dizziness. |
| `WORKOUT_PAIN_HOLD` | `recovery` | `hold` | — | Pain was logged during your recent workout, so load progression is paused. Update your recovery check-in before resuming heavy effort. |
| `FEEDBACK_PAIN_HOLD` | `recovery` | `hold` | — | You reported pain as a training barrier. Stop painful movements and submit a pain-free recovery check-in before increasing load. |
| `CHECKIN_MISSING_OR_STALE` | `recovery` | `normal` | — | Submit today's recovery check-in (sleep, fatigue, and pain status) so the CuraFit Specialist Team can safely calibrate today's workout load. |
| `ILLNESS_HOLD` | `recovery` | `hold` | — | Health comes first: pause today's workout while experiencing illness symptoms and consult a clinician if symptoms persist. |
| `JOINT_PAIN_HOLD` | `recovery` | `hold` | `painRegions` | Joint pain reported; pause painful movements, use safe alternatives or rest, and pause progression until pain resolves. |
| `RECOVERY_READY` | `recovery` | `normal` | — | Current recovery check-in supports normal training intensity while monitoring technique and perceived effort. |
| `RECOVERY_DELOAD_SUGGESTED` | `recovery` | `attention` | `setFactor`, `domains` | Multiple fatigue or sleep indicators are elevated; a temporary 24-hour set reduction is recommended pending your approval. |
| `RECOVERY_DELOAD_PROPOSAL` | `adaptation` | `attention` | `setFactor`, `regions` | Based on recent recovery strain, we propose temporarily reducing working sets for 24 hours; applying this adjustment requires your approval. |
| `RECOVERY_ADJUSTMENT_ACTIVE` | `review` | `attention` | `setFactor`, `expiresAt` | Your approved temporary set reduction is currently active for today's workout. |
| `RECOVERY_ADVICE_DECLINED` | `review` | `normal` | — | Your previous choice to decline the set reduction is saved. Your workout plan remains unchanged until a new recovery check-in is logged. |
| `SCHEDULE_CONFIRMATION_REQUIRED` | `review` | `attention` | — | Confirm your weekly workout days before CuraFit Specialist Team training and adaptive reviews run. |
| `HEALTH_CONFIRMATION_REQUIRED` | `review` | `attention` | — | Confirm health readiness clearance before CuraFit Specialist Team reviews run. |
| `WORKOUT_SAFETY_EXCLUSION_HOLD` | `review` | `hold` | `count` | Your current workout plan contains movements excluded for your declared injuries; swap them or regenerate your plan before progressing. |
| `PLAN_CONSTRAINTS_VERIFICATION_FAILED` | `review` | `hold` | — | Your existing nutrition plan no longer satisfies current dietary constraints; regenerate your plan. |
| `RECOVERY_NOT_READY_FOR_CALORIE_CHANGE` | `nutrition` | `normal` | — | Calorie adjustments are paused until sleep and recovery readiness stabilize. |
| `WORKOUTS_ONLY_TRACK` | `nutrition` | `normal` | — | Your account is currently on the workouts-only track with no active nutrition plan. |
| `GOAL_WEIGHT_REACHED_MAINTENANCE` | `adaptation` | `normal` | `averageWeight`, `targetWeight` | Your 7-day average weight has reached your target weight ({averageWeight} kg). We propose transitioning to a maintenance plan. |
| `MAINTENANCE_ADVICE_DECLINED` | `nutrition` | `normal` | — | Your choice to decline the maintenance transition is saved. Your current goal remains unchanged until new data arrives. |
| `COOLDOWN_14D` | `review` | `normal` | — | Monitoring your response to the last adjustment; at least 14 days are required before proposing another calorie or volume change. |
| `INSUFFICIENT_EVIDENCE_COVERAGE` | `nutrition` | `normal` | `previousWeights`, `currentWeights`, `completeFoodDays` | Keep logging: adaptive calorie reviews require at least 3 weigh-ins in each of the last 2 weeks and 10 adherent complete food days. |
| `WEIGHT_SAMPLING_TOO_CLOSE` | `nutrition` | `normal` | — | Spread weigh-ins across the week so trend velocity can be calculated reliably. |
| `TREND_ON_TRACK` | `nutrition` | `normal` | `rate` | Your 2-week weight trend ({rate}%/week) is within the expected target range; no calorie adjustment is needed. |
| `CALORIE_DEFICIT_STEP` | `adaptation` | `normal` | `delta`, `rate` | Based on adherent food logs and a {rate}%/week weight trend, we propose a modest {delta} kcal daily reduction. |
| `CALORIE_SURPLUS_STEP` | `adaptation` | `normal` | `delta`, `rate` | Based on adherent food logs and a {rate}%/week weight trend, we propose a modest +{delta} kcal daily increase. |
| `PERFORMANCE_DROP_CALORIE_CUT_HOLD` | `nutrition` | `attention` | — | Training performance declined recently; calories are held steady to protect lean mass and recovery instead of cutting further. |
| `APPETITE_ENERGY_REVIEW_REQUIRED` | `nutrition` | `attention` | — | High hunger or low energy was recently logged; calories are held steady pending follow-up instead of reducing right now. |
| `CALORIE_ADVICE_DECLINED` | `nutrition` | `normal` | — | Your previous choice to decline a calorie change is saved; your plan was not modified. |
| `MIN_SAFE_ENERGY_FLOOR_HOLD` | `nutrition` | `attention` | `minEnergyFloor` | Calories were held at the safe planning floor ({minEnergyFloor} kcal) instead of reducing further. |
| `MAX_SAFE_ENERGY_CEILING_HOLD` | `nutrition` | `attention` | `maxEnergyCeiling` | Calories were held at the safe planning ceiling ({maxEnergyCeiling} kcal). |
| `MATERNAL_CALORIE_CUT_BLOCKED` | `nutrition` | `hold` | — | Calorie reductions are disabled during pregnancy for maternal safety. |
| `PLAN_CONSTRAINTS_ADJUSTMENT_HOLD` | `nutrition` | `attention` | — | Current calories were kept because the proposed change could not satisfy your dietary, macro, or exclusion constraints. |
| `HEALTH_OR_SCHEDULE_UNCONFIRMED` | `training` | `attention` | — | Confirm health readiness and workout schedule before volume progression is evaluated. |
| `GOAL_NOT_MUSCLE_GAIN` | `training` | `normal` | — | Progressive weekly set increases apply to muscle-gain plans; holding volume does not mean your current training is insufficient. |
| `RECOVERY_BASELINE_NOT_READY` | `training` | `normal` | — | At least 7 valid recovery check-ins are needed to establish a baseline before proposing extra weekly sets. |
| `INSUFFICIENT_SESSION_ADHERENCE` | `training` | `normal` | — | Complete at least 80% of scheduled sessions over the past 2 weeks before adding weekly volume. |
| `WEEKLY_VOLUME_INCREASE_PROPOSED` | `adaptation` | `normal` | `exerciseId`, `region`, `extraSets` | Strong adherence and stable performance over the last 3 exposures support adding +{extraSets} weekly set. |
| `VOLUME_INCREASE_NOT_JUSTIFIED` | `training` | `normal` | — | Current workout logs do not yet meet criteria for adding weekly volume; continue consistent logging. |
| `WORKOUT_RESCHEDULE_PROPOSAL` | `adaptation` | `normal` | `dayIndex`, `fromDate`, `toDate` | Confirm moving your scheduled workout from {fromDate} to {toDate} while keeping daily calorie targets steady. |
| `ADAPTATION_PROPOSED` | `review` | `normal` | — | A new coaching recommendation is ready for your review and approval. |
| `NO_CHANGE_NEEDED` | `review` | `normal` | — | No plan adjustment is proposed based on current evidence; review coverage and readiness details below. |
| `INSUFFICIENT_EXPOSURES_OR_RECOVERY` | `progression` | `normal` | — | Log at least two comparable sessions with ready recovery before load increases are suggested. |
| `UNILATERAL_BOTH_SIDES_REQUIRED` | `progression` | `normal` | — | Confirm both left and right sides are completed equally before increasing load on unilateral exercises. |
| `REP_OR_RIR_THRESHOLD_NOT_MET` | `progression` | `normal` | — | Reach the top of the prescribed rep range at or above target RIR across two sessions before increasing weight. |
| `UNIFORM_LOAD_REQUIRED` | `progression` | `normal` | — | Complete all working sets at the same load across two sessions before increasing weight. |
| `BODYWEIGHT_PROGRESSION_REPS_ONLY` | `progression` | `normal` | — | Progress bodyweight movements through additional reps and tempo control. |
| `VALID_INCREMENT_REQUIRED` | `progression` | `normal` | — | Current weight increment exceeds conservative progression bounds (<= 5%); build reps and control first. |
| `DOUBLE_PROGRESSION_READY` | `progression` | `normal` | `kg` | Target reps achieved cleanly across two consecutive sessions; consider progressing to {kg} kg if technique and recovery feel solid. |
| `AGE_UNSUPPORTED_OR_MISSING` | `eligibility` | `requires_review` | — | CuraFit Specialist Team plans are available for adults aged 18 to 95 only. |
| `SENIOR_MODE_ACTIVE` | `eligibility` | `info` | — | Senior safety mode (70+) is active: moderate deficit cap (-400 kcal), protein floor >= 1.2 g/kg, and joint-friendly low-impact exercises. |
| `CLINICAL_OR_INJURY_REQUIRES_REVIEW` | `eligibility` | `requires_review` | — | Declared clinical conditions or injuries require direct specialist review before plan generation. |
| `BMI_OUT_OF_RANGE` | `eligibility` | `requires_review` | — | Height and weight fall outside the standard CuraFit Specialist Team planning BMI range (12.5 to 65). |
| `UNDERWEIGHT_LOSS_FORBIDDEN` | `eligibility` | `requires_review` | — | Weight loss goals are unsafe when current BMI is below 18.5. |
| `MATERNAL_WEIGHT_LOSS_FORBIDDEN` | `eligibility` | `requires_review` | — | Weight loss goals are disabled during pregnancy for maternal and fetal safety. |
| `CONFIRM_WORKOUT_HEALTH` | `eligibility` | `needs_input` | — | Confirm that you have no acute condition or injury requiring specialist clearance before starting workouts. |
| `CONFIRM_EXTERNAL_TRAINING_DAYS` | `eligibility` | `needs_input` | — | Optional: specify external resistance training days per week for muscle-gain nutrition calibration. |
| `BRIEF_FOOD_COMPLETE` | `brief` | `normal` | `date` | Food diary for {date} is complete. Consistent logging enables accurate weekly reviews. |
| `BRIEF_FOOD_PARTIAL` | `brief` | `normal` | `entriesCount` | You have logged {entriesCount} meal(s) today and your day is still open; finish logging as you eat. |
| `BRIEF_FOOD_MISSING` | `brief` | `normal` | — | No meals logged yet today; start by logging your next actual meal. |
| `BRIEF_PROTEIN_STATUS` | `brief` | `normal` | `actualProtein`, `targetProtein` | Logged protein today is {actualProtein} g against your {targetProtein} g target. |
| `BRIEF_WEIGHT_TREND` | `brief` | `normal` | `currentAvg`, `currentCount`, `previousAvg`, `previousCount` | Current 7-day average weight is {currentAvg} kg ({currentCount} logs) vs. {previousAvg} kg ({previousCount} logs) last week. |
| `BRIEF_WEIGHT_COVERAGE` | `brief` | `normal` | `count` | You have {count} weigh-ins in the last 14 days; log at least 3 weigh-ins per week for reliable trend comparisons. |
| `BRIEF_PLAN_EXPIRED` | `brief` | `attention` | — | Your previous 7-day nutrition plan has ended. Renew your plan to generate targets for the upcoming week. |
| `BRIEF_HIGH_HUNGER` | `brief` | `attention` | `hunger`, `date` | You logged hunger {hunger}/5 on {date}; calorie reductions are paused while we monitor appetite and energy. |
| `BRIEF_TRAINING_SAFETY` | `brief` | `urgent` | — | Current recovery or safety flags indicate pausing heavy exercise and reviewing symptoms first. |
| `BRIEF_TRAINING_SCHEDULED` | `brief` | `normal` | `focus` | Today's scheduled workout is {focus}. Current readiness supports your planned session. |
| `BRIEF_TRAINING_REST` | `brief` | `normal` | `nextDate`, `nextFocus` | Rest day today. Focus on sleep, hydration, and nutrition ahead of your next session. |
| `BRIEF_TRAINING_COMPLETED` | `brief` | `normal` | `date`, `duration` | Workout session for {date} is logged as completed. Great consistency. |
| `BRIEF_TRAINING_PARTIAL` | `brief` | `normal` | — | Today's workout is logged as partial; logging actual effort protects recovery and progression accuracy. |
| `BRIEF_TRAINING_MISSED` | `brief` | `normal` | — | Today's workout is marked missed. Resume normally on your next scheduled day without doubling volume. |
| `BRIEF_FOLLOWUP_WATER` | `brief` | `normal` | `cups`, `targetCups` | Hydration logged today: {cups} of {targetCups} cups. |
| `BRIEF_FOLLOWUP_SHORT_SLEEP` | `brief` | `normal` | `sleepHours`, `date` | Last logged sleep was {sleepHours} hours on {date}; prioritize recovery and earlier wind-down tonight. |
| `BRIEF_FOLLOWUP_RETURN` | `brief` | `normal` | `lastDate` | Welcome back! Last logged activity was on {lastDate}. Resume smoothly without trying to compensate for missed days. |
| `BRIEF_FIRST_WEEK` | `brief` | `normal` | `day`, `activeDays` | First-week onboarding guidance (Day {day}/7): build a simple, repeatable logging habit. |
| `COACHING_BARRIER_AGREEMENT` | `coaching` | `normal` | `domain`, `barrier` | A structured coaching agreement is proposed for your reported {barrier} barrier. |
| `COACHING_BARRIER_QUESTION` | `coaching` | `normal` | `domain` | Tell us the main barrier affecting your recent {domain} consistency so we can choose a realistic next step. |
| `COACHING_REVIEW_DUE` | `coaching` | `attention` | `caseId` | Your agreed coaching step is due for review. Report whether it helped, did not help, or was not tried. |
| `COMEBACK_DELOAD_ACTIVE` | `training` | `normal` | `tier`, `setFactor`, `expiresAt` | Gentle comeback ramp-in is active ({setFactor}x sets) to help you rebuild momentum safely. |
| `BRIEF_TRAINING_PERFORMANCE` | `brief` | `attention` | `exerciseId`, `fromKg`, `toKg` | Average load for {exerciseId} moved from {fromKg} to {toKg} kg; prioritizing recovery before pushing load or deeper calorie cuts. |
| `BRIEF_FOLLOWUP_TIRED` | `brief` | `attention` | — | You reported low energy or fatigue during follow-up; training load and calorie cuts are held conservatively. |
| `BRIEF_FOLLOWUP_SLEEP` | `brief` | `normal` | `sleepHours`, `date` | Last logged sleep was {sleepHours} hours on {date}. Consistent logging helps spot trends early. |
| `BRIEF_FOLLOWUP_ACTIVITY` | `brief` | `normal` | — | Recent daily step or movement feedback was logged and factored into your weekly coaching context. |
| `VOLUME_HOLD` | `training` | `normal` | `muscle`, `currentSets` | Weekly volume for {muscle} is held at {currentSets} sets while monitoring recovery and progression. |
| `CARDIO_HIGH_IMPACT_CAUTION` | `training` | `attention` | `modality`, `reasons` | High-impact cardio ({modality}) logged alongside joint, pregnancy, or senior safety considerations ({reasons}); consider low-impact alternatives like walking, cycling, or swimming if discomfort arises. |
| `CYCLE_LUTEAL_WATER_RETENTION` | `brief` | `normal` | `cycleDay` | Cycle day {cycleDay} (late luteal phase): temporary 0.5-2.0 kg water retention is normal; stay steady on your calorie target and avoid reacting to short-term scale jumps. |
| `CYCLE_MENSTRUAL_GENTLE_TRAINING` | `brief` | `normal` | `cycleDay` | Cycle day {cycleDay} (menstrual phase): listen to energy and cramp levels; lighter loads, walking, or extra rest are completely normal today. |
| `CYCLE_FOLLICULAR_PEAK_READINESS` | `brief` | `normal` | `cycleDay` | Cycle day {cycleDay} (follicular phase): energy and recovery readiness are often higher during this window; a good time for quality resistance sessions. |
| `CYCLE_PAUSED_PREGNANCY` | `brief` | `normal` | `maternalStatus` | Menstrual cycle predictions are paused during pregnancy ({maternalStatus}); maternal safety guidance remains active. |
| `BRIEF_TRAINING_PERFORMANCE_UP` | `brief` | `normal` | `exerciseId`, `fromKg`, `toKg` | Average load for {exerciseId} progressed from {fromKg} to {toKg} kg. |
| `BRIEF_TRAINING_PERFORMANCE_REPS` | `brief` | `normal` | `exerciseId`, `fromReps`, `toReps` | Reps for {exerciseId} progressed from {fromReps} to {toReps}. |
| `SPLIT_REVIEW_SUGGEST_UPPER_LOWER` | `training` | `normal` | `days` | Because you train {days}+ days consistently with ready recovery, Upper/Lower or Push/Pull/Legs is available in Preferences if sessions feel long or you prefer dedicated focus days. |
| `SPLIT_REVIEW_KEEP_FULL_BODY` | `training` | `normal` | `days` | At {days} training days per week, continuing with Full Body remains practical and time-efficient. |
| `SPLIT_REVIEW_RECOVERY_FIRST` | `training` | `attention` | `days` | Submit a fresh ready recovery check-in first; when managing pain or fatigue, recovery takes priority over changing splits. |
| `SPLIT_REVIEW_BUILD_CONSISTENCY` | `training` | `normal` | `days`, `completedCount` | Focus on session consistency first; build at least 16 completed sessions ({completedCount} logged) and steady recent adherence before switching splits. |
| `SPLIT_REVIEW_NOT_DUE` | `training` | `normal` | — | 8-week Full Body split review is available after 8 weeks and 16+ completed workouts on a 4+ day Full Body program. |
| `SEASONAL_EID_FLEX_ACTIVE` | `nutrition` | `normal` | `occasion`, `endDate` | Seasonal Flex Mode ({occasion}) is active through {endDate} at maintenance calories without streak penalty. |
| `CYCLE_GENTLE_SESSION_ACTIVE` | `training` | `normal` | — | Cycle comfort adjustment is active with 0.8x working sets for 24 hours. |
| `PARQ_CLEARANCE_REQUIRED` | `eligibility` | `requires_review` | — | Physician clearance is required before workout planning after a positive PAR-Q screening response. You can switch to nutrition_only in the meantime. |
| `CONFLICTING_CONDITIONS` | `eligibility` | `requires_review` | `conditions` | diabetes_t1 and diabetes_t2 are mutually exclusive and cannot be selected together. |
| `MULTI_CONDITION_CLINICAL_REVIEW` | `eligibility` | `requires_review` | — | Multiple overlapping or high-acuity clinical conditions require direct specialist review before plan generation. |
| `MULTI_INJURY_WARNING` | `eligibility` | `warning` | — | Three concurrent injuries limit available exercises; monitor joint comfort closely or consider switching to nutrition_only during recovery. |
| `MULTI_INJURY_REQUIRES_REVIEW` | `eligibility` | `requires_review` | — | Four or more concurrent injuries (or infeasible workout day coverage) require specialist review before workout planning; switch to nutrition_only or seek clinical clearance. |
| `PLAN_HYPOTHYROID_REE_CALIBRATION` | `nutrition` | `info` | — | Applied conservative 5% REE calibration for hypothyroidism; monitor actual weight trend. |
| `PLAN_SENIOR_DEFICIT_CAP` | `nutrition` | `info` | — | Senior safety mode (70+): daily calorie deficit capped at -400 kcal. |
| `PLAN_RECOMPOSITION_MAINTENANCE` | `nutrition` | `info` | — | Body recomposition starts at maintenance calories with progressive resistance training. |
| `PLAN_ADAPTIVE_GOAL_PACE` | `nutrition` | `info` | — | Goal pace sets a bounded initial offset; actual energy needs are calibrated from recorded weight trends. |
| `PLAN_PREGNANCY_T1_CALIBRATION` | `nutrition` | `info` | — | First-trimester pregnancy calibration applied (maintenance baseline, calorie deficits disabled). |
| `PLAN_PREGNANCY_T2_CALIBRATION` | `nutrition` | `info` | — | Second-trimester pregnancy calibration applied (+340 kcal/day, deficits and extra gain surplus disabled). |
| `PLAN_PREGNANCY_T3_CALIBRATION` | `nutrition` | `info` | — | Third-trimester pregnancy calibration applied (+450 kcal/day, deficits and extra gain surplus disabled). |
| `PLAN_BREASTFEEDING_CALIBRATION` | `nutrition` | `info` | — | Breastfeeding calibration applied (+400 kcal baseline, max deficit -300 kcal/day). |
| `PLAN_MIN_ENERGY_FLOOR_APPLIED` | `nutrition` | `attention` | `minEnergyFloor` | Daily energy raised to the safe planning floor ({minEnergyFloor} kcal). |
| `PLAN_MAX_ENERGY_CEILING_APPLIED` | `nutrition` | `attention` | — | Daily energy capped at the safe planning ceiling (4200 kcal). |
| `PLAN_UNDERWEIGHT_NUTRIENT_CARE` | `nutrition` | `info` | — | BMI is below 18.5 (underweight): focus on nutrient-dense meals and gradual intake progression. |
| `PLAN_ABW_PROTEIN_SCALING` | `nutrition` | `info` | — | Protein targets use Adjusted Body Weight (ABW) for BMI > 30 to avoid excessive portions. |
| `PLAN_GOUT_PROTEIN_CAP` | `nutrition` | `info` | — | Protein capped at 1.4 g/kg and high-purine red meats/offal excluded for gout. |
| `PLAN_KIDNEY_PROTEIN_CAP` | `nutrition` | `info` | — | Protein conservatively capped at <= 1.1 g/kg for kidney condition support. |
| `PLAN_IBS_EXCLUSIONS_ACTIVE` | `nutrition` | `info` | — | Heavy legumes, cabbage, and raw alliums excluded for IBS comfort. |
| `PLAN_HYPERTENSION_SODIUM_CEILING` | `nutrition` | `info` | — | Low-sodium ceiling and high-sodium cheese exclusions enabled for blood pressure support. |
| `PLAN_CELIAC_GLUTEN_EXCLUSION` | `nutrition` | `info` | — | Gluten-containing grains and breads are excluded for celiac safety. |
| `PLAN_FAVISM_EXCLUSION` | `nutrition` | `info` | — | Fava beans and falafel are excluded for favism (G6PD) safety. |
| `PLAN_LACTOSE_EXCLUSION` | `nutrition` | `info` | — | Dairy products are excluded for lactose intolerance comfort. |
| `PLAN_GLYCEMIC_CARB_CALIBRATION` | `nutrition` | `info` | — | Carbohydrate share calibrated to ~38% of daily energy for glycemic support. |
| `PLAN_GAIN_WITHOUT_RESISTANCE` | `nutrition` | `info` | — | Calorie surplus without resistance training does not guarantee lean mass gain. |
| `PLAN_MUSCLE_GAIN_SURPLUS` | `nutrition` | `info` | — | Muscle gain targets use a moderate surplus (<= 250 kcal) and progressive resistance training. |
| `WORKOUT_INJURY_EXCLUSIONS_ACTIVE` | `training` | `attention` | — | Movements contraindicated for declared injuries were excluded precautionarily; remaining selections are not medical clearance. Stop any painful movement. |
| `WORKOUT_SENIOR_SAFETY_ACTIVE` | `training` | `info` | — | Senior safety mode (70+): high-impact plyometrics and heavy spinal loading were excluded. |
| `WORKOUT_PREGNANCY_SAFETY_ACTIVE` | `training` | `info` | — | Pregnancy safety filters active: high-impact, crunches, and post-first-trimester supine movements were excluded. |
| `WORKOUT_SEVEN_DAY_RECOVERY_CAUTION` | `training` | `attention` | — | 7-day schedule detected: monitor daily recovery closely and keep intensity moderate on back-to-back sessions. |
| `WORKOUT_SPLIT_FALLBACK_FULL_BODY` | `training` | `info` | — | Selected split requires more training days; switched to Full Body for balanced muscle coverage. |
| `WORKOUT_EQUIPMENT_FALLBACK_FULL_BODY` | `training` | `info` | — | Requested split required unavailable equipment; switched to Full Body matching your equipment and time budget. |
| `WORKOUT_MISSING_PATTERNS_NOTED` | `training` | `info` | — | Some movement patterns did not fit current equipment, injuries, or session duration; gaps are noted per day. |
| `WORKOUT_CONSECUTIVE_FULL_BODY_CAUTION` | `training` | `attention` | — | Consecutive Full Body training days detected; monitor recovery and prefer a rest day between sessions when possible. |
| `WARM_CLIMATE_HYDRATION_BONUS` | `hydration` | `info` | — | Regional warm-climate hydration bonus (+200 ml) applied. |
| `GOUT_HYDRATION_BONUS` | `hydration` | `info` | — | Gout support hydration bonus (+500 ml) applied. |
| `MATERNAL_HYDRATION_BONUS` | `hydration` | `info` | — | Maternal hydration bonus (+300 ml pregnancy / +600 ml breastfeeding) applied. |
| `DASH_SODIUM_CEILING` | `nutrition` | `info` | — | DASH daily sodium ceiling (<= 2300 mg) active. |
| `PLAN_WEEKLY_RENEWAL` | `nutrition` | `info` | — | Weekly nutrition plan renewed with updated targets. |
| `COMEBACK_RAMP_IN` | `training` | `info` | — | Comeback restart calibration applied for a smooth return. |
| `RECOVERY_DELOAD_APPLIED` | `training` | `info` | — | Approved temporary set reduction applied for recovery protection. |
| `CALORIE_ADAPTATION_APPLIED` | `nutrition` | `info` | — | Approved calorie adaptation applied to upcoming plan days. |
| `PLAN_MUSCLE_GAIN_EXTERNAL_TRAINING_NOTE` | `nutrition` | `info` | — | Pair this high-protein nutrition plan with regular external resistance training for lean muscle growth. |
| `PLAN_SEDENTARY_WORKOUT_ENERGY_NOTE` | `nutrition` | `info` | — | Sedentary daily multiplier reflects non-workout routine; 2-week weigh-ins calibrate workout expenditure from recorded trends. |
| `PLAN_PREGNANCY_FOOD_SAFETY` | `nutrition` | `info` | — | Pregnancy nutrition safety active: organ meats (liver) and unsafe calorie cuts are excluded. |
| `PLAN_FLOOR_NEEDS_ACTIVITY_FOR_DEFICIT` | `nutrition` | `attention` | — | Calories are held at the safe minimum floor; add gentle daily movement such as walking to create a gradual fat-loss deficit. |
| `WORKOUT_HYPERTENSION_GUIDANCE` | `training` | `info` | — | Hypertension guidance active: breathe smoothly through each repetition, avoid breath-holding (Valsalva), and keep intensity moderate (RIR >= 3). |
| `WORKOUT_DIABETES_GUIDANCE` | `training` | `info` | — | Diabetes training guidance active: monitor blood glucose around sessions, stay hydrated, and avoid exhaustive fasted workouts. |
| `WORKOUT_RENAL_GOUT_GUIDANCE` | `training` | `info` | — | Renal/gout guidance active: training volume is capped conservatively and extra workout-day hydration is enabled. |
| `HIGHLIGHT_DIABETES_SUGAR_FILTER` | `nutrition` | `info` | — | Glycemic control active: dates, honey, added sugars, and high-glycemic spikes are filtered out and carbs are capped at 40% of calories. |
| `HIGHLIGHT_CHOLESTEROL_LIPID_FILTER` | `nutrition` | `info` | — | Lipid protection active: high-saturated-fat dairy and meats are filtered out and dietary fat is capped at 30% of calories. |
| `HIGHLIGHT_PROTECTED_JOINTS` | `training` | `info` | `joints` | Joint protection active for {0}: aggravating movements are swapped for safer alternatives with controlled intensity. |
| `HIGHLIGHT_MAINTAIN_SYNERGY` | `synergy` | `info` | `workoutDaysCount` | Weight maintenance synergy active: nutrition calories cover your {0}-day training expenditure while sessions hold moderate 2-3 set RIR >= 3 volume to keep weight stable. |
| `HIGHLIGHT_RECOMP_SYNERGY` | `synergy` | `info` | — | Body recomposition active: nutrition is held near maintenance with high protein while resistance training drives fat loss and lean tissue retention. |
| `HIGHLIGHT_LOSE_SYNERGY` | `synergy` | `info` | `goalPace` | Fat-loss synergy active: nutrition targets a {0} calorie deficit with muscle-sparing protein alongside strength training to protect lean mass. |
| `HIGHLIGHT_MUSCLE_GAIN_SYNERGY` | `synergy` | `info` | — | Lean muscle-gain synergy active: a moderate caloric surplus and high daily protein pair directly with progressive hypertrophy programming. |
| `HIGHLIGHT_GAIN_SYNERGY` | `synergy` | `info` | — | Healthy weight-gain synergy active: progressive resistance training pairs with a steady daily energy surplus to support quality weight gain. |
| `HIGHLIGHT_TRAINING_HYDRATION_BOOST` | `hydration` | `info` | `extraMl` | Training-day hydration boost applied: +{0} ml added on scheduled workout days. |
| `HYDRATION_KIDNEY_CLINICIAN_LIMIT` | `hydration` | `attention` | — | Kidney hydration safety active: daily water target is capped conservatively; follow your physician's personalized fluid limit. |
| `HYDRATION_SENIOR_SAFETY_CAP` | `hydration` | `info` | — | Senior hydration guidance active: steady daily sipping with a conservative upper cap. |
| `DIABETES_HYDRATION_BONUS` | `hydration` | `info` | — | Glycemic hydration support (+250 ml) applied for steady daily fluid balance. |
| `IBS_HYDRATION_BONUS` | `hydration` | `info` | — | Digestive comfort hydration bonus (+150 ml) applied; sip steadily across the day. |
| `KETO_HYDRATION_BONUS` | `hydration` | `info` | — | Keto hydration bonus (+500 ml) applied to replenish glycogen-linked fluid and electrolyte loss. |
| `LOW_CARB_HYDRATION_BONUS` | `hydration` | `info` | — | Low-carb hydration bonus (+250 ml) applied to support fluid balance. |
| `HIGH_PROTEIN_HYDRATION_BONUS` | `hydration` | `info` | — | High-protein hydration bonus (+300 ml) applied to support protein metabolism. |
| `HIGH_FIBER_HYDRATION_BONUS` | `hydration` | `info` | — | Plant-forward high-fiber hydration bonus (+150 ml) applied for digestive comfort. |
| `CARDIO_HYDRATION_BONUS` | `hydration` | `info` | `cardioMl` | Cardio sweat-replacement hydration bonus applied for today's logged session. |
| `HIGH_STEPS_HYDRATION_BONUS` | `hydration` | `info` | — | High-step-day hydration bonus (+250 ml) applied for 10,000+ daily steps. |
| `HYDRATION_FASTING_PACING` | `hydration` | `info` | — | Fasting hydration pacing: spread your water target steadily rather than drinking large volumes at once. |
| `HYDRATION_RAMADAN_PACING` | `hydration` | `info` | — | Ramadan hydration pacing: spread fluids steadily between Iftar and Suhoor instead of drinking large amounts at once. |
| `BRIEF_ACTION_LOG_MEAL` | `brief` | `normal` | — | Log Next Meal |
| `BRIEF_ACTION_CONFIRM_DAY` | `brief` | `normal` | — | Confirm Food Day |
| `BRIEF_ACTION_LOG_WEIGHT` | `brief` | `normal` | — | Log Weight |
| `BRIEF_ACTION_RECOVERY_CHECKIN` | `brief` | `normal` | — | Recovery Check-In |
| `BRIEF_ACTION_START_WORKOUT` | `brief` | `normal` | — | Start Workout |
| `BRIEF_ACTION_VIEW_WORKOUT` | `brief` | `normal` | — | View Workout Plan |
| `BRIEF_ACTION_LOG_WATER` | `brief` | `normal` | — | Log Water |
| `BRIEF_ACTION_RENEW_PLAN` | `brief` | `normal` | — | Renew Plan |
| `BRIEF_ACTION_REVIEW_PROPOSAL` | `brief` | `normal` | — | Review Specialist Note |
| `BRIEF_ACTION_SHARE_FEEDBACK` | `brief` | `normal` | — | Share Update |
| `BRIEF_ACTION_SAFETY_STOP` | `brief` | `urgent` | — | Review Safety Guidance |
| `CYCLE_RETENTION_HOLD` | `nutrition` | `info` | `cyclePhase` | Late-luteal or menstrual cycle phase with likely temporary water retention detected; calorie reductions are held steady until fluid balance normalizes. |
| `DIET_BREAK_8W_SUGGESTED` | `nutrition` | `info` | `weeksInDeficit` | You have sustained a fat-loss phase for 8+ weeks; consider a structured 1-2 week maintenance diet break to support metabolic and appetite recovery. |
| `PLAN_CARB_CYCLING_ACTIVE` | `nutrition` | `info` | — | Carb cycling active: +10% calories and carbohydrates on training days and -5% on rest days while preserving daily protein targets. |
| `PLAN_CHOLESTEROL_SAT_FAT_CAP` | `clinical` | `info` | — | Cholesterol safety active: saturated fat is capped at <= 8% of daily energy and high-saturated-fat cuts are excluded. |
| `PLAN_PREGNANCY_MERCURY_PASTEURIZATION_NOTE` | `clinical` | `attention` | — | Limit tuna to at most 2 servings per week for mercury safety, choose pasteurized dairy only, and cook meats and eggs thoroughly. |
| `GLUTEN_OATS_CROSS_CONTACT_WARNING` | `nutrition` | `attention` | — | Oats are naturally gluten-free but frequently processed on shared equipment; choose certified gluten-free oats when avoiding gluten. |
| `RECENT_SORENESS_TOO_HIGH` | `training` | `info` | — | Recent muscle soreness is above 4/10; weekly set volume is held steady to prioritize recovery. |
| `CARDIO_LEG_DAY_INTERFERENCE_NOTE` | `training` | `info` | `date`, `modality`, `intensity`, `overlapType` | Vigorous cardio overlaps with or sits adjacent to a lower-body strength session; consider spacing sessions by 6+ hours or choosing low-impact aerobic work to protect leg recovery. |
