# CuraFit API — Canonical Coaching & Brief Codes Reference

Generated automatically from [`contracts/coaching-codes.json`](../contracts/coaching-codes.json).

> **KMM Localization Rule:** Server coaching, readiness, brief, eligibility, and adaptation responses emit canonical pure-English text alongside a stable `code` / `reasonCode` and structured `params`. Mobile clients localize into Arabic and any other locale strictly by `code` + `params`.

| Code | Domain | Severity | Params | Canonical English Message |
| :--- | :--- | :---: | :--- | :--- |
| `RED_FLAGS_STOP` | `recovery` | `urgent` | — | Urgent safety notice: stop exercising immediately and seek medical evaluation for symptoms such as chest pain or severe dizziness. |
| `WORKOUT_PAIN_HOLD` | `recovery` | `hold` | — | Pain was logged during your recent workout, so load progression is paused. Update your recovery check-in before resuming heavy effort. |
| `FEEDBACK_PAIN_HOLD` | `recovery` | `hold` | — | You reported pain as a training barrier. Stop painful movements and submit a pain-free recovery check-in before increasing load. |
| `CHECKIN_MISSING_OR_STALE` | `recovery` | `normal` | — | Submit today's recovery check-in (sleep, fatigue, and pain status) so the engine can safely calibrate today's workout load. |
| `ILLNESS_HOLD` | `recovery` | `hold` | — | Health comes first: pause today's workout while experiencing illness symptoms and consult a clinician if symptoms persist. |
| `JOINT_PAIN_HOLD` | `recovery` | `hold` | `painRegions` | Joint pain reported; pause painful movements, use safe alternatives or rest, and pause progression until pain resolves. |
| `RECOVERY_READY` | `recovery` | `normal` | — | Current recovery check-in supports normal training intensity while monitoring technique and perceived effort. |
| `RECOVERY_DELOAD_SUGGESTED` | `recovery` | `attention` | `setFactor`, `domains` | Multiple fatigue or sleep indicators are elevated; a temporary 24-hour set reduction is recommended pending your approval. |
| `RECOVERY_DELOAD_PROPOSAL` | `adaptation` | `attention` | `setFactor`, `regions` | Based on recent recovery strain, we propose temporarily reducing working sets for 24 hours; applying this adjustment requires your approval. |
| `RECOVERY_ADJUSTMENT_ACTIVE` | `review` | `attention` | `setFactor`, `expiresAt` | Your approved temporary set reduction is currently active for today's workout. |
| `RECOVERY_ADVICE_DECLINED` | `review` | `normal` | — | Your previous choice to decline the set reduction is saved. Your workout plan remains unchanged until a new recovery check-in is logged. |
| `SCHEDULE_CONFIRMATION_REQUIRED` | `review` | `attention` | — | Confirm your weekly workout days before automated training and adaptive reviews run. |
| `HEALTH_CONFIRMATION_REQUIRED` | `review` | `attention` | — | Confirm health readiness clearance before automated coaching reviews run. |
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
| `APPETITE_ENERGY_REVIEW_REQUIRED` | `nutrition` | `attention` | — | High hunger or low energy was recently logged; calories are held steady pending follow-up instead of reducing automatically. |
| `CALORIE_ADVICE_DECLINED` | `nutrition` | `normal` | — | Your previous choice to decline a calorie change is saved; your plan was not modified. |
| `MIN_SAFE_ENERGY_FLOOR_HOLD` | `nutrition` | `attention` | `minEnergyFloor` | Calories were held at the safe automated planning floor ({minEnergyFloor} kcal) instead of reducing further. |
| `MAX_SAFE_ENERGY_CEILING_HOLD` | `nutrition` | `attention` | `maxEnergyCeiling` | Calories were held at the safe automated planning ceiling ({maxEnergyCeiling} kcal). |
| `MATERNAL_CALORIE_CUT_BLOCKED` | `nutrition` | `hold` | — | Calorie reductions are disabled during pregnancy for maternal safety. |
| `PLAN_CONSTRAINTS_ADJUSTMENT_HOLD` | `nutrition` | `attention` | — | Current calories were kept because the proposed change could not satisfy your dietary, macro, or exclusion constraints. |
| `HEALTH_OR_SCHEDULE_UNCONFIRMED` | `training` | `attention` | — | Confirm health readiness and workout schedule before volume progression is evaluated. |
| `GOAL_NOT_MUSCLE_GAIN` | `training` | `normal` | — | Automated weekly set increases apply to muscle-gain plans; holding volume does not mean your current training is insufficient. |
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
| `AGE_UNSUPPORTED_OR_MISSING` | `eligibility` | `requires_review` | — | Automated planning is available for adults aged 18 to 95 only. |
| `SENIOR_MODE_ACTIVE` | `eligibility` | `info` | — | Senior safety mode (70+) is active: moderate deficit cap (-400 kcal), protein floor >= 1.2 g/kg, and joint-friendly low-impact exercises. |
| `CLINICAL_OR_INJURY_REQUIRES_REVIEW` | `eligibility` | `requires_review` | — | Declared clinical conditions or injuries require direct specialist review before automated plan generation. |
| `BMI_OUT_OF_RANGE` | `eligibility` | `requires_review` | — | Height and weight fall outside the automated planning BMI range (12.5 to 65). |
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
| `CYCLE_PAUSED_PREGNANCY` | `brief` | `normal` | `maternalStatus` | Menstrual cycle predictions are automatically paused during pregnancy ({maternalStatus}); maternal safety guidance remains active. |
| `BRIEF_TRAINING_PERFORMANCE_UP` | `brief` | `normal` | `exerciseId`, `fromKg`, `toKg` | Average load for {exerciseId} progressed from {fromKg} to {toKg} kg. |
| `BRIEF_TRAINING_PERFORMANCE_REPS` | `brief` | `normal` | `exerciseId`, `fromReps`, `toReps` | Reps for {exerciseId} progressed from {fromReps} to {toReps}. |
| `SPLIT_REVIEW_SUGGEST_UPPER_LOWER` | `training` | `normal` | `days` | Because you train {days}+ days consistently with ready recovery, Upper/Lower or Push/Pull/Legs is available in Preferences if sessions feel long or you prefer dedicated focus days. |
| `SPLIT_REVIEW_KEEP_FULL_BODY` | `training` | `normal` | `days` | At {days} training days per week, continuing with Full Body remains practical and time-efficient. |
| `SPLIT_REVIEW_RECOVERY_FIRST` | `training` | `attention` | `days` | Submit a fresh ready recovery check-in first; when managing pain or fatigue, recovery takes priority over changing splits. |
| `SPLIT_REVIEW_BUILD_CONSISTENCY` | `training` | `normal` | `days`, `completedCount` | Focus on session consistency first; build at least 16 completed sessions ({completedCount} logged) and steady recent adherence before switching splits. |
| `SPLIT_REVIEW_NOT_DUE` | `training` | `normal` | — | 8-week Full Body split review is available after 8 weeks and 16+ completed workouts on a 4+ day Full Body program. |
| `SEASONAL_EID_FLEX_ACTIVE` | `nutrition` | `normal` | `occasion`, `endDate` | Seasonal Flex Mode ({occasion}) is active through {endDate} at maintenance calories without streak penalty. |
| `CYCLE_GENTLE_SESSION_ACTIVE` | `training` | `normal` | — | Cycle comfort adjustment is active with 0.8x working sets for 24 hours. |
