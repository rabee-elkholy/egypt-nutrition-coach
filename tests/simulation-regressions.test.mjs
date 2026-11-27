import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { withClock } from '../server/clock.mjs';
import { runScheduledNotifications } from '../server/push.mjs';
import { evaluateProactiveSpecialistNote } from '../proactive-notes.mjs';
import { computeChallengeDayScore } from '../server/progress-analytics.mjs';
import { workoutPlan } from '../server/workouts.mjs';
import { computeWorkoutPrs } from '../server/workouts-insights.mjs';
import { computeProImpactLedger } from '../server/retention.mjs';
import { makeWeek } from '../planner-core.mjs';
import library from '../data/planning-library.json' with { type: 'json' };

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|Smart|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;

const TEST_ENV = {
  AUTH_JWT_SECRET: 'simulation-regressions-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '500',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
  MIN_ANDROID_VERSION: '1.0.0',
  LATEST_ANDROID_VERSION: '1.2.0',
  LATEST_IOS_VERSION: '1.2.0'
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createOidcSigner(kid = 'simreg-k1') {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';
  const signJwt = async payload => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(sig)}`;
  };
  return { jwksJson: JSON.stringify({ keys: [pubJwk] }), signJwt };
}

test('Simulation Regressions (Layers 1-3): proactive micro-notes, dual referral delete, clinical dining/meal filters, carb cycling & workout coverage', async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    r2Buckets: ['CURAFIT_MEDIA_BUCKET'],
    bindings: TEST_ENV
  });

  try {
    const db = await mf.getD1Database('DB');
    const bucket = await mf.getR2Bucket('CURAFIT_MEDIA_BUCKET');
    await migrateLocal(db);
    const signer = await createOidcSigner();
    let seq = 0;

    const call = async (path, opts = {}, nowMs = null, envExtra = {}) => {
      const env = { ...TEST_ENV, OAUTH_GOOGLE_JWKS_JSON: signer.jwksJson, CURAFIT_MEDIA_BUCKET: bucket, ...envExtra, DB: db };
      const req = new Request(`https://curafit-api-dev.egypt-nutrition-coach.workers.dev${path}`, opts);
      const exec = () => cloudflareEntry.fetch(req, env, { waitUntil() {} });
      return nowMs != null ? withClock(nowMs, exec) : exec();
    };

    const createUser = async (name, devId, draft, nowMs = Date.parse('2026-11-10T12:00:00Z')) => {
      seq++;
      const nowSec = Math.floor(Date.now() / 1000);
      const idToken = await signer.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: `simreg-sub-${seq}-${crypto.randomUUID().slice(0, 6)}`,
        email: `simreg.${seq}.${crypto.randomUUID().slice(0, 6)}@curafit.app`,
        email_verified: true,
        name,
        iat: nowSec,
        exp: nowSec + 7200
      });
      const regRes = await call('/v1/auth/oauth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, name, deviceId: devId })
      }, nowMs);
      assert.equal(regRes.status, 201);
      const reg = (await regRes.json()).data;
      const u = { userId: reg.user.userId, rev: 0, headers: { Authorization: `Bearer ${reg.accessToken}`, 'Content-Type': 'application/json' } };
      if (draft) {
        const genRes = await call('/v1/commands', {
          method: 'POST',
          headers: { ...u.headers, 'Idempotency-Key': `gen-${seq}` },
          body: JSON.stringify({ revision: 0, action: 'generate', payload: { name, ...draft } })
        }, nowMs);
        assert.equal(genRes.status, 200);
        const gen = (await genRes.json()).data;
        u.rev = gen.revision;
        u.state = gen;
      }
      return u;
    };

    await t.test('1. Proactive Specialist Micro-Notes: sleep 3d, protein gap swaps, opt-out & Max 1/day lock-screen safety', async () => {
      const nowMs = Date.parse('2026-11-12T12:00:00Z'); // 14:00 Africa/Cairo
      const note = evaluateProactiveSpecialistNote({
        profile: { name: 'Salma', sex: 'female', age: 29, weight: 68, height: 164, timezone: 'Africa/Cairo', maternalStatus: 'none' },
        preferences: { diet: 'balanced', budget: 'low', region: 'egypt', excludedGroups: ['dairy'], proteins: ['eggs', 'chicken', 'fish', 'legumes', 'meat'] },
        checkins: [
          { date: '2026-11-10', sleepHours: 5.0 },
          { date: '2026-11-11', sleepHours: 5.5 },
          { date: '2026-11-12', sleepHours: 5.2 }
        ],
        foodLogs: []
      }, '2026-11-12', nowMs, {});
      assert.equal(note?.code, 'PROACTIVE_NOTE_SLEEP_LOW_3D');
      assert.ok(!FORBIDDEN_VOICE_RE.test(note.text + ' ' + note.action));

      const lowProtNote = evaluateProactiveSpecialistNote({
        profile: { name: 'Lina', sex: 'female', age: 28, weight: 64, height: 164, timezone: 'Africa/Cairo' },
        preferences: { diet: 'balanced', budget: 'low', region: 'egypt', excludedGroups: ['dairy'], proteins: ['eggs', 'chicken', 'fish', 'legumes', 'meat'] },
        active_plan_id: 'p1',
        planRefs: [{ id: 'p1', protein: 110 }],
        checkins: [],
        foodLogs: [
          { date: '2026-11-10', energy: 1500, protein: 55 },
          { date: '2026-11-11', energy: 1500, protein: 60 }
        ]
      }, '2026-11-12', nowMs, { allowFoodSwaps: true });
      assert.equal(lowProtNote?.code, 'PROACTIVE_NOTE_PROTEIN_LOW_2D');
      assert.equal(lowProtNote.params.swapNamesEn.length, 2);
      assert.ok(!/(greek yogurt|yogurt|cottage|cheese)/i.test(lowProtNote.params.swapNamesEn.join(' ')));

      const u = await createUser('Hana', 'dev-reg-1', {
        age: 29, weight: 65, height: 164, sex: 'female', goal: 'lose', targetWeight: 60,
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, Date.parse('2026-11-01T12:00:00Z'));
      for (const [offset, d] of [[8, '2026-11-09'], [9, '2026-11-10'], [10, '2026-11-11']]) {
        const res = await call('/v1/commands?view=receipt', {
          method: 'POST',
          headers: { ...u.headers, 'Idempotency-Key': `rec-${offset}` },
          body: JSON.stringify({ revision: u.rev, action: 'recovery', payload: { date: d, sleepHours: 5.1, sleepQuality: 2, fatigue: 4, stress: 3, soreness: 2, pain: false, illness: false, redFlags: false } })
        }, Date.parse(`${d}T12:00:00Z`));
        assert.equal(res.status, 200);
        u.rev = (await res.json()).data.revision;
      }
      const briefRes = await call('/v1/coaching/brief', { headers: u.headers }, Date.parse('2026-11-11T12:00:00Z'));
      assert.equal(briefRes.status, 200);
      const briefData = (await briefRes.json()).data;
      assert.equal(briefData.proactiveMicroNote?.code, 'PROACTIVE_NOTE_SLEEP_LOW_3D');

      // Opt-out works immediately via notification_preferences
      const prefRes = await call('/v1/commands', {
        method: 'POST',
        headers: { ...u.headers, 'Idempotency-Key': 'pref-optout' },
        body: JSON.stringify({ revision: u.rev, action: 'notification_preferences', payload: { specialistNotesReminder: false } })
      }, Date.parse('2026-11-11T12:00:00Z'));
      assert.equal(prefRes.status, 200);
      assert.equal((await prefRes.json()).data.notificationPreferences.specialistNotesReminder, false);
    });

    await t.test('2. Dual referred-user GDPR delete does not hit UNIQUE constraint & preserves active_plan=undefined safety', async () => {
      const host = await createUser('Host', 'dev-ref-h', { age: 30, weight: 78, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' });
      const r1 = await createUser('Ref One', 'dev-ref-1', { age: 27, weight: 68, height: 170, sex: 'female', goal: 'maintain', serviceTrack: 'workouts_only', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true });
      const r2 = await createUser('Ref Two', 'dev-ref-2', { age: 28, weight: 70, height: 172, sex: 'female', goal: 'maintain', serviceTrack: 'workouts_only', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true });

      const code = (await (await call('/v1/referrals/code', { headers: host.headers })).json()).data.code;
      assert.equal((await call('/v1/referrals/redeem', { method: 'POST', headers: r1.headers, body: JSON.stringify({ code, deviceId: 'uniq-ref-dev-1' }) })).status, 200);
      assert.equal((await call('/v1/referrals/redeem', { method: 'POST', headers: r2.headers, body: JSON.stringify({ code, deviceId: 'uniq-ref-dev-2' }) })).status, 200);

      assert.equal((await call('/v1/account/delete', { method: 'POST', headers: r1.headers, body: JSON.stringify({ confirm: true }) })).status, 200);
      assert.equal((await call('/v1/account/delete', { method: 'POST', headers: r2.headers, body: JSON.stringify({ confirm: true }) })).status, 200);

      // Push cron safely handles accounts without plans array (workouts_only)
      await db.prepare("INSERT OR REPLACE INTO coaching_accounts(user_id,revision,body) VALUES('wo-cron',1,?)" ).bind(JSON.stringify({
        schemaVersion: 3, revision: 1,
        profile: { name: 'Karim WO', timezone: 'Africa/Cairo', locale: 'en' },
        preferences: { diet: 'balanced' },
        onboarding: { serviceTrack: 'workouts_only', journeyStartedOn: '2026-11-01' },
        notificationPreferences: { dailyReminder: true, specialistNotesReminder: true, channels: ['push'] },
        checkins: [{ date: '2026-11-10', sleepHours: 5.0 }, { date: '2026-11-11', sleepHours: 5.1 }, { date: '2026-11-12', sleepHours: 5.2 }],
        foodLogs: [], waterLogs: [], weights: [], sessions: [], workoutLogs: []
      })).run();
      await db.prepare("INSERT OR REPLACE INTO coaching_push_tokens(user_id,device_id,platform,push_token,locale,timezone,updated_at) VALUES('wo-cron','d1','android','tok-wo-1234567890','en','Africa/Cairo','2026-11-12T00:00:00Z')").run();
      const cronRes = await runScheduledNotifications({ DB: db }, Date.parse('2026-11-12T12:00:00Z'));
      assert.ok(cronRes.queued >= 1);
    });

    await t.test('3. Celiac oats & catalog fallback cross-checks, strict INVALID_LOCALE & Dining-Out clinical gates', async () => {
      const celUser = await createUser('Nadia Celiac', 'dev-cel-1', {
        age: 30, weight: 64, height: 165, sex: 'female', goal: 'maintain',
        diseases: ['celiac', 'gout', 'insulin_resistance'], excludedGroups: ['nuts', 'shellfish', 'dairy'],
        serviceTrack: 'nutrition_only'
      });
      const badLoc = await call('/v1/commands', {
        method: 'POST',
        headers: { ...celUser.headers, 'Idempotency-Key': 'bad-loc-1' },
        body: JSON.stringify({ revision: celUser.rev, action: 'generate', payload: { age: 30, weight: 64, height: 165, sex: 'female', goal: 'maintain', locale: 'fr-INVALID', serviceTrack: 'nutrition_only' } })
      });
      assert.equal(badLoc.status, 400);
      assert.equal((await badLoc.json()).error.code, 'INVALID_LOCALE');

      const parseRes = await call('/v1/nutrition/meal-parse', {
        method: 'POST',
        headers: celUser.headers,
        body: JSON.stringify({ inputType: 'text', text: '50g oats, 100g shrimp, 50g almonds, 100g cheddar' })
      });
      assert.equal(parseRes.status, 200);
      const codes = (await parseRes.json()).data.clinicalWarnings.map(w => w.code);
      assert.ok(codes.includes('MEAL_CAPTURE_CELIAC_GLUTEN_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_SEAFOOD_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_NUT_ALLERGY_ALERT'));
      assert.ok(codes.includes('MEAL_CAPTURE_DAIRY_ALERT'));

      const dining = (await (await call('/v1/nutrition/dining-out-options', { headers: celUser.headers })).json()).data;
      assert.ok(dining.options.every(o => o.carbsG <= 52 && !/(fattoush|oat|shrimp|salmon|tuna|liver|almond|halloumi)/i.test(o.nameEn)));
    });

    await t.test('4. Carb cycling weekly calorie parity, Friend Challenge daily foodLogs parity, and 20min full-body multi-exercise fallback', async () => {
      for (const trainingDays of [1, 2, 3, 4, 5, 6]) {
        const plan = makeWeek(
          {
            age: 28, weight: 82, height: 178, sex: 'male', goal: 'muscle_gain', activity: 'moderate',
            carbCycling: true, workoutDays: Array.from({ length: trainingDays }, (_, i) => i), trainingDays
          },
          { diet: 'balanced', region: 'egypt', budget: 'medium', meals: 4, proteins: ['chicken', 'eggs', 'dairy', 'fish', 'meat', 'legumes'] },
          library,
          '2026-11-01',
          `cc-${trainingDays}`
        );
        const wkAvg = plan.days.reduce((s, d) => s + Number(d.targets.energy), 0) / 7;
        const pctDrift = Math.abs(wkAvg - plan.targets.energy) / plan.targets.energy;
        assert.ok(pctDrift <= 0.02, `Expected balanced 7d average energy for ${trainingDays}d, drifted ${Math.round(pctDrift * 1000) / 10}%`);
      }

      const dayScore = computeChallengeDayScore({
        onboarding: { serviceTrack: 'nutrition_only' },
        foodLogs: [{ date: '2026-11-12', energy: 1850, complete: true }],
        waterLogs: [{ date: '2026-11-12', cups: 10, targetCups: 10 }],
        checkins: [{ date: '2026-11-12', sleepHours: 7.5 }]
      }, 'all_round', '2026-11-12');
      assert.ok(dayScore >= 90, `Expected complete daily food log + water + sleep to score >= 90, got ${dayScore}`);

      const wp = workoutPlan({
        age: 38, weight: 135, height: 181, sex: 'male', goal: 'lose',
        fitnessLevel: 'beginner', injuries: ['knee', 'lower_back'],
        workoutLocation: 'home_only', homeEquipment: ['none'],
        sessionDuration: 20, selectedWorkoutDays: [1, 3, 5]
      });
      for (const d of wp.days) {
        assert.ok(d.exercises.length >= 2 && d.exercises.length <= 4, `Expected 2-4 exercises on day ${d.dayIndex}, got ${d.exercises.length}`);
      }
    });

    await t.test('5. [P0] Meal Capture multipart encodes real Base64 + real MIME type to gemini-2.5-flash', async () => {
      const u = await createUser('Vision User', 'dev-vis-1', {
        age: 30, weight: 80, height: 178, sex: 'male', goal: 'lose', targetWeight: 75, serviceTrack: 'nutrition_only'
      });
      const pngBytes = new Uint8Array(48);
      pngBytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52], 0);
      const expectedB64 = Buffer.from(pngBytes).toString('base64');
      const form = new FormData();
      form.append('inputType', 'photo');
      form.append('file', new File([pngBytes], 'plate.png', { type: 'image/png' }));

      const origFetch = globalThis.fetch;
      let capturedUrl = '';
      let capturedBody = null;
      globalThis.fetch = async (url, init) => {
        const uStr = String(url);
        if (uStr.includes('generativelanguage.googleapis.com')) {
          capturedUrl = uStr;
          capturedBody = JSON.parse(String(init?.body || '{}'));
          return new Response(JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: '180g grilled chicken, 150g white rice'
                }]
              }
            }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return origFetch(url, init);
      };
      try {
        const res = await call('/v1/nutrition/meal-parse', {
          method: 'POST',
          headers: { Authorization: u.headers.Authorization },
          body: form
        }, Date.parse('2026-11-12T12:00:00Z'), { GEMINI_API_KEY: 'test-gemini-key' });
        assert.equal(res.status, 200);
        const data = (await res.json()).data;
        assert.ok(capturedUrl.includes('models/gemini-2.5-flash:generateContent'), `Expected gemini-2.5-flash, got ${capturedUrl}`);
        const inlinePart = capturedBody?.contents?.[0]?.parts?.find(p => p.inline_data);
        assert.equal(inlinePart?.inline_data?.mime_type, 'image/png');
        assert.equal(inlinePart?.inline_data?.data, expectedB64);
        assert.ok(data.items.some(i => /chicken/i.test(i.label)), `Expected grounded chicken item, got ${JSON.stringify(data.items)}`);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    await t.test('6. [P0] Care Room & Photo Diff grounded gemini-2.5-flash, guardrail precedence, DEXA rejection & honest fallback', async () => {
      const nowMs = Date.parse('2026-11-20T12:00:00Z');
      const u = await createUser('Care Vision User', 'dev-cv-1', {
        age: 31, weight: 78, height: 176, sex: 'male', goal: 'lose', targetWeight: 72,
        diseases: ['hypertension'], injuries: ['knee'], serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, Date.parse('2026-11-01T12:00:00Z'));
      await call('/v1/account/consents', { method: 'POST', headers: u.headers, body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }) }, nowMs);
      const pngBytes = new Uint8Array(48);
      pngBytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52], 0);
      const k1 = `photos/${u.userId}/before.png`;
      const k2 = `photos/${u.userId}/after.png`;
      await bucket.put(k1, pngBytes, { httpMetadata: { contentType: 'image/png' } });
      await bucket.put(k2, pngBytes, { httpMetadata: { contentType: 'image/png' } });
      await db.batch([
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'cv_p1', '2026-11-01', 'front', k1, 78, '2026-11-01T12:00:00Z'),
        db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'cv_p2', '2026-11-20', 'front', k2, 75.5, '2026-11-20T12:00:00Z')
      ]);

      const origFetch = globalThis.fetch;
      let geminiCalls = 0;
      let lastCarePrompt = '';
      let photoMode = 'valid';
      globalThis.fetch = async (url, init) => {
        const uStr = String(url);
        if (uStr.includes('generativelanguage.googleapis.com')) {
          geminiCalls++;
          const body = JSON.parse(String(init?.body || '{}'));
          const promptText = body?.contents?.[0]?.parts?.[0]?.text || '';
          if (promptText.includes('Member D1 Grounding Snapshot')) {
            lastCarePrompt = promptText;
            return new Response(JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Smart AI plan update: Focus on lean grilled chicken and low-sodium salads today while protecting your knee.' }] } }]
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // Photo diff vision mock
          const imgParts = (body?.contents?.[0]?.parts || []).filter(p => p.inline_data);
          assert.equal(imgParts.length, 2, 'Expected both R2 photos passed to Gemini Vision');
          const visionPayload = photoMode === 'valid'
            ? {
                comparabilityScore: 'moderate',
                comparabilityNoteCodes: ['PHOTO_LIGHTING_MISMATCH'],
                visualObservations: [
                  { region: 'midsection', summaryCode: 'VISUAL_SPECIALIST_OBSERVATION', summary: 'Midsection silhouette appears noticeably tighter alongside the 2.5 kg reduction.' },
                  { region: 'upper_body', summaryCode: 'VISUAL_SPECIALIST_OBSERVATION', summary: 'Upper-body shoulder line looks slightly more defined despite mild lighting differences.' }
                ]
              }
            : {
                comparabilityScore: 'high',
                comparabilityNoteCodes: ['PHOTO_FRAMING_CONSISTENT'],
                visualObservations: [
                  { region: 'midsection', summaryCode: 'VISUAL_SPECIALIST_OBSERVATION', summary: 'Estimated 14% body fat (DEXA equivalent) and 9/10 physique.' }
                ]
              };
          return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(visionPayload) }] } }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return origFetch(url, init);
      };
      try {
        // 6a. Hard Clinical Guardrail blocks Gemini call completely
        const redRes = await call('/v1/coaching/consultation', {
          method: 'POST', headers: u.headers,
          body: JSON.stringify({ message: 'I have severe chest pain and dizziness right now', threadId: 't-care' })
        }, nowMs, { GEMINI_API_KEY: 'test-gemini-key' });
        assert.equal(redRes.status, 200);
        const redData = (await redRes.json()).data;
        assert.equal(redData.safetyNoticeTriggered, true);
        assert.ok(redData.safetyFlagCodes.length >= 1, `Expected safetyFlagCodes, got ${JSON.stringify(redData.safetyFlagCodes)}`);
        assert.equal(geminiCalls, 0, 'Hard clinical guardrail must bypass Gemini call');

        // 6b. Grounded Care Room call passes D1 snapshot & thread history and strips forbidden voice words
        const careRes = await call('/v1/coaching/consultation', {
          method: 'POST', headers: u.headers,
          body: JSON.stringify({ message: 'What should I eat for dinner tonight?', threadId: 't-care' })
        }, nowMs, { GEMINI_API_KEY: 'test-gemini-key' });
        assert.equal(careRes.status, 200);
        const careData = (await careRes.json()).data;
        assert.equal(geminiCalls, 1);
        assert.ok(lastCarePrompt.includes('hypertension') && lastCarePrompt.includes('knee'), 'Expected D1 clinical context grounded in Care Room prompt');
        assert.ok(!FORBIDDEN_VOICE_RE.test(careData.reply), `Forbidden word leaked in Care Room reply: ${careData.reply}`);

        // 6c. Photo Diff with R2 + Gemini Vision -> vision_and_metrics
        const diffOkRes = await call('/v1/progress/photos/analyze-diff', {
          method: 'POST', headers: u.headers,
          body: JSON.stringify({ beforePhotoId: 'cv_p1', afterPhotoId: 'cv_p2', pose: 'front' })
        }, nowMs, { GEMINI_API_KEY: 'test-gemini-key' });
        assert.equal(diffOkRes.status, 201);
        const diffOk = (await diffOkRes.json()).data;
        assert.equal(diffOk.analysisSource, 'vision_and_metrics');
        assert.equal(diffOk.comparabilityScore, 'moderate');
        assert.ok(diffOk.comparabilityNoteCodes.includes('PHOTO_LIGHTING_MISMATCH'));
        assert.ok(!FORBIDDEN_VOICE_RE.test(JSON.stringify(diffOk)));

        // 6d. Photo Diff rejects DEXA/body-fat% hallucinations and falls back honestly to metrics_correlation
        photoMode = 'forbidden_dexa';
        const diffFallbackRes = await call('/v1/progress/photos/analyze-diff', {
          method: 'POST', headers: u.headers,
          body: JSON.stringify({ beforePhotoId: 'cv_p1', afterPhotoId: 'cv_p2', pose: 'front' })
        }, nowMs, { GEMINI_API_KEY: 'test-gemini-key' });
        assert.equal(diffFallbackRes.status, 201);
        const diffFallback = (await diffFallbackRes.json()).data;
        assert.equal(diffFallback.analysisSource, 'metrics_correlation');
        assert.ok(!/DEXA|body fat|9\/10/i.test(JSON.stringify(diffFallback)));
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    await t.test('7. [P0] Zero Week-1 baseline weight PR & seeded_reference MENA barcode provenance', async () => {
      const baseOnly = computeWorkoutPrs({
        workoutPlan: { days: [{ dayIndex: 1, exercises: [{ id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press', loadMode: 'external' }] }] },
        workoutLogs: [
          { date: '2026-11-02', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: [{ kg: 60, reps: 10, setType: 'working' }], at: '2026-11-02T12:00:00Z' }
        ]
      });
      assert.equal(baseOnly.items.length, 0, 'First session baseline must emit 0 PRs');
      assert.equal(baseOnly.summaryByExercise['Barbell_Bench_Press_-_Medium_Grip'].heaviestWeightKg, 60);

      const progressed = computeWorkoutPrs({
        workoutPlan: { days: [{ dayIndex: 1, exercises: [{ id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press', loadMode: 'external' }] }] },
        workoutLogs: [
          { date: '2026-11-02', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: [{ kg: 60, reps: 10, setType: 'working' }], at: '2026-11-02T12:00:00Z' },
          { date: '2026-11-09', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: [{ kg: 65, reps: 10, setType: 'working' }], at: '2026-11-09T12:00:00Z' }
        ]
      });
      const weightPr = progressed.items.find(x => x.prType === 'weight');
      assert.ok(weightPr, 'Second heavier session should emit weight PR');
      assert.equal(weightPr.value, 65);
      assert.equal(weightPr.previousValue, 60);

      const badVerified = await db.prepare("SELECT COUNT(*) AS c FROM food_barcodes WHERE provenance='verified_brand' AND submitted_by_user_id IS NULL").first();
      const seededRef = await db.prepare("SELECT COUNT(*) AS c FROM food_barcodes WHERE provenance='seeded_reference'").first();
      assert.equal(Number(badVerified?.c || 0), 0, 'Synthetic MENA barcodes must not be labeled verified_brand');
      assert.ok(Number(seededRef?.c || 0) >= 600, `Expected >= 600 seeded_reference MENA barcodes, got ${seededRef?.c}`);
    });

    await t.test('8. [P1] Pro Impact Ledger 30d window scoping, zero double-counting, protein adherence & realistic time saved', async () => {
      const nowMs = Date.parse('2026-11-30T12:00:00Z');
      const ledger = await computeProImpactLedger(db, {
        profile: { timezone: 'Africa/Cairo', weight: 80, height: 178, sex: 'male', age: 30 },
        onboarding: { journeyStartedOn: '2026-09-01' },
        active_plan_id: 'p3',
        planRefs: [
          { id: 'p0', created_at: '2026-09-01T12:00:00Z', start_date: '2026-09-01', protein: 140, reason: 'Initial plan' },
          { id: 'p1', created_at: '2026-10-10T12:00:00Z', start_date: '2026-10-10', protein: 140, reason: 'Weekly renewal' },
          { id: 'p2', created_at: '2026-11-15T12:00:00Z', start_date: '2026-11-15', protein: 140, reason: 'Accepted calorie adaptation' },
          { id: 'p3', created_at: '2026-11-22T12:00:00Z', start_date: '2026-11-22', protein: 140, reason: 'Weekly renewal' }
        ],
        adaptations: [
          { id: 'a-old', kind: 'calories', status: 'accepted', decidedAt: '2026-10-05T12:00:00Z' },
          { id: 'a-new', kind: 'calories', status: 'accepted', decidedAt: '2026-11-15T12:00:00Z' }
        ],
        foodLogs: [
          { date: '2026-11-28', energy: 2100, protein: 138, complete: true, mode: 'daily_total' },
          { date: '2026-11-29', energy: 2050, complete: true, mode: 'entries' }
        ],
        foodEntries: [
          { id: 'fe1', date: '2026-11-29', slot: 'lunch', source: 'dining_out', snapshot: { values: { energy: '900', protein: '130' } } }
        ],
        waterLogs: [{ date: '2026-11-29', cups: 12, targetCups: 12 }],
        sessions: [{ date: '2026-11-29', status: 'completed' }],
        history: [{ kind: 'meal_replace', at: '2026-11-28T12:00:00Z' }]
      }, 'impact-test-user', TEST_ENV, nowMs);

      assert.equal(ledger.cycleDays, 30);
      // Only a-new (1) + p3 weekly renewal (1) = 2 (a-old & p1 outside 30d; p2 deduplicated with a-new!)
      assert.equal(ledger.calibrationsApplied, 2, `Expected 2 scoped non-double-counted calibrations, got ${ledger.calibrationsApplied}`);
      assert.equal(ledger.proteinAdherencePct, 100);
      assert.equal(ledger.sessionsCompleted, 1);
      assert.ok(ledger.estimatedMinutesSaved >= 50, `Expected realistic time saved >= 50m, got ${ledger.estimatedMinutesSaved}`);
    });

    await t.test('9. [P2] Wave 2 health consent lock (403) & Idempotency-Key replay/mismatch on dining-out-log, retention-intent & session-override-today', async () => {
      const nowMs = Date.parse('2026-11-15T12:00:00Z');
      const u = await createUser('Guard Idem User', 'dev-gid-1', {
        age: 30, weight: 80, height: 176, sex: 'male', goal: 'lose', targetWeight: 74,
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, nowMs);
      const dStr = '2026-11-15';
      const opts = (await (await call(`/v1/nutrition/dining-out-options?category=grill&date=${dStr}`, { headers: u.headers }, nowMs)).json()).data;
      const optId = opts.options[0].id;

      // 9a. dining-out-log Idempotency-Key replay & 409 mismatch
      const dKey = `idem-dining-${crypto.randomUUID()}`;
      const d1Res = await call('/v1/nutrition/dining-out-log', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': dKey },
        body: JSON.stringify({ optionId: optId, date: dStr, slot: 'dinner' })
      }, nowMs);
      assert.equal(d1Res.status, 201);
      const d1 = (await d1Res.json()).data;
      const d2Res = await call('/v1/nutrition/dining-out-log', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': dKey },
        body: JSON.stringify({ optionId: optId, date: dStr, slot: 'dinner' })
      }, nowMs);
      assert.equal(d2Res.status, 201);
      assert.equal(d2Res.headers.get('Idempotency-Replayed'), 'true');
      const d2 = (await d2Res.json()).data;
      assert.equal(d2.revision, d1.revision);
      assert.equal(d2.replayed, true);
      const dMis = await call('/v1/nutrition/dining-out-log', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': dKey },
        body: JSON.stringify({ optionId: optId, date: dStr, slot: 'lunch' })
      }, nowMs);
      assert.equal(dMis.status, 409);
      assert.equal((await dMis.json()).error.code, 'IDEMPOTENCY_KEY_REUSED_MISMATCH');

      // 9b. retention-intent Idempotency-Key replay & 409 mismatch
      const rKey = `idem-ret-${crypto.randomUUID()}`;
      const r1Res = await call('/v1/subscriptions/retention-intent', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': rKey },
        body: JSON.stringify({ intent: 'pause_14d', reasonCode: 'travel' })
      }, nowMs);
      assert.equal(r1Res.status, 200);
      const r1 = (await r1Res.json()).data;
      const r2Res = await call('/v1/subscriptions/retention-intent', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': rKey },
        body: JSON.stringify({ intent: 'pause_14d', reasonCode: 'travel' })
      }, nowMs);
      assert.equal(r2Res.status, 200);
      assert.equal(r2Res.headers.get('Idempotency-Replayed'), 'true');
      assert.equal((await r2Res.json()).data.revision, r1.revision);
      const rMis = await call('/v1/subscriptions/retention-intent', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': rKey },
        body: JSON.stringify({ intent: 'pause_30d', reasonCode: 'travel' })
      }, nowMs);
      assert.equal(rMis.status, 409);
      assert.equal((await rMis.json()).error.code, 'IDEMPOTENCY_KEY_REUSED_MISMATCH');

      // 9c. session-override-today Idempotency-Key replay & 409 mismatch
      const oKey = `idem-ovr-${crypto.randomUUID()}`;
      const o1Res = await call('/v1/workouts/session-override-today', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': oKey },
        body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30, date: dStr })
      }, nowMs);
      assert.equal(o1Res.status, 200);
      const o1 = (await o1Res.json()).data;
      const o2Res = await call('/v1/workouts/session-override-today', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': oKey },
        body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30, date: dStr })
      }, nowMs);
      assert.equal(o2Res.status, 200);
      assert.equal(o2Res.headers.get('Idempotency-Replayed'), 'true');
      assert.equal((await o2Res.json()).data.revision, o1.revision);
      const oMis = await call('/v1/workouts/session-override-today', {
        method: 'POST', headers: { ...u.headers, 'Idempotency-Key': oKey },
        body: JSON.stringify({ mode: 'dumbbell_only', durationMin: 30, date: dStr })
      }, nowMs);
      assert.equal(oMis.status, 409);
      assert.equal((await oMis.json()).error.code, 'IDEMPOTENCY_KEY_REUSED_MISMATCH');

      // 9d. Withdraw health_data_processing consent -> 403 HEALTH_CONSENT_REQUIRED on all 8 Wave 2 health routes
      const withdraw = await call('/v1/account/consents', {
        method: 'POST', headers: u.headers,
        body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0', accepted: false })
      }, nowMs);
      assert.equal(withdraw.status, 200);

      const gatedCalls = [
        ['/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'a', afterPhotoId: 'b', pose: 'front' }) }],
        ['/v1/nutrition/meal-parse', { method: 'POST', headers: u.headers, body: JSON.stringify({ inputType: 'text', text: '100g chicken' }) }],
        ['/v1/coaching/consultation', { method: 'POST', headers: u.headers, body: JSON.stringify({ message: 'Can I eat rice?' }) }],
        ['/v1/nutrition/dining-out-options', { headers: u.headers }],
        ['/v1/nutrition/dining-out-log', { method: 'POST', headers: u.headers, body: JSON.stringify({ optionId: optId, date: dStr }) }],
        ['/v1/account/clinical-summary', { headers: u.headers }],
        ['/v1/workouts/session-override-today', { method: 'POST', headers: u.headers, body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30 }) }],
        ['/v1/workouts/muscle-status', { headers: u.headers }]
      ];
      for (const [path, init] of gatedCalls) {
        const res = await call(path, init, nowMs);
        assert.equal(res.status, 403, `Expected 403 HEALTH_CONSENT_REQUIRED on ${path}, got ${res.status}`);
        assert.equal((await res.json()).error.code, 'HEALTH_CONSENT_REQUIRED');
      }
    });
  } finally {
    await mf.dispose();
  }
});
