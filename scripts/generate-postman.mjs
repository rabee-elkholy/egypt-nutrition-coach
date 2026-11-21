// Generates the ready-to-use Postman Collection v2.1 and Environments for Egypt Nutrition Coach API
// Canonical Backend: Cloudflare Workers + Cloudflare D1 (Zero Supabase dependency)
import { mkdir, writeFile } from 'node:fs/promises';

const SCHEMA_V21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

function parseUrl(rawPath) {
  const [pathOnly, queryStr] = rawPath.split('?');
  const pathSegments = pathOnly.replace(/^\//, '').split('/').filter(Boolean);
  const query = queryStr
    ? queryStr.split('&').map(pair => {
        const [key, ...rest] = pair.split('=');
        return { key, value: rest.join('=') };
      })
    : undefined;
  return {
    raw: `{{baseUrl}}${rawPath}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
    ...(query ? { query } : {})
  };
}

function req({ name, method = 'GET', path, description = '', headers = [], body = undefined, noAuth = false, testScript = null, prerequestScript = null }) {
  const finalHeaders = [...headers];
  if (body !== undefined && !finalHeaders.some(h => h.key.toLowerCase() === 'content-type')) {
    finalHeaders.unshift({ key: 'Content-Type', value: 'application/json' });
  }
  if (!finalHeaders.some(h => h.key.toLowerCase() === 'accept')) {
    finalHeaders.push({ key: 'Accept', value: 'application/json' });
  }
  const event = [];
  if (prerequestScript) {
    event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: prerequestScript } });
  }
  if (testScript) {
    event.push({ listen: 'test', script: { type: 'text/javascript', exec: testScript } });
  }
  return {
    name,
    ...(event.length ? { event } : {}),
    request: {
      ...(noAuth ? { auth: { type: 'noauth' } } : {}),
      method,
      header: finalHeaders,
      ...(body !== undefined
        ? {
            body: {
              mode: 'raw',
              raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
              options: { raw: { language: 'json' } }
            }
          }
        : {}),
      url: parseUrl(path),
      description
    },
    response: []
  };
}

function cmdReq({ name, action, payload, view = 'receipt', simulation = false, description = '', extraTests = [] }) {
  const params = [];
  if (view) params.push(`view=${view}`);
  if (simulation) params.push('simulation=1');
  const qs = params.length ? `?${params.join('&')}` : '';
  const revVar = simulation ? '{{simRevision}}' : '{{revision}}';
  const rawBody = JSON.stringify({ revision: '__REV__', action, payload }, null, 2)
    .replace('"__REV__"', revVar)
    .replace(/"__DAY_IDX__"/g, '{{sampleDayIndex}}');
  return req({
    name,
    method: 'POST',
    path: `/v1/commands${qs}`,
    description,
    headers: [
      { key: 'Idempotency-Key', value: '{{idempotencyKey}}' },
      { key: 'X-Client-Platform', value: '{{clientPlatform}}' },
      { key: 'X-Client-Version', value: '{{clientVersion}}' }
    ],
    body: rawBody,
    testScript: [
      'pm.test("Command succeeded (HTTP 200)", function () {',
      '  pm.response.to.have.status(200);',
      '});',
      ...extraTests
    ]
  });
}

const COLLECTION_PREREQUEST = [
  '// Auto-generate a unique Idempotency-Key for every write request',
  'pm.variables.set("idempotencyKey", pm.variables.replaceIn("{{$guid}}"));',
  'if (!pm.environment.get("todayDate") && !pm.collectionVariables.get("todayDate")) {',
  '  const now = new Date();',
  '  const yyyy = now.getUTCFullYear();',
  '  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");',
  '  const dd = String(now.getUTCDate()).padStart(2, "0");',
  '  pm.collectionVariables.set("todayDate", `${yyyy}-${mm}-${dd}`);',
  '}'
];

const COLLECTION_TEST = [
  '// Auto-sync revision, serverDate, and ETag across requests',
  'const isSim = pm.request.url.query.has("simulation") && pm.request.url.query.get("simulation") === "1";',
  'const etagHeader = pm.response.headers.get("ETag");',
  'if (etagHeader) pm.collectionVariables.set("lastEtag", etagHeader);',
  'if (pm.response.code >= 200 && pm.response.code < 300) {',
  '  try {',
  '    const data = pm.response.json();',
  '    if (typeof data.revision === "number") {',
  '      pm.collectionVariables.set(isSim ? "simRevision" : "revision", String(data.revision));',
  '    }',
  '    if (typeof data.serverDate === "string" && !isSim) {',
  '      pm.collectionVariables.set("todayDate", data.serverDate);',
  '    }',
  '    if (Array.isArray(data.pendingAdaptations) && data.pendingAdaptations.length) {',
  '      pm.collectionVariables.set("sampleProposalId", data.pendingAdaptations[0].id);',
  '    }',
  '    if (Array.isArray(data.adaptations)) {',
  '      const pending = data.adaptations.find(a => a.status === "pending");',
  '      if (pending) pm.collectionVariables.set("sampleProposalId", pending.id);',
  '    }',
  '  } catch (e) {}',
  '}'
];

const SAVE_AUTH_TOKENS_TEST = [
  'pm.test("Auth token pair returned", function () {',
  '  pm.expect([200, 201]).to.include(pm.response.code);',
  '  const d = pm.response.json();',
  '  pm.expect(d.accessToken).to.be.a("string");',
  '  pm.expect(d.refreshToken).to.be.a("string");',
  '  pm.collectionVariables.set("accessToken", d.accessToken);',
  '  pm.collectionVariables.set("refreshToken", d.refreshToken);',
  '  pm.collectionVariables.set("sessionId", d.sessionId);',
  '  if (d.user && d.user.userId) pm.collectionVariables.set("userId", d.user.userId);',
  '});'
];

const CAPTURE_STATE_IDS_TEST = [
  'try {',
  '  const d = pm.response.json();',
  '  const plan = d.activePlan || (Array.isArray(d.plans) ? d.plans[0] : null);',
  '  if (plan && plan.id) pm.collectionVariables.set("activePlanId", plan.id);',
  '  if (d.activeNutritionPlanRef && d.activeNutritionPlanRef.id) pm.collectionVariables.set("activePlanId", d.activeNutritionPlanRef.id);',
  '  if (plan && Array.isArray(plan.days) && plan.days.length) {',
  '    const today = d.serverDate || plan.days[0].date;',
  '    const dayObj = plan.days.find(x => x.date === today) || plan.days[0];',
  '    if (dayObj && Array.isArray(dayObj.meals) && dayObj.meals.length) {',
  '      pm.collectionVariables.set("sampleMealId", dayObj.meals[0].id);',
  '    }',
  '  }',
  '  const wp = d.workoutPlan;',
  '  if (wp && wp.id) pm.collectionVariables.set("activeWorkoutPlanId", wp.id);',
  '  if (d.activeWorkoutPlanRef && d.activeWorkoutPlanRef.id) pm.collectionVariables.set("activeWorkoutPlanId", d.activeWorkoutPlanRef.id);',
  '  if (wp && Array.isArray(wp.days) && wp.days.length) {',
  '    const firstDay = wp.days[0];',
  '    pm.collectionVariables.set("sampleDayIndex", String(firstDay.dayIndex));',
  '    if (Array.isArray(firstDay.exercises) && firstDay.exercises.length) {',
  '      pm.collectionVariables.set("sampleExerciseId", firstDay.exercises[0].id);',
  '    }',
  '    // Compute a valid rest-day reschedule target within the next 13 days',
  '    const workoutDays = new Set(wp.days.map(x => x.dayIndex));',
  '    const base = new Date((d.serverDate || pm.collectionVariables.get("todayDate")) + "T12:00:00Z");',
  '    for (let i = 1; i <= 13; i++) {',
  '      const dt = new Date(base.getTime() + i * 86400000);',
  '      if (!workoutDays.has(dt.getUTCDay())) {',
  '        pm.collectionVariables.set("sampleRescheduleDate", dt.toISOString().slice(0, 10));',
  '        break;',
  '      }',
  '    }',
  '  }',
  '  if (Array.isArray(d.foodEntries) && d.foodEntries.length) {',
  '    pm.collectionVariables.set("sampleFoodEntryId", d.foodEntries[d.foodEntries.length - 1].id);',
  '  }',
  '  if (Array.isArray(d.coachingCases) && d.coachingCases.length) {',
  '    pm.collectionVariables.set("sampleCaseId", d.coachingCases[d.coachingCases.length - 1].id);',
  '  }',
  '} catch (e) {}'
];

const collection = {
  info: {
    _postman_id: '7c94f8e1-4c9a-4f3b-9b5a-2e8d6a1f0c31',
    name: 'Egypt Nutrition Coach (CuraFit) — Cloudflare Workers API v1',
    description: [
      'Complete, ready-to-use Postman collection for **Egypt Nutrition Coach (CuraFit)** running natively on **Cloudflare Workers + Cloudflare D1** (zero Supabase dependency).',
      '',
      '### Quick Start',
      '1. Import this collection AND one of the environments (`Cloudflare_Production` or `Local_Dev`).',
      '2. Run **01. System & Health -> Health Check** to verify connectivity.',
      '3. Run **02. Authentication -> Register** (or **Login**). `accessToken` and `refreshToken` are captured automatically.',
      '4. Run **03. Onboarding -> Generate Initial Plan**. `revision`, `activePlanId`, `activeWorkoutPlanId`, `sampleMealId`, `sampleExerciseId`, and `todayDate` are captured automatically.',
      '5. Run any other request in any folder — `Idempotency-Key` and `revision` are updated automatically on every call!'
    ].join('\n'),
    schema: SCHEMA_V21
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }]
  },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: COLLECTION_PREREQUEST } },
    { listen: 'test', script: { type: 'text/javascript', exec: COLLECTION_TEST } }
  ],
  variable: [
    { key: 'baseUrl', value: 'https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev' },
    { key: 'testEmail', value: 'demo.user@curafit.app' },
    { key: 'testPassword', value: 'CuraFit#2026!' },
    { key: 'testNewPassword', value: 'CuraFit#2027!' },
    { key: 'accessToken', value: '' },
    { key: 'refreshToken', value: '' },
    { key: 'sessionId', value: '' },
    { key: 'userId', value: '' },
    { key: 'deviceId', value: 'postman-client-01' },
    { key: 'clientPlatform', value: 'android' },
    { key: 'clientVersion', value: '1.0.0' },
    { key: 'revision', value: '0' },
    { key: 'simRevision', value: '0' },
    { key: 'todayDate', value: '' },
    { key: 'lastEtag', value: '' },
    { key: 'activePlanId', value: '' },
    { key: 'activeWorkoutPlanId', value: '' },
    { key: 'sampleMealId', value: '' },
    { key: 'sampleAltTemplateId', value: '' },
    { key: 'sampleFoodEntryId', value: '' },
    { key: 'sampleDayIndex', value: '1' },
    { key: 'sampleExerciseId', value: '' },
    { key: 'sampleAltExerciseId', value: '' },
    { key: 'sampleRescheduleDate', value: '' },
    { key: 'sampleProposalId', value: '' },
    { key: 'sampleCaseId', value: '' },
    { key: 'sampleFoodId', value: '' },
    { key: 'sampleCatalogExerciseId', value: '' },
    { key: 'nextSeqCursor', value: '0' },
    { key: 'anonymousUserId', value: '' }
  ],
  item: [
    {
      name: '01. System & Health',
      description: 'Public health and runtime capabilities endpoints (no authentication required).',
      item: [
        req({
          name: 'Health Check',
          method: 'GET',
          path: '/v1/health',
          noAuth: true,
          description: 'Public health probe returning API version, engine version, and requestId.',
          testScript: [
            'pm.test("Service is healthy", function () {',
            '  pm.response.to.have.status(200);',
            '  pm.expect(pm.response.json().ok).to.eql(true);',
            '});'
          ]
        }),
        req({
          name: 'Capabilities Manifest',
          method: 'GET',
          path: '/v1/capabilities',
          noAuth: true,
          description: 'Returns schemaVersion, catalog versions, enabled features, and Cloudflare native auth readiness.',
          testScript: [
            'pm.test("Capabilities returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json();',
            '  pm.expect(d.apiVersion).to.eql("1");',
            '  pm.expect(d.features).to.include("native_cloudflare_auth");',
            '});'
          ]
        })
      ]
    },
    {
      name: '02. Authentication (Cloudflare Native D1)',
      description: 'First-party authentication on Cloudflare Workers + Cloudflare D1 using PBKDF2-SHA256 passwords, HS256 Access JWTs (15 min), and rotating D1 Refresh Tokens (30 days).',
      item: [
        req({
          name: 'Register User',
          method: 'POST',
          path: '/v1/auth/register',
          noAuth: true,
          description: 'Creates a new user in Cloudflare D1 and returns Access JWT + Refresh Token. Automatically saves tokens and resets revision=0.',
          body: {
            email: '{{testEmail}}',
            password: '{{testPassword}}',
            name: 'أحمد محمد',
            deviceId: '{{deviceId}}'
          },
          testScript: [
            ...SAVE_AUTH_TOKENS_TEST,
            'if (pm.response.code === 201) {',
            '  pm.collectionVariables.set("revision", "0");',
            '  pm.collectionVariables.set("simRevision", "0");',
            '}'
          ]
        }),
        req({
          name: 'Login User',
          method: 'POST',
          path: '/v1/auth/login',
          noAuth: true,
          description: 'Authenticates an existing user and issues a fresh Access JWT + Refresh Token pair.',
          body: {
            email: '{{testEmail}}',
            password: '{{testPassword}}',
            deviceId: '{{deviceId}}'
          },
          testScript: SAVE_AUTH_TOKENS_TEST
        }),
        req({
          name: 'Refresh Access Token (Rotates Refresh Token)',
          method: 'POST',
          path: '/v1/auth/refresh',
          noAuth: true,
          description: 'Exchanges the current refreshToken for a new Access JWT and rotated refreshToken. Replaying an already-rotated refresh token automatically revokes the session.',
          body: {
            refreshToken: '{{refreshToken}}',
            deviceId: '{{deviceId}}'
          },
          testScript: SAVE_AUTH_TOKENS_TEST
        }),
        req({
          name: 'Inspect Current Session',
          method: 'GET',
          path: '/v1/auth/session',
          description: 'Returns authenticated userId, sessionId, authMethod, scopes, entitlement tier, and token timestamps.',
          testScript: [
            'pm.test("Session active", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json();',
            '  pm.expect(d.userId).to.be.a("string");',
            '});'
          ]
        }),
        req({
          name: 'Change Password',
          method: 'POST',
          path: '/v1/auth/change-password',
          description: 'Verifies currentPassword, updates PBKDF2-SHA256 password hash in D1, and optionally revokes other devices.',
          body: {
            currentPassword: '{{testPassword}}',
            newPassword: '{{testNewPassword}}',
            revokeOtherSessions: true
          }
        }),
        req({
          name: 'Claim Anonymous Web Session',
          method: 'POST',
          path: '/v1/auth/claim-anonymous',
          description: 'Transfers an anonymous Web MVP trial account into the logged-in verified account (requires the owning coach_uid cookie + explicit consent: true).',
          body: {
            anonymousUserId: '{{anonymousUserId}}',
            consent: true
          }
        }),
        req({
          name: 'Revoke Session (Current or All Devices)',
          method: 'POST',
          path: '/v1/auth/revoke',
          description: 'Revokes a specific sessionId (or allDevices: true) in D1 immediately.',
          body: {
            sessionId: '{{sessionId}}',
            allDevices: false
          }
        }),
        req({
          name: 'Logout',
          method: 'POST',
          path: '/v1/auth/logout',
          description: 'Cleanly logs out the current session (or allDevices: true) and invalidates refresh tokens.',
          body: {
            allDevices: false
          }
        })
      ]
    },
    {
      name: '03. Onboarding & Pre-Screening',
      description: 'Clinical eligibility screening, initial nutrition & workout plan generation, and plan lifecycle commands.',
      item: [
        req({
          name: 'Pre-Screening Eligibility Check',
          method: 'POST',
          path: '/v1/eligibility',
          description: 'Deterministic pre-onboarding screening for age, BMI, medical conditions, injuries, and maternal status.',
          body: {
            age: 29,
            sex: 'male',
            height: 178,
            weight: 82,
            goal: 'lose',
            targetWeight: 75,
            serviceTrack: 'nutrition_and_workouts',
            diseases: [],
            maternalStatus: 'none',
            injuries: []
          },
          testScript: [
            'pm.test("Eligibility evaluated", function () {',
            '  pm.response.to.have.status(200);',
            '  pm.expect(pm.response.json().status).to.be.oneOf(["eligible", "needs_input", "requires_review"]);',
            '});'
          ]
        }),
        cmdReq({
          name: 'Generate Initial Plan (Full Response)',
          action: 'generate',
          view: 'full',
          description: 'Generates the initial 7-day Egyptian/Gulf nutrition plan + adaptive workout plan. Captures activePlanId, activeWorkoutPlanId, sampleMealId, and sampleExerciseId automatically.',
          payload: {
            name: 'أحمد محمد',
            age: 29,
            weight: 82,
            height: 178,
            sex: 'male',
            goal: 'lose',
            targetWeight: 75,
            goalPace: 'moderate',
            serviceTrack: 'nutrition_and_workouts',
            dailyActivity: 'light',
            dietType: 'balanced',
            region: 'egypt',
            budget: 'medium',
            mealsCount: 4,
            selectedWorkoutDays: [1, 3, 5],
            workoutLocation: 'gym_only',
            fitnessLevel: 'beginner',
            sessionDuration: 45,
            healthConfirmed: true,
            weekdayConvention: 'js_sunday_0'
          },
          extraTests: [CAPTURE_STATE_IDS_TEST.join('\n')]
        }),
        cmdReq({
          name: 'Confirm Health (Legacy Workouts-Only)',
          action: 'confirm_health',
          view: 'receipt',
          description: 'Explicit health confirmation for legacy workouts_only accounts that require confirmation before adaptive reviews.',
          payload: {
            healthy: true,
            injuryFree: true
          }
        }),
        cmdReq({
          name: 'Confirm Schedule (Legacy Calendar Migration)',
          action: 'confirm_schedule',
          view: 'receipt',
          description: 'Maps legacy workout day indexes to canonical Sunday=0..Saturday=6 convention.',
          payload: {
            dayMap: { '1': 1, '3': 3, '5': 5 }
          }
        }),
        cmdReq({
          name: 'Renew Weekly Nutrition Plan',
          action: 'renew_plan',
          view: 'receipt',
          description: 'Generates the next 7-day nutrition week after the current plan expires.',
          payload: {}
        })
      ]
    },
    {
      name: '04. Account State & Bootstrap (KMM)',
      description: 'Account bootstrap (<10 KB), full state snapshot, and 14-day progress analytics with ETag caching.',
      item: [
        req({
          name: 'Get Bootstrap (Lightweight KMM Startup)',
          method: 'GET',
          path: '/v1/bootstrap',
          description: 'Lightweight startup payload (<10 KB) containing profile, active plan refs, todaySummary, pendingAdaptations, and ETag.',
          headers: [{ key: 'If-None-Match', value: '', disabled: true }],
          testScript: [
            'pm.test("Bootstrap loaded", function () {',
            '  pm.expect([200, 304]).to.include(pm.response.code);',
            '});',
            ...CAPTURE_STATE_IDS_TEST
          ]
        }),
        req({
          name: 'Get Full Account State',
          method: 'GET',
          path: '/v1/state',
          description: 'Full account state including active nutrition plan, workout plan, logs, recovery, and coaching state.',
          headers: [{ key: 'If-None-Match', value: '', disabled: true }],
          testScript: [
            'pm.test("State loaded", function () {',
            '  pm.expect([200, 304]).to.include(pm.response.code);',
            '});',
            ...CAPTURE_STATE_IDS_TEST
          ]
        }),
        req({
          name: 'Get 14-Day Progress Summary',
          method: 'GET',
          path: '/v1/progress/summary',
          description: 'Returns 14-day weight trend, food diary completeness, hydration adherence, and workout progression insights.',
          testScript: [
            'pm.test("Progress summary returned", function () {',
            '  pm.response.to.have.status(200);',
            '});'
          ]
        })
      ]
    },
    {
      name: '05. Nutrition & Food Diary',
      description: 'Food diary reads, meal/ingredient/manual logging, completion confirmation, and validated meal substitutions.',
      item: [
        req({
          name: 'Get Food Diary for Date',
          method: 'GET',
          path: '/v1/food-diary?date={{todayDate}}',
          description: 'Returns actual food entries, nullable nutrient totals, completion status, and planned energy target.'
        }),
        cmdReq({
          name: 'Log Planned Meal (food_entry — planned)',
          action: 'food_entry',
          view: 'receipt',
          description: 'Logs consumption of a planned meal from the active nutrition plan.',
          payload: {
            date: '{{todayDate}}',
            source: 'planned',
            mealId: '{{sampleMealId}}',
            slot: 'breakfast',
            quantity: 1
          },
          extraTests: [
            'try {',
            '  const d = pm.response.json();',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Log Reference Ingredient (food_entry — ingredient)',
          action: 'food_entry',
          view: 'receipt',
          description: 'Logs a reference ingredient by planning key (e.g. chicken, rice, fava, egg, oats) and grams.',
          payload: {
            date: '{{todayDate}}',
            source: 'ingredient',
            key: 'chicken',
            grams: 150,
            slot: 'lunch'
          },
          extraTests: [
            'try {',
            '  const d = pm.response.json();',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Log Manual Food Entry (food_entry — manual)',
          action: 'food_entry',
          view: 'receipt',
          description: 'Logs a custom manual food item with calories and optional macros.',
          payload: {
            date: '{{todayDate}}',
            source: 'manual',
            name: 'طبق كشري متوسط',
            slot: 'dinner',
            energy: 480,
            protein: 16,
            carbs: 82,
            fat: 9
          },
          extraTests: [
            'try {',
            '  const d = pm.response.json();',
            '  const hit = (d.affected || []).find(a => a.entityType === "food_entry" && a.op === "upsert");',
            '  if (hit && hit.entityId) pm.collectionVariables.set("sampleFoodEntryId", hit.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Confirm Food Day Complete (food_complete)',
          action: 'food_complete',
          view: 'receipt',
          description: 'Explicitly confirms that all food intake for the specified date has been logged.',
          payload: {
            date: '{{todayDate}}',
            complete: true
          }
        }),
        cmdReq({
          name: 'Delete Food Entry (food_delete)',
          action: 'food_delete',
          view: 'receipt',
          description: 'Deletes a logged food entry by ID (reopens day completion).',
          payload: {
            id: '{{sampleFoodEntryId}}'
          }
        }),
        cmdReq({
          name: 'Log Legacy Daily Total (food)',
          action: 'food',
          view: 'receipt',
          description: 'Logs a single daily calorie total for a date that has no detailed food entries.',
          payload: {
            date: '{{todayDate}}',
            energy: 1850,
            complete: true
          }
        }),
        cmdReq({
          name: 'Switch Legacy Day to Detailed Entries (food_switch_to_entries)',
          action: 'food_switch_to_entries',
          view: 'receipt',
          description: 'Archives a legacy daily calorie total so detailed entries can be logged for that date.',
          payload: {
            date: '{{todayDate}}',
            confirm: true
          }
        }),
        req({
          name: 'Get Meal Alternatives',
          method: 'GET',
          path: '/v1/meal-alternatives?mealId={{sampleMealId}}',
          description: 'Returns up to 6 validated culinary substitutes matching diet, budget, and medical constraints.',
          testScript: [
            'pm.test("Meal alternatives fetched", function () {',
            '  pm.response.to.have.status(200);',
            '  const items = pm.response.json().items || [];',
            '  if (items.length && items[0].templateId) {',
            '    pm.collectionVariables.set("sampleAltTemplateId", items[0].templateId);',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Replace Planned Meal (replace_meal)',
          action: 'replace_meal',
          view: 'receipt',
          description: 'Replaces a planned meal with a validated templateId returned by GET /v1/meal-alternatives.',
          payload: {
            mealId: '{{sampleMealId}}',
            templateId: '{{sampleAltTemplateId}}'
          }
        })
      ]
    },
    {
      name: '06. Hydration, Weight & Activity',
      description: 'Daily water, body weight, steps, activity logs, and Health Connect / Apple Health batch ingestion.',
      item: [
        cmdReq({
          name: 'Log Water Intake — Set Cups (water)',
          action: 'water',
          view: 'receipt',
          description: 'Sets total water cups (0..30) for the given date.',
          payload: {
            date: '{{todayDate}}',
            cups: 8
          }
        }),
        cmdReq({
          name: 'Log Water Intake — Increment Cups (water)',
          action: 'water',
          view: 'receipt',
          description: 'Increments (or decrements) water cups relative to the current date total.',
          payload: {
            date: '{{todayDate}}',
            addCups: 2
          }
        }),
        req({
          name: 'List Water Logs',
          method: 'GET',
          path: '/v1/water-logs?offset=0&limit=30',
          description: 'Paginated water intake logs ordered by date descending (supports optional from/to YYYY-MM-DD).'
        }),
        cmdReq({
          name: 'Log Body Weight (weight)',
          action: 'weight',
          view: 'receipt',
          description: 'Records or updates scale weight (kg) for a date.',
          payload: {
            date: '{{todayDate}}',
            kg: 81.4,
            source: 'manual'
          }
        }),
        req({
          name: 'List Weight Logs',
          method: 'GET',
          path: '/v1/weight-logs?offset=0&limit=30',
          description: 'Paginated weight measurements ordered by date descending.'
        }),
        cmdReq({
          name: 'Log Daily Steps (steps)',
          action: 'steps',
          view: 'receipt',
          description: 'Logs daily step count.',
          payload: {
            date: '{{todayDate}}',
            steps: 8500,
            source: 'manual'
          }
        }),
        cmdReq({
          name: 'Log Activity & Active Energy (activity)',
          action: 'activity',
          view: 'receipt',
          description: 'Logs steps + active energy with optional deduplication externalRecordId.',
          payload: {
            date: '{{todayDate}}',
            steps: 9200,
            activeEnergyKcal: 410,
            source: 'health_connect',
            externalRecordId: 'hc-sample-001'
          }
        }),
        req({
          name: 'List Activity Logs',
          method: 'GET',
          path: '/v1/activity-logs?offset=0&limit=30',
          description: 'Paginated activity and steps logs.'
        }),
        req({
          name: 'Ingest Wearables Batch (Health Connect / Apple Health)',
          method: 'POST',
          path: '/v1/wearables/ingest',
          description: 'Idempotent batch ingestion of up to 100 weight/steps/activity records from wearable SDKs.',
          headers: [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}' }],
          body: {
            records: [
              { type: 'weight', date: '{{todayDate}}', kg: 81.3, source: 'health_connect' },
              { type: 'activity', date: '{{todayDate}}', steps: 9600, activeEnergyKcal: 430, source: 'health_connect', externalRecordId: 'hc-batch-001' }
            ]
          },
          testScript: [
            'pm.test("Wearables batch ingested", function () {',
            '  pm.response.to.have.status(200);',
            '  pm.expect(pm.response.json().ok).to.eql(true);',
            '});'
          ]
        })
      ]
    },
    {
      name: '07. Workouts & Training',
      description: 'Workout plans, set/rep/load logging, session completion, injury-safe alternatives, and session rescheduling.',
      item: [
        req({
          name: 'List Workout Plans',
          method: 'GET',
          path: '/v1/workout-plans',
          description: 'Lists owned workout plan version references.'
        }),
        req({
          name: 'Get Workout Plan by ID',
          method: 'GET',
          path: '/v1/workout-plans/{{activeWorkoutPlanId}}',
          description: 'Returns the full owned workout plan with days, exercises, sets, and weekly set totals.'
        }),
        cmdReq({
          name: 'Log Exercise Sets (workout)',
          action: 'workout',
          view: 'receipt',
          description: 'Logs performed sets (kg, reps, rir, pain) for a scheduled exercise and computes progression.',
          payload: {
            date: '{{todayDate}}',
            dayIndex: '__DAY_IDX__',
            exerciseId: '{{sampleExerciseId}}',
            sets: [
              { kg: 20, reps: 10, rir: 2, pain: false },
              { kg: 20, reps: 10, rir: 2, pain: false },
              { kg: 20, reps: 10, rir: 2, pain: false }
            ],
            bothSides: true,
            increment: 2.5
          }
        }),
        req({
          name: 'List Workout Logs',
          method: 'GET',
          path: '/v1/workout-logs?offset=0&limit=30',
          description: 'Paginated exercise set/rep/load logs.'
        }),
        cmdReq({
          name: 'Complete / Update Workout Session (session)',
          action: 'session',
          view: 'receipt',
          description: 'Marks a workout day as completed, partial, or missed with duration (min) and RPE (0..10).',
          payload: {
            date: '{{todayDate}}',
            dayIndex: '__DAY_IDX__',
            status: 'completed',
            duration: 45,
            rpe: 7
          }
        }),
        req({
          name: 'List Workout Sessions',
          method: 'GET',
          path: '/v1/sessions?offset=0&limit=30',
          description: 'Paginated workout session completion records.'
        }),
        req({
          name: 'Get Exercise Alternatives',
          method: 'GET',
          path: '/v1/exercise-alternatives?dayIndex={{sampleDayIndex}}&exerciseId={{sampleExerciseId}}',
          description: 'Returns up to 6 biomechanically equivalent, injury-safe, time-budget-validated exercise substitutes.',
          testScript: [
            'pm.test("Exercise alternatives fetched", function () {',
            '  pm.response.to.have.status(200);',
            '  const items = pm.response.json().items || [];',
            '  if (items.length && items[0].id) {',
            '    pm.collectionVariables.set("sampleAltExerciseId", items[0].id);',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Replace Exercise (replace_exercise)',
          action: 'replace_exercise',
          view: 'receipt',
          description: 'Substitutes an exercise in the workout plan with a validated alternativeId.',
          payload: {
            dayIndex: '__DAY_IDX__',
            exerciseId: '{{sampleExerciseId}}',
            alternativeId: '{{sampleAltExerciseId}}'
          }
        }),
        cmdReq({
          name: 'Propose Workout Reschedule (reschedule)',
          action: 'reschedule',
          view: 'receipt',
          description: 'Creates a pending schedule adaptation proposal moving a workout day to a rest date within the next 13 days.',
          payload: {
            dayIndex: '__DAY_IDX__',
            toDate: '{{sampleRescheduleDate}}'
          }
        })
      ]
    },
    {
      name: '08. Recovery & Adaptive Coaching',
      description: 'Daily recovery check-ins, deterministic coaching reviews, adaptation approvals, coaching brief, and agreement journeys.',
      item: [
        cmdReq({
          name: 'Submit Daily Recovery Check-in (recovery)',
          action: 'recovery',
          view: 'receipt',
          description: 'Logs sleep, fatigue, stress, muscle soreness, pain regions, illness, and redFlags.',
          payload: {
            date: '{{todayDate}}',
            sleepHours: 7.5,
            sleepQuality: 4,
            fatigue: 2,
            stress: 2,
            soreness: 2,
            sorenessByRegion: { chest: 2, quads: 1 },
            pain: false,
            painRegions: [],
            illness: false,
            redFlags: false
          }
        }),
        req({
          name: 'List Recovery Check-ins',
          method: 'GET',
          path: '/v1/checkins?offset=0&limit=30',
          description: 'Paginated daily recovery check-ins.'
        }),
        cmdReq({
          name: 'Trigger Adaptive Review (review)',
          action: 'review',
          view: 'full',
          description: 'Evaluates recovery, nutrition trend, and workout progression and creates pending adaptation proposals when warranted.',
          payload: {}
        }),
        cmdReq({
          name: 'Accept or Reject Adaptation Proposal (adaptation)',
          action: 'adaptation',
          view: 'receipt',
          description: 'Accepts (accept: true) or rejects (accept: false) a current unexpired pending proposal.',
          payload: {
            id: '{{sampleProposalId}}',
            accept: true
          }
        }),
        req({
          name: 'Get On-Demand Coaching Brief',
          method: 'GET',
          path: '/v1/coaching/brief',
          description: 'Returns deterministic personalized nutrition, training, and follow-up notes for today (supports ETag).',
          headers: [{ key: 'If-None-Match', value: '', disabled: true }]
        }),
        req({
          name: 'Get Coaching Inbox (Active Agreements)',
          method: 'GET',
          path: '/v1/coaching/inbox',
          description: 'Lists active coaching cases/agreements and review dates (read-only, never auto-acknowledges).',
          testScript: [
            'try {',
            '  const items = pm.response.json().items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleCaseId", items[0].id);',
            '} catch (e) {}'
          ]
        }),
        req({
          name: 'Get Coaching Agreement History',
          method: 'GET',
          path: '/v1/coaching/history?offset=0&limit=30',
          description: 'Paginated historical coaching cases.'
        }),
        cmdReq({
          name: 'Submit Coaching Feedback (coaching_feedback)',
          action: 'coaching_feedback',
          view: 'receipt',
          description: 'Logs nutrition or training barriers and subjective scores (1..5), generating a follow-up agreement if needed.',
          payload: {
            domain: 'nutrition',
            barrier: 'time',
            hunger: 2,
            satiety: 4,
            energy: 4
          },
          extraTests: [
            'try {',
            '  const d = pm.response.json();',
            '  const c = (d.affected || []).find(a => a.entityType === "coaching_case" && a.op === "upsert");',
            '  if (c && c.entityId) pm.collectionVariables.set("sampleCaseId", c.entityId);',
            '} catch (e) {}'
          ]
        }),
        cmdReq({
          name: 'Acknowledge Coaching Case (coaching_ack)',
          action: 'coaching_ack',
          view: 'receipt',
          description: 'Explicitly marks a coaching case/message as read/acknowledged.',
          payload: {
            id: '{{sampleCaseId}}'
          }
        }),
        cmdReq({
          name: 'Decide on Coaching Case (coaching_decision)',
          action: 'coaching_decision',
          view: 'receipt',
          description: 'Accepts or declines a proposed coaching agreement.',
          payload: {
            id: '{{sampleCaseId}}',
            accept: true
          }
        }),
        cmdReq({
          name: 'Report Coaching Outcome (coaching_outcome)',
          action: 'coaching_outcome',
          view: 'receipt',
          description: 'Records outcome (helped | not_helped | not_tried) for an accepted coaching agreement.',
          payload: {
            id: '{{sampleCaseId}}',
            outcome: 'helped'
          }
        })
      ]
    },
    {
      name: '09. Nutrition Plans & Archives',
      description: 'Read active/archived nutrition plans and lazy-load individual plan days.',
      item: [
        req({
          name: 'List Nutrition Plan Refs',
          method: 'GET',
          path: '/v1/plans',
          description: 'Lists active and archived nutrition plan references.'
        }),
        req({
          name: 'Get Full Nutrition Plan by ID',
          method: 'GET',
          path: '/v1/plans/{{activePlanId}}',
          description: 'Fetches the full 7-day nutrition plan owned by the authenticated user.'
        }),
        req({
          name: 'Lazy-Load Single Nutrition Plan Day',
          method: 'GET',
          path: '/v1/plans/{{activePlanId}}/days/{{todayDate}}',
          description: 'Fetches meals and macro targets for a single YYYY-MM-DD day inside the plan.'
        })
      ]
    },
    {
      name: '10. Food, Beverage & Exercise Catalogs',
      description: 'Egyptian/Gulf Arabic food catalog, prepared beverages, custom recipe calculator, and 868-exercise OpenExerciseDB catalog.',
      item: [
        req({
          name: 'Get Catalog Provenance Manifest',
          method: 'GET',
          path: '/v1/catalog/manifest',
          description: 'Returns pinned versions, hashes, licenses, and counts for both exercise and food catalogs.'
        }),
        req({
          name: 'List Muscle Taxonomy & Arabic Labels',
          method: 'GET',
          path: '/v1/catalog/muscles',
          description: 'Returns muscle taxonomy and bilingual labels.'
        }),
        req({
          name: 'Search Foods (Arabic & English)',
          method: 'GET',
          path: '/v1/foods?q=فول&scope=all&includeEstimated=true&offset=0&limit=20',
          description: 'Searches the Egyptian & reference food catalog with Arabic normalization and colloquial synonyms.',
          testScript: [
            'pm.test("Foods returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const items = pm.response.json().items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleFoodId", items[0].id);',
            '});'
          ]
        }),
        req({
          name: 'Get Food Item Detail',
          method: 'GET',
          path: '/v1/foods/{{sampleFoodId}}',
          description: 'Returns full provenance, nutrient basis, portions, and estimate metadata for a food item.'
        }),
        req({
          name: 'Search Egyptian & Ramadan Beverages',
          method: 'GET',
          path: '/v1/beverages?q=شاي&includeEstimated=true&offset=0&limit=20',
          description: 'Searches prepared Egyptian, cafe, Ramadan, and fresh juice beverages.'
        }),
        req({
          name: 'Calculate Custom Recipe / Beverage Nutrients',
          method: 'POST',
          path: '/v1/foods/calculate',
          description: 'Calculates aggregate nutrients and per-100g yield from verified ingredients.',
          body: {
            ingredients: [
              { key: 'chicken', grams: 150 },
              { key: 'rice', grams: 120 }
            ],
            finalWeightGrams: 240
          },
          testScript: [
            'pm.test("Recipe calculated", function () {',
            '  pm.response.to.have.status(200);',
            '  pm.expect(pm.response.json().nutrients).to.be.an("object");',
            '});'
          ]
        }),
        req({
          name: 'Search Exercises Catalog',
          method: 'GET',
          path: '/v1/exercises?q=bench&offset=0',
          description: 'Searches and filters the 868-exercise catalog (optional muscle & equipment filters).',
          testScript: [
            'pm.test("Exercises returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const items = pm.response.json().items || [];',
            '  if (items.length) pm.collectionVariables.set("sampleCatalogExerciseId", encodeURIComponent(items[0].id));',
            '});'
          ]
        }),
        req({
          name: 'Get Exercise Detail by ID',
          method: 'GET',
          path: '/v1/exercises/{{sampleCatalogExerciseId}}',
          description: 'Returns full exercise metadata (URL-encode IDs containing colons such as oedb%3A12).'
        })
      ]
    },
    {
      name: '11. Offline Sync & User Settings',
      description: 'Delta outbox sync feed for offline-first mobile clients, timezone/locale settings, notification preferences, and entitlements.',
      item: [
        req({
          name: 'Get Incremental Sync Changes & Entity Deltas',
          method: 'GET',
          path: '/v1/sync/changes?after=0&afterSeq={{nextSeqCursor}}',
          description: 'Fetches incremental revision metadata and entity-level outbox deltas (upserts & delete tombstones).',
          testScript: [
            'pm.test("Sync feed returned", function () {',
            '  pm.response.to.have.status(200);',
            '  const d = pm.response.json();',
            '  if (typeof d.nextSeqCursor === "number") {',
            '    pm.collectionVariables.set("nextSeqCursor", String(d.nextSeqCursor));',
            '  }',
            '});'
          ]
        }),
        cmdReq({
          name: 'Update Timezone & Locale (timezone)',
          action: 'timezone',
          view: 'receipt',
          description: 'Updates IANA timezone (e.g. Africa/Cairo, Asia/Riyadh, Asia/Dubai) and locale (ar-EG | ar-SA | en).',
          payload: {
            timezone: 'Africa/Cairo',
            locale: 'ar-EG'
          }
        }),
        req({
          name: 'Get Notification Preferences',
          method: 'GET',
          path: '/v1/notifications/preferences',
          description: 'Returns stored reminder flags and quiet-hours configuration.'
        }),
        cmdReq({
          name: 'Update Notification Preferences (notification_preferences)',
          action: 'notification_preferences',
          view: 'receipt',
          description: 'Updates reminder toggles and HH:mm quiet-hours window.',
          payload: {
            dailyReminder: true,
            workoutReminder: true,
            waterReminder: true,
            weeklyReviewReminder: true,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00'
          }
        }),
        req({
          name: 'Get Entitlements',
          method: 'GET',
          path: '/v1/entitlements',
          description: 'Returns current account tier and enabled feature flags.'
        })
      ]
    },
    {
      name: '12. 90-Day Simulation Mode (?simulation=1)',
      description: 'Isolated per-user 90-day virtual simulation sandbox (never touches real account data).',
      item: [
        cmdReq({
          name: 'Reset / Start Simulation Round (simulation_reset)',
          action: 'simulation_reset',
          view: 'full',
          simulation: true,
          description: 'Starts a fresh 90-day simulation round using source: "sample" or "current".',
          payload: {
            source: 'sample',
            confirm: true
          }
        }),
        req({
          name: 'Get Simulation State',
          method: 'GET',
          path: '/v1/state?simulation=1',
          description: 'Reads the isolated simulation namespace state and virtual clock.'
        }),
        cmdReq({
          name: 'Fill Simulation Day Scenario (simulation_fill)',
          action: 'simulation_fill',
          view: 'receipt',
          simulation: true,
          description: 'Fills an empty virtual day with synthetic logs (consistent | plateau | poor_recovery | missed_workout | low_adherence | pain).',
          payload: {
            scenario: 'consistent'
          }
        }),
        cmdReq({
          name: 'Advance Simulation by 1 Day (simulation_next)',
          action: 'simulation_next',
          view: 'receipt',
          simulation: true,
          description: 'Freezes current virtual day summary, advances clock by 1 day (up to day 90), and auto-renews expired nutrition week.',
          payload: {}
        })
      ]
    },
    {
      name: '13. Privacy, Export & GDPR Deletion',
      description: 'Consent logging, normalized-table backfill, full JSON data export, and irreversible GDPR account erasure.',
      item: [
        req({
          name: 'Record Privacy / Health Consent',
          method: 'POST',
          path: '/v1/account/consents',
          description: 'Records versioned explicit user consent in Cloudflare D1.',
          body: {
            consentType: 'health_data_processing',
            version: '1.0.0',
            accepted: true
          }
        }),
        req({
          name: 'Backfill Normalized Tables',
          method: 'POST',
          path: '/v1/account/backfill',
          description: 'Backfills historical account logs into normalized D1 tables.',
          body: {}
        }),
        req({
          name: 'Export Full Account Data (GDPR)',
          method: 'GET',
          path: '/v1/account/export',
          description: 'Returns complete machine-readable JSON export of profile, plans, logs, audit trail, and consents.'
        }),
        req({
          name: 'Delete Account Permanently (GDPR — Destructive)',
          method: 'DELETE',
          path: '/v1/account/delete',
          description: 'IRREVERSIBLE: Permanently erases account data, simulation copies, auth credentials, and revokes all tokens.',
          body: {
            confirm: true
          }
        })
      ]
    }
  ]
};

const serializedCollection = JSON.stringify(collection, null, 2);

const prodEnv = {
  id: '2e9b8a10-6c7d-4e5f-a1b2-3c4d5e6f7a8b',
  name: 'Egypt Nutrition Coach — Cloudflare Production',
  values: [
    { key: 'baseUrl', value: 'https://egypt-nutrition-coach.egypt-nutrition-coach.workers.dev', type: 'default', enabled: true },
    { key: 'testEmail', value: 'demo.user@curafit.app', type: 'default', enabled: true },
    { key: 'testPassword', value: 'CuraFit#2026!', type: 'secret', enabled: true },
    { key: 'deviceId', value: 'postman-prod-01', type: 'default', enabled: true }
  ],
  _postman_variable_scope: 'environment'
};

const localEnv = {
  id: '9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
  name: 'Egypt Nutrition Coach — Local Miniflare Dev',
  values: [
    { key: 'baseUrl', value: 'http://127.0.0.1:8787', type: 'default', enabled: true },
    { key: 'testEmail', value: 'local.user@curafit.app', type: 'default', enabled: true },
    { key: 'testPassword', value: 'CuraFit#2026!', type: 'secret', enabled: true },
    { key: 'deviceId', value: 'postman-local-01', type: 'default', enabled: true }
  ],
  _postman_variable_scope: 'environment'
};

await mkdir('postman', { recursive: true });
await writeFile('postman/Egypt_Nutrition_Coach_API.postman_collection.json', serializedCollection + '\n', 'utf8');
await writeFile('postman/Cloudflare_Production.postman_environment.json', JSON.stringify(prodEnv, null, 2) + '\n', 'utf8');
await writeFile('postman/Local_Dev.postman_environment.json', JSON.stringify(localEnv, null, 2) + '\n', 'utf8');
console.log('Generated Postman collection and environments in postman/');
