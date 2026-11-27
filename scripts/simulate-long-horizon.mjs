// Layer 2 Deterministic Long-Horizon Simulation (25 Journeys, 30-180 Days) + Layer 3 Specialist Diary Capture
import assert from 'node:assert/strict';
import { writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateKeyPairSync } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { migrateLocal } from './local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';
import { withClock } from '../server/clock.mjs';
import { runScheduledNotifications, formatPushNotification, isFastingFoodHydrationSuppressed } from '../server/push.mjs';
import { MUSCLE_REGIONS } from '../coaching-shared.mjs';

const FORBIDDEN_VOICE_RE = /\b(AI|AI Coach|Smart Coach|Smart|automated|automatic|automatically|algorithm|algorithmic|engine|bot|LLM)\b|\u0622\u0644\u064A|\u0627\u0644\u0630\u0643\u064A|\u0645\u062D\u0631\u0643/i;
const ARABIC_RE = /[\u0600-\u06FF]/;

const TEST_ENV = {
  AUTH_JWT_SECRET: 'layer2-long-horizon-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '100000',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
  MIN_ANDROID_VERSION: '1.0.0',
  LATEST_ANDROID_VERSION: '1.2.0',
  LATEST_IOS_VERSION: '1.2.0'
};

const BASE_MS = Date.parse('2026-11-01T12:00:00Z');
const dayMs = (dayNum, hourUtc = 12) => BASE_MS + (dayNum - 1) * 86400000 + (hourUtc - 12) * 3600000;
const addDaysStr = (baseDate, delta) => new Date(Date.parse(`${baseDate}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createOidcSigner(kid = 'sim2-k1') {
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

const signer = await createOidcSigner('sim2-google-k1');
const diaryMarkdown = ['# CuraFit Layer 3 Specialist Diary & Pro-Value Transcripts\n'];
const report = { startedAt: new Date().toISOString(), journeys: [], passCount: 0, failCount: 0 };
const SCRATCH_DIR = 'C:/Users/rabee/.gemini/antigravity/brain/7b05a7a5-e9de-4fbc-82da-b678f358ca91/scratch';
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const activeBatch = batchArg ? batchArg.slice('--batch='.length) : null;
const shouldRun = name => activeBatch === name;

if (!activeBatch) {
  const execFileAsync = promisify(execFile);
  await mkdir(SCRATCH_DIR, { recursive: true });
  const runBatchProc = async b => {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['scripts/simulate-long-horizon.mjs', `--batch=${b}`], {
      maxBuffer: 20 * 1024 * 1024
    }).catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || '', code: err.code || 1 }));
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return JSON.parse(await readFile(`${SCRATCH_DIR}/layer2_part_${b}.json`, 'utf8'));
  };

  // Interleave heavy and light batches with clean cooldowns so Windows ephemeral ports (TIME_WAIT) drain cleanly
  const execOrder = ['b1', 'b5', 'b7', 'b8', 'b2', 'b6a', 'b3', 'b6b', 'b4'];
  const partMap = new Map();
  for (let i = 0; i < execOrder.length; i++) {
    const b = execOrder[i];
    if (b === 'b4') await new Promise(r => setTimeout(r, 25000));
    else if (b === 'b6a' || b === 'b6b') await new Promise(r => setTimeout(r, 15000));
    else if (i > 0) await new Promise(r => setTimeout(r, 3000));
    partMap.set(b, await runBatchProc(b));
  }
  const canonicalOrder = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6a', 'b6b', 'b7', 'b8'];
  for (const b of canonicalOrder) {
    const part = partMap.get(b);
    if (!part) continue;
    report.journeys.push(...(part.journeys || []));
    report.passCount += part.passCount || 0;
    report.failCount += part.failCount || 0;
    if (Array.isArray(part.diaryLines) && part.diaryLines.length) diaryMarkdown.push(...part.diaryLines);
  }
  report.journeys.sort((a, b) => a.id.localeCompare(b.id));
  for (const b of canonicalOrder) {
    await rm(`${SCRATCH_DIR}/layer2_part_${b}.json`, { force: true });
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(`${SCRATCH_DIR}/layer2_report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${SCRATCH_DIR}/specialist_diary_audit.md`, diaryMarkdown.join('\n'));
  console.log(`\n=== LAYER 2 SUMMARY: ${report.passCount}/${report.journeys.length} PASSED, ${report.failCount} FAILED ===`);
  if (report.failCount > 0) process.exit(1);
  process.exit(0);
}

// Factory creating a fresh isolated Miniflare D1/R2 runtime per batch of journeys so workerd D1 stays fast and clean
async function createRuntime() {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    r2Buckets: ['CURAFIT_MEDIA_BUCKET'],
    bindings: TEST_ENV
  });
  const db = await mf.getD1Database('DB');
  const bucket = await mf.getR2Bucket('CURAFIT_MEDIA_BUCKET');
  await migrateLocal(db);

  async function call(path, opts = {}, envExtra = {}, nowMs = null) {
    const env = {
      ...TEST_ENV,
      OAUTH_GOOGLE_JWKS_JSON: signer.jwksJson,
      CURAFIT_MEDIA_BUCKET: bucket,
      ...envExtra,
      DB: db
    };
    const req = new Request(`https://curafit-api-dev.egypt-nutrition-coach.workers.dev${path}`, opts);
    const exec = () => cloudflareEntry.fetch(req, env, { waitUntil() {} });
    return nowMs != null ? withClock(nowMs, exec) : exec();
  }

  async function okJson(res, expectedStatus = 200) {
    const body = await res.json();
    assert.equal(res.status, expectedStatus, `HTTP ${res.status} != ${expectedStatus}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
    assert.ok(!FORBIDDEN_VOICE_RE.test(JSON.stringify(body)), `Forbidden word leaked in API response: ${JSON.stringify(body).slice(0, 400)}`);
    return body.data;
  }

  async function errJson(res, expectedStatus, expectedCode = null) {
    const body = await res.json();
    assert.equal(res.status, expectedStatus, `HTTP ${res.status} != ${expectedStatus}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, false);
    assert.ok(!FORBIDDEN_VOICE_RE.test(body.error?.message || ''), `Forbidden word in error: ${body.error?.message}`);
    assert.ok(!ARABIC_RE.test(body.error?.message || ''), `Arabic leaked into error message: ${body.error?.message}`);
    if (expectedCode) assert.equal(body.error.code, expectedCode, `Expected error ${expectedCode}, got ${body.error.code}: ${body.error.message}`);
    return body.error;
  }

  let userSeq = 0;
  async function createUser(name, deviceId = null, profileDraft = null, nowMs = BASE_MS, envExtra = {}) {
    userSeq++;
    const nowSec = Math.floor(Date.now() / 1000);
    const email = `sim2.u${userSeq}.${crypto.randomUUID().slice(0, 6)}@curafit.app`;
    const idToken = await signer.signJwt({
      iss: 'https://accounts.google.com',
      aud: 'curafit-android-client-id',
      sub: `sim2-sub-${userSeq}-${crypto.randomUUID().slice(0, 6)}`,
      email,
      email_verified: true,
      name,
      iat: nowSec,
      exp: nowSec + 7200
    });
    const reg = await okJson(await call('/v1/auth/oauth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, name, deviceId: deviceId || `dev-sim2-${userSeq}` })
    }, envExtra, nowMs), 201);
    const u = {
      userId: reg.user.userId,
      email,
      deviceId: deviceId || `dev-sim2-${userSeq}`,
      token: reg.accessToken,
      refreshToken: reg.refreshToken,
      headers: { Authorization: `Bearer ${reg.accessToken}`, 'Content-Type': 'application/json' },
      rev: 0,
      state: null,
      localDate(ms) {
        const tz = this.state?.profile?.timezone || 'Africa/Cairo';
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
      }
    };
    if (profileDraft) {
      const gen = await okJson(await call('/v1/commands', {
        method: 'POST',
        headers: { ...u.headers, 'Idempotency-Key': `gen-${u.userId}-${crypto.randomUUID()}` },
        body: JSON.stringify({ revision: u.rev, action: 'generate', payload: { name, ...profileDraft } })
      }, envExtra, nowMs));
      u.rev = gen.revision;
      u.state = gen;
    }
    return u;
  }

  async function cmd(u, action, payload, nowMs, envExtra = {}, allowFailure = false, receiptMode = false) {
    const path = receiptMode ? '/v1/commands?view=receipt' : '/v1/commands';
    const res = await call(path, {
      method: 'POST',
      headers: { ...u.headers, 'Idempotency-Key': `cmd-${action}-${crypto.randomUUID()}` },
      body: JSON.stringify({ revision: u.rev, action, payload })
    }, envExtra, nowMs);
    if (allowFailure) return res;
    const data = await okJson(res);
    u.rev = data.revision;
    if (!receiptMode) u.state = data;
    return data;
  }

  async function refreshState(u, nowMs) {
    u.state = await okJson(await call('/v1/state', { headers: u.headers }, {}, nowMs));
    u.rev = u.state.revision;
    return u.state;
  }

  async function grantPro(userId, nowMs, days = 90) {
    const exp = new Date(nowMs + days * 86400000).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    await db.batch([
      db.prepare(
        "INSERT OR REPLACE INTO coaching_subscriptions(user_id,provider,external_tx_id,product_id,status,trial_used,auto_renew_enabled,expires_at,raw_state_json,updated_at) VALUES(?,'google',?,'curafit_pro.monthly','active',1,1,?,'{}',?)"
      ).bind(userId, `tx-pro-${userId}`, exp, nowIso),
      db.prepare("UPDATE coaching_users SET entitlement='pro', updated_at=? WHERE user_id=?").bind(nowIso, userId)
    ]);
  }

  async function revokePro(userId, nowMs) {
    const pastIso = new Date(nowMs - 86400000).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    await db.batch([
      db.prepare("UPDATE coaching_subscriptions SET status='expired', expires_at=?, updated_at=? WHERE user_id=?").bind(pastIso, nowIso, userId),
      db.prepare("UPDATE coaching_users SET entitlement='free', updated_at=? WHERE user_id=?").bind(nowIso, userId)
    ]);
  }

  async function renewIfNeeded(u, nowMs, envExtra = {}) {
    const activePlan = u.state?.plans?.find(p => p.id === u.state.active_plan_id);
    const date = u.localDate(nowMs);
    if (activePlan && activePlan.days?.at(-1)?.date < date) {
      await cmd(u, 'renew_plan', {}, nowMs, envExtra, false, false);
    }
  }

  async function logHealthyRecovery(u, date, nowMs, envExtra = {}, patch = {}, receipt = true) {
    return cmd(u, 'recovery', {
      date, sleepHours: 7.5, sleepQuality: 4, fatigue: 2, stress: 2, soreness: 1,
      pain: false, illness: false, redFlags: false, ...patch
    }, nowMs, envExtra, false, receipt);
  }

  async function logPlannedFoodOrTotal(u, date, nowMs, energy = null, envExtra = {}, receipt = true) {
    const activePlan = u.state?.plans?.find(p => p.id === u.state.active_plan_id);
    const targetE = energy ?? activePlan?.days?.find(d => d.date === date)?.targets?.energy ?? activePlan?.targets?.energy ?? 2000;
    return cmd(u, 'food', { date, energy: Math.round(targetE), complete: true }, nowMs, envExtra, false, receipt);
  }

  async function performScheduledWorkoutIfAny(u, date, nowMs, kg = 60, reps = 12, increment = null, envExtra = {}, fullSession = false) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const dayObj = u.state?.workoutPlan?.days?.find(d => d.dayIndex === weekday);
    if (!dayObj?.exercises?.length) return null;
    const picked = fullSession ? dayObj.exercises : dayObj.exercises.slice(0, 1);
    for (const ex of picked) {
      const isWeighted = ex.loadMode === 'external' || ex.supportsAddedWeight === true;
      const setObj = isWeighted ? { kg, reps, rir: 2 } : { reps, rir: 2 };
      await cmd(u, 'workout', {
        date,
        dayIndex: dayObj.dayIndex,
        exerciseId: ex.id,
        ...(increment != null && isWeighted ? { increment } : {}),
        ...(ex.laterality === 'unilateral' ? { bothSides: true } : {}),
        sets: Array.from({ length: Math.min(3, ex.sets || 3) }, () => ({ ...setObj }))
      }, nowMs, envExtra, false, true);
    }
    await cmd(u, 'session', { date, dayIndex: dayObj.dayIndex, status: 'completed', duration: dayObj.estimatedMinutes || 45, rpe: 7 }, nowMs, envExtra, false, true);
    return dayObj;
  }

  async function captureDayTranscript(label, personaTitle, u, dayNum, nowMs, includeImpact = false) {
    await refreshState(u, nowMs);
    const briefRes = await okJson(await call('/v1/coaching/brief', { headers: u.headers }, {}, nowMs));
    const boot = await okJson(await call('/v1/bootstrap', { headers: u.headers }, {}, nowMs));
    const impact = includeImpact ? await okJson(await call('/v1/progress/pro-impact', { headers: u.headers }, {}, nowMs)) : null;
    const activePlan = u.state?.plans?.find(p => p.id === u.state.active_plan_id);
    const dStr = u.localDate(nowMs);
    const planDay = activePlan?.days?.find(d => d.date === dStr);
    const sched = (u.state?.scheduledSessions || []).find(s => s.date === dStr);

    diaryMarkdown.push(`\n## ${personaTitle} — Day ${dayNum} (${dStr}) [${label}]\n`);
    if (planDay) {
      diaryMarkdown.push(`- **Nutrition Plan:** Target ${planDay.targets?.energy} kcal | P ${planDay.targets?.protein}g | C ${planDay.targets?.carbs}g | F ${planDay.targets?.fat}g | Meals: ${(planDay.meals || []).map(m => `${m.slot}: ${m.snapshot?.name}`).join(' ; ')}`);
    } else {
      diaryMarkdown.push(`- **Nutrition Plan:** None (track: ${u.state?.onboarding?.serviceTrack})`);
    }
    if (sched) {
      const wpDay = u.state?.workoutPlan?.days?.find(d => d.dayIndex === sched.dayIndex);
      diaryMarkdown.push(`- **Workout Session:** ${sched.focus} (${(wpDay?.exercises || []).slice(0, 4).map(e => `${e.name} ${e.sets}x${e.repMin}-${e.repMax}`).join(', ')})`);
    } else {
      diaryMarkdown.push(`- **Workout Session:** Rest day`);
    }
    diaryMarkdown.push(`- **Hydration & Recovery:** Water ${boot.todaySummary?.hydration?.targetCups ?? boot.todaySummary?.waterTargetCups} cups (${boot.todaySummary?.hydration?.targetLiters ?? boot.todaySummary?.waterTargetLiters}L) | Readiness: ${boot.todaySummary?.recovery?.status || u.state?.recovery?.status} | Streak: ${boot.streakSummary?.currentDays ?? 0}d`);
    diaryMarkdown.push(`- **Daily Brief Notes (${briefRes.notes.length}):**`);
    for (const n of briefRes.notes) {
      assert.ok(!FORBIDDEN_VOICE_RE.test(n.text + ' ' + n.action), `Forbidden copy in brief note: ${n.text}`);
      assert.ok(!ARABIC_RE.test(n.code), `Arabic in code: ${n.code}`);
      diaryMarkdown.push(`  - **[${n.role}] (${n.code})**: ${n.text} -> _Action:_ ${n.action}`);
    }
    if (briefRes.proactiveMicroNote) {
      assert.ok(!FORBIDDEN_VOICE_RE.test(briefRes.proactiveMicroNote.text), `Forbidden copy in proactive note`);
      diaryMarkdown.push(`  - **[PROACTIVE MICRO-NOTE] (${briefRes.proactiveMicroNote.code})**: ${briefRes.proactiveMicroNote.text}`);
    }
    if (u.state?.lastReview) {
      diaryMarkdown.push(`- **Last Review / Proposals:** ${u.state.lastReview.reasonCode} | Nutrition: ${u.state.lastReview.nutrition?.reasonCode} | Volume: ${u.state.lastReview.volume?.reasonCode}`);
    }
    if (impact) {
      diaryMarkdown.push(`- **Pro Impact Ledger (Day ${dayNum}):** cycleDays=${impact.cycleDays}, minutesSaved=${impact.estimatedMinutesSaved}, calibrations=${impact.calibrationsApplied}, prs=${impact.prsAchieved}, proteinAdherence=${impact.proteinAdherencePct}%, hydrationAdherence=${impact.hydrationAdherencePct}%, sessions=${impact.sessionsCompleted}`);
    }
  }

  return {
    mf, db, call, okJson, errJson, createUser, cmd, refreshState,
    grantPro, revokePro, renewIfNeeded, logHealthyRecovery,
    logPlannedFoodOrTotal, performScheduledWorkoutIfAny, captureDayTranscript
  };
}

async function runJourney(id, title, rt, fn) {
  const t0 = performance.now();
  try {
    const details = await fn(rt);
    const ms = Math.round(performance.now() - t0);
    report.journeys.push({ id, title, status: 'PASS', durationMs: ms, details });
    report.passCount++;
    console.log(`PASS [${id}] ${title} (${ms}ms)`);
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    report.journeys.push({ id, title, status: 'FAIL', durationMs: ms, error: err?.message || String(err), stack: err?.stack?.split('\n').slice(0, 5).join('\n') });
    report.failCount++;
    console.error(`FAIL [${id}] ${title} (${ms}ms): ${err?.message}`);
  }
}

// Helper that gives each journey group its own fresh Miniflare runtime and pauses briefly on Windows so ephemeral TCP sockets reclaim cleanly
async function withRuntime(fn) {
  const rt = await createRuntime();
  try {
    return await fn(rt);
  } finally {
    await rt.mf.dispose();
    await new Promise(r => setTimeout(r, 400));
  }
}

// ======================= J01 (dedicated Miniflare) =======================
if (shouldRun('b1')) await withRuntime(rt => runJourney('J01', '[120d] Gym Fat-Loss + Plateau + Feast Rebalance + Diet Break + Maintenance', rt, async r => {
      const u = await r.createUser('Tarek Mansour', 'dev-j01', {
        age: 30, weight: 88, height: 178, sex: 'male', goal: 'lose', targetWeight: 78,
        activity: 'moderate', dietType: 'balanced', region: 'egypt',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 150);
      const startKcal = u.state.plans[0].targets.energy;
      const startProt = u.state.plans[0].targets.protein;
      let plateauProposed = false, dietBreakSeen = false, maintProposed = false, prAchieved = false;

      for (let d = 1; d <= 120; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(u, now, { ENFORCE_PRO_ENTITLEMENTS: 'true' });
        const date = u.localDate(now);
        let kg = 88.0;
        if (d > 30 && d <= 98) kg = Math.max(77.6, Math.round((88.0 - (d - 30) * 0.16) * 10) / 10);
        else if (d > 98) kg = 77.6;

        await r.cmd(u, 'weight', { date, kg }, now, {}, false, true);
        await r.logHealthyRecovery(u, date, now);
        await r.cmd(u, 'water', { date, cups: 12 }, now, {}, false, true);
        if (d === 35) {
          const planE = u.state.plans.find(p => p.id === u.state.active_plan_id)?.days.find(x => x.date === date)?.targets?.energy || startKcal;
          await r.cmd(u, 'food', { date, energy: Math.round(planE + 900), complete: true }, now, {}, false, true);
          const spread = await r.cmd(u, 'post_feast_rebalance', { date, mode: 'gentle_spread', excessKcal: 900 }, now, { ENFORCE_PRO_ENTITLEMENTS: 'true' });
          assert.equal(spread.postFeastSpread.mode, 'gentle_spread');
        } else {
          await r.logPlannedFoodOrTotal(u, date, now);
        }
        const loadKg = d <= 20 ? 40 : d <= 45 ? 42.5 : d <= 80 ? 70 : 75;
        const wo = await r.performScheduledWorkoutIfAny(u, date, now, loadKg, 12, d <= 45 ? 2.5 : 5);
        if (wo && d > 85) prAchieved = true;

        if (d % 7 === 0) {
          await r.cmd(u, 'review', {}, now);
          if (u.state.lastReview?.dietBreakSuggestion?.reasonCode === 'DIET_BREAK_8W_SUGGESTED') dietBreakSeen = true;
          const calProp = u.state.adaptations?.find(a => a.status === 'pending' && a.kind === 'calories');
          if (calProp && d <= 34) {
            plateauProposed = true;
            await r.cmd(u, 'adaptation', { id: calProp.id, accept: true }, now, { ENFORCE_PRO_ENTITLEMENTS: 'true' });
            const afterProt = u.state.plans.find(p => p.id === u.state.active_plan_id).targets.protein;
            assert.ok(Math.abs(afterProt - startProt) / startProt <= 0.03);
          }
          const maintProp = u.state.adaptations?.find(a => a.status === 'pending' && a.kind === 'maintenance');
          if (maintProp) {
            maintProposed = true;
            await r.cmd(u, 'adaptation', { id: maintProp.id, accept: true }, now, { ENFORCE_PRO_ENTITLEMENTS: 'true' });
          }
        }
        if ([1, 7, 14, 25, 30, 55, 60, 85, 90].includes(d)) {
          await r.captureDayTranscript(`J01-d${d}`, 'Persona #1: Gym Fat-Loss (Cairo, both)', u, d, now, [25, 55, 85].includes(d));
        }
      }
      assert.ok(plateauProposed && dietBreakSeen && maintProposed && prAchieved);
      return { plateauProposed, dietBreakSeen, maintProposed, prAchieved };
    }));

// ======================= J02 (dedicated Miniflare) =======================
if (shouldRun('b2')) await withRuntime(rt => runJourney('J02', '[90d] Nutrition-Only Saudi (gulf, low_carb, batchPrepMode)', rt, async r => {
      const u = await r.createUser('Noura Al-Qahtani', 'dev-j02', {
        age: 31, weight: 74, height: 162, sex: 'female', goal: 'lose', targetWeight: 65,
        activity: 'light', dietType: 'low_carb', region: 'gulf', timezone: 'Asia/Riyadh', locale: 'ar-SA',
        batchPrepMode: true, serviceTrack: 'nutrition_only'
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 120);
      let adaptedNoWorkout = false;
      for (let d = 1; d <= 90; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(u, now);
        const date = u.localDate(now);
        const kg = d <= 28 ? 74.0 : Math.max(66.5, Math.round((74.0 - (d - 28) * 0.12) * 10) / 10);
        await r.cmd(u, 'weight', { date, kg }, now, {}, false, true);
        await r.logPlannedFoodOrTotal(u, date, now);
        await r.cmd(u, 'water', { date, cups: 10 }, now, {}, false, true);
        if (d % 7 === 0) {
          await r.cmd(u, 'review', {}, now);
          const calProp = u.state.adaptations?.find(a => a.status === 'pending' && a.kind === 'calories');
          if (calProp) {
            await r.cmd(u, 'adaptation', { id: calProp.id, accept: true }, now);
            adaptedNoWorkout = true;
          }
        }
        if ([1, 7, 14, 25, 30, 55, 60, 85, 90].includes(d)) {
          await r.captureDayTranscript(`J02-d${d}`, 'Persona #2: Saudi Nutrition-Only (gulf, low_carb, batchPrep)', u, d, now, [25, 55, 85].includes(d));
        }
      }
      const grocery = await r.okJson(await r.call(`/v1/plans/${u.state.active_plan_id}/grocery-list`, { headers: u.headers }, {}, dayMs(90)));
      assert.equal(grocery.batchPrepMode, true);
      assert.ok(grocery.batchConsolidatedCount > 0);
      const badges = await r.okJson(await r.call('/v1/badges', { headers: u.headers }, {}, dayMs(90)));
      assert.ok(!badges.visibleBadges.some(b => ['WORKOUT_WARRIOR_3X', 'NEW_PERSONAL_RECORD'].includes(b.badgeId)));
      assert.ok(adaptedNoWorkout);
      return { adaptedNoWorkout, consolidatedCount: grocery.batchConsolidatedCount };
    }));

// ======================= J03 (dedicated Miniflare) =======================
if (shouldRun('b3')) await withRuntime(rt => runJourney('J03', '[90d] Workouts-Only Beginner (10-35kg) Simple->Pro + Travel + Open + Heatmap', rt, async r => {
      const u = await r.createUser('Adam Gamal', 'dev-j03', {
        age: 24, weight: 72, height: 175, sex: 'male', goal: 'muscle_gain', targetWeight: 77,
        fitnessLevel: 'beginner', workoutLocation: 'gym_only', sessionDuration: 45,
        selectedWorkoutDays: [1, 3, 5], serviceTrack: 'workouts_only', healthConfirmed: true
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 120);
      assert.equal(u.state.profile.workoutUiMode, 'simple');
      let sawSub50Suggestion = false;
      for (let d = 1; d <= 90; d++) {
        const now = dayMs(d);
        const date = u.localDate(now);
        if (d === 30) await r.cmd(u, 'workout_ui_mode', { mode: 'pro' }, now);
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        const dayObj = u.state.workoutPlan.days.find(x => x.dayIndex === weekday);
        if (dayObj || d === 50 || d === 90) {
          await r.logHealthyRecovery(u, date, now);
          await r.cmd(u, 'water', { date, cups: 10 }, now, {}, false, true);
        }
        if (dayObj) {
          if (d === 36) {
            const ovr = await r.okJson(await r.call('/v1/workouts/session-override-today', {
              method: 'POST', headers: u.headers, body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 30 })
            }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, now));
            assert.equal(ovr.permanentSplitPreserved, true);
          } else {
            const pickedEx = (d <= 7 || d >= 86) ? dayObj.exercises : dayObj.exercises.slice(0, 1);
            for (const ex of pickedEx) {
              const isW = ex.loadMode === 'external' || ex.supportsAddedWeight === true;
              const load = d <= 30 ? 15 : 22.5;
              const targetRir = ex.rir ?? 3;
              const res = await r.cmd(u, 'workout', {
                date, dayIndex: dayObj.dayIndex, exerciseId: ex.id,
                increment: isW ? (load <= 15 ? 2 : 2.5) : undefined,
                ...(ex.laterality === 'unilateral' ? { bothSides: true } : {}),
                sets: [
                  ...(d >= 31 ? [{ kg: isW ? Math.round(load * 0.5) : 0, reps: 10, setType: 'warmup' }] : []),
                  { kg: isW ? load : 0, reps: ex.repMax, rir: targetRir },
                  { kg: isW ? load : 0, reps: ex.repMax, rir: targetRir },
                  { kg: isW ? load : 0, reps: ex.repMax, rir: targetRir }
                ]
              }, now, {}, false, d < 86);
              if (d >= 86) {
                const updatedEx = res.workoutPlan.days.find(x => x.dayIndex === dayObj.dayIndex)?.exercises.find(e => e.id === ex.id);
                if (updatedEx?.suggestedKg) sawSub50Suggestion = true;
              }
            }
            await r.cmd(u, 'session', { date, dayIndex: dayObj.dayIndex, status: 'completed', duration: 45, rpe: 7 }, now, {}, false, true);
          }
        } else if (d === 50) {
          const anyExId = u.state.workoutPlan.days[0].exercises[0].id;
          await r.cmd(u, 'open_workout_session', { date, title: 'Hotel Upper', durationMin: 25, rpe: 6, exercises: [{ exerciseId: anyExId, sets: [{ kg: 20, reps: 12, rir: 2 }] }] }, now, {}, false, true);
        }
      }
      await r.refreshState(u, dayMs(90));
      const heatmap = await r.okJson(await r.call('/v1/workouts/muscle-status', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(90)));
      assert.equal(heatmap.muscles.length, Object.keys(MUSCLE_REGIONS).length);
      assert.ok(sawSub50Suggestion || u.state.workoutPlan.days.flatMap(d => d.exercises).some(e => e.suggestedKg));
      assert.equal(u.state.profile.workoutUiMode, 'pro');
      return { sawSub50Suggestion, muscleRegionsCount: heatmap.muscles.length };
    }));

// ======================= J04 (dedicated Miniflare) =======================
if (shouldRun('b4')) await withRuntime(rt => runJourney('J04', '[120d] Female + PCOS + 33d Cycle Retention Hold + Gentle Session + Recomp Diff', rt, async r => {
      const u = await r.createUser('Salma Fathy', 'dev-j04', {
        age: 27, weight: 69, height: 164, sex: 'female', goal: 'lose', targetWeight: 63,
        diseases: ['pcos'], dietType: 'low_carb', serviceTrack: 'nutrition_and_workouts',
        selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 150);
      await r.cmd(u, 'cycle_settings', { enabled: true, averageCycleLengthDays: 33, averagePeriodLengthDays: 5, lastPeriodStartDate: addDaysStr(u.localDate(dayMs(1)), -10), discreetMode: true }, dayMs(1));
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: u.headers, body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }) }, {}, dayMs(1)));
      let sawRetentionHold = false, overdueHandledWithoutModulo = false, gentleApplied = false;

      for (let d = 1; d <= 120; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(u, now);
        const date = u.localDate(now);
        const cycleState = await r.okJson(await r.call('/v1/cycle/state', { headers: u.headers }, {}, now));
        if (cycleState.isOverdue && cycleState.currentCycleDay > 33) {
          overdueHandledWithoutModulo = true;
          await r.cmd(u, 'cycle_log', { date, periodStart: true, flowLevel: 'medium', crampSeverity: 4, symptoms: ['cramps', 'fatigue'] }, now, {}, false, true);
          await r.cmd(u, 'cycle_gentle_session', { enabled: true }, now, {}, false, true);
          gentleApplied = true;
        }
        await r.cmd(u, 'weight', { date, kg: cycleState.waterRetentionLikely ? 70.4 : 69.0 }, now, {}, false, true);
        await r.logHealthyRecovery(u, date, now);
        await r.logPlannedFoodOrTotal(u, date, now);
        await r.cmd(u, 'water', { date, cups: 10 }, now, {}, false, true);
        await r.performScheduledWorkoutIfAny(u, date, now, d > 40 ? 45 : 30, 12);
        if (d === 5 || d === 65) await r.cmd(u, 'body_measurement', { date, waistCm: d === 5 ? 81 : 77, hipsCm: 100, neckCm: 33 }, now, {}, false, true);
        if (d % 7 === 0) {
          await r.cmd(u, 'review', {}, now);
          if (u.state.lastReview?.nutrition?.reasonCode === 'CYCLE_RETENTION_HOLD') sawRetentionHold = true;
        }
        if ([1, 7, 14, 25, 30, 55, 60, 85, 90].includes(d)) {
          await r.captureDayTranscript(`J04-d${d}`, 'Persona #4: Female PCOS + 33d Cycle', u, d, now, [25, 55, 85].includes(d));
        }
      }
      await r.db.batch([
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j04_ph1', u.localDate(dayMs(5)), 'front', `photos/${u.userId}/p1.jpg`, 69, new Date(dayMs(5)).toISOString()),
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j04_ph2', u.localDate(dayMs(65)), 'front', `photos/${u.userId}/p2.jpg`, 69, new Date(dayMs(65)).toISOString())
      ]);
      const diff = await r.okJson(await r.call('/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'j04_ph1', afterPhotoId: 'j04_ph2', pose: 'front' }) }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(70)), 201);
      assert.equal(diff.recompositionDetected, true);
      const widget = await r.okJson(await r.call('/v1/widgets/snapshot', { headers: u.headers }, {}, dayMs(100)));
      assert.equal(widget.cycleState, undefined);
      const lcPush = formatPushNotification('proactive_lifecycle_adjusted', { locale: 'en', userName: 'Salma Fathy' });
      assert.ok(!/menstrual|period|cycle|cramp/i.test(lcPush.body));
      assert.ok(sawRetentionHold && overdueHandledWithoutModulo && gentleApplied);
      return { sawRetentionHold, overdueHandledWithoutModulo, recompositionDetected: diff.recompositionDetected };
    }));

// ======================= J05 (dedicated Miniflare) =======================
if (shouldRun('b5')) await withRuntime(rt => runJourney('J05', '[180d] Pregnancy T1 -> T2 -> T3 -> Breastfeeding', rt, async r => {
      const u = await r.createUser('Heba Youssef', 'dev-j05', {
        age: 29, weight: 64, height: 163, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t1',
        dietType: 'balanced', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 2, 4], healthConfirmed: true
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 200);
      await r.cmd(u, 'cycle_settings', { enabled: true, averageCycleLengthDays: 28, averagePeriodLengthDays: 5, lastPeriodStartDate: addDaysStr(u.localDate(dayMs(1)), -35) }, dayMs(1));
      const cyc1 = await r.okJson(await r.call('/v1/cycle/state', { headers: u.headers }, {}, dayMs(1)));
      assert.equal(cyc1.pausedReason, 'pregnancy');
      await r.errJson(await r.cmd(u, 'generate', { age: 29, weight: 64, height: 163, sex: 'female', goal: 'lose', targetWeight: 59, maternalStatus: 'pregnant_t1', dietType: 'balanced', serviceTrack: 'nutrition_only' }, dayMs(2), {}, true), 422, 'MATERNAL_CALORIE_CUT_BLOCKED');
      await r.errJson(await r.cmd(u, 'generate', { age: 29, weight: 64, height: 163, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t1', dietType: 'keto', serviceTrack: 'nutrition_only' }, dayMs(2), {}, true), 400, 'MEDICAL_DIET_CONFLICT');
      const kcalByStage = { t1: u.state.plans[0].targets.energy };
      for (const [d, status, kg] of [[45, 'pregnant_t2', 67], [105, 'pregnant_t3', 72], [155, 'breastfeeding', 69]]) {
        await r.cmd(u, 'generate', { age: 29, weight: kg, height: 163, sex: 'female', goal: status === 'breastfeeding' ? 'lose' : 'maintain', ...(status === 'breastfeeding' ? { targetWeight: 62 } : {}), maternalStatus: status, dietType: 'balanced', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 2, 4], healthConfirmed: true }, dayMs(d));
        kcalByStage[status] = u.state.plans.find(p => p.id === u.state.active_plan_id).targets.energy;
      }
      assert.ok(kcalByStage.pregnant_t3 > kcalByStage.pregnant_t2 && kcalByStage.pregnant_t2 > kcalByStage.t1);
      await r.cmd(u, 'generate', { age: 29, weight: 72, height: 163, sex: 'female', goal: 'maintain', maternalStatus: 'pregnant_t3', dietType: 'balanced', serviceTrack: 'nutrition_only' }, dayMs(160));
      const analytics = await r.okJson(await r.call('/v1/progress/analytics?range=90d', { headers: u.headers }, {}, dayMs(161)));
      assert.equal(analytics.estimatedWeeksRemaining, null);
      assert.equal(analytics.weightLossTrajectoryHidden, true);
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: u.headers, body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }) }, {}, dayMs(161)));
      await r.db.batch([
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j05_p1', u.localDate(dayMs(5)), 'side', `photos/${u.userId}/p1.jpg`, 64, new Date(dayMs(5)).toISOString()),
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j05_p2', u.localDate(dayMs(160)), 'side', `photos/${u.userId}/p2.jpg`, 72, new Date(dayMs(160)).toISOString())
      ]);
      const matDiff = await r.okJson(await r.call('/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'j05_p1', afterPhotoId: 'j05_p2', pose: 'side' }) }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(162)), 201);
      assert.equal(matDiff.clinicalMode, 'maternity_timeline');
      return { kcalByStage };
    }));

// ======================= BATCH 6A: J06 - J08 =======================
if (shouldRun('b6a')) {
  const rt = await createRuntime();
  try {
    await runJourney('J06', '[90d] Senior 72yo + CKD + Gout + IBS Clinical Guardrails', rt, async r => {
      const u = await r.createUser('Mahmoud Senior', 'dev-j06', null, dayMs(1));
      await r.errJson(await r.cmd(u, 'generate', { age: 72, weight: 76, height: 170, sex: 'male', goal: 'lose', diseases: ['kidney', 'gout', 'ibs'], serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1), {}, true), 422, 'MULTI_CONDITION_CLINICAL_REVIEW');
      await r.errJson(await r.cmd(u, 'generate', { age: 72, weight: 76, height: 170, sex: 'male', goal: 'lose', injuries: ['knee', 'lower_back', 'shoulder', 'wrist'], serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1), {}, true), 422, 'MULTI_INJURY_REQUIRES_REVIEW');
      await r.cmd(u, 'generate', { age: 72, weight: 76, height: 170, sex: 'male', goal: 'lose', targetWeight: 72, diseases: ['kidney', 'gout'], injuries: ['knee', 'lower_back'], serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      const plan = u.state.plans.find(p => p.id === u.state.active_plan_id);
      assert.ok(plan.targets.protein <= 76 * 1.1 + 1.5);
      for (const day of plan.days) assert.ok(Number(day.summary.values.sodium) <= 2000);
      const wTarget = await r.okJson(await r.call('/v1/widgets/snapshot', { headers: u.headers }, {}, dayMs(2)));
      assert.ok(wTarget.waterTargetCups * 0.25 <= 2.5);
      const dining = await r.okJson(await r.call('/v1/nutrition/dining-out-options?category=seafood', { headers: u.headers }, {}, dayMs(2)));
      for (const opt of dining.options) assert.ok(opt.sodiumMg <= 650 && opt.proteinG <= 42 && !/salmon|shrimp|tuna|liver/i.test(opt.nameEn));
      return { seniorWaterL: wTarget.waterTargetCups * 0.25, planSodiumD0: plan.days[0].summary.values.sodium };
    });

    await runJourney('J07', '[60d] Ramadan 30d + Eid Flex 3d + IF 14:10 + Cairo->Riyadh->London Travel', rt, async r => {
      const u = await r.createUser('Yasser Ibrahim', 'dev-j07', {
        age: 34, weight: 82, height: 177, sex: 'male', goal: 'lose', targetWeight: 76,
        dietType: 'intermittent_fasting', ifPreset: '14_10', eatingStart: '11:00',
        region: 'egypt', timezone: 'Africa/Cairo', locale: 'ar-EG',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 2, 4], healthConfirmed: true
      }, dayMs(1));
      await r.cmd(u, 'notification_preferences', { mealReminders: true, waterReminder: true, ramadanSuhoorReminder: true, exemptSuhoorFromQuietHours: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' }, dayMs(1));
      await r.okJson(await r.call('/v1/devices/push-token', { method: 'POST', headers: u.headers, body: JSON.stringify({ deviceId: 'dev-j07', platform: 'android', token: 'tok-j07-123456', timezone: 'Africa/Cairo', locale: 'ar-EG' }) }, {}, dayMs(1)));
      const ramadanEnd = addDaysStr(u.localDate(dayMs(1)), 29);
      await r.cmd(u, 'ramadan_mode', { enabled: true, iftarTime: '18:05', suhoorCutoffTime: '04:20', workoutTiming: 'post_iftar', endDate: ramadanEnd }, dayMs(1));
      assert.equal(isFastingFoodHydrationSuppressed(u.state, '13:00', u.localDate(dayMs(2)), dayMs(2, 11)), true);
      const suhoorRes = await runScheduledNotifications({ DB: r.db }, dayMs(2, 1));
      assert.ok(suhoorRes.queued >= 1);

      for (let d = 1; d <= 30; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(u, now);
        const date = u.localDate(now);
        if (d === 15) await r.cmd(u, 'timezone', { timezone: 'Asia/Riyadh' }, now);
        if (d === 25) await r.cmd(u, 'timezone', { timezone: 'Europe/London' }, now);
        await r.logHealthyRecovery(u, date, now);
        await r.cmd(u, 'food', { date, energy: 2100, complete: true }, now, {}, false, true);
        await r.cmd(u, 'water', { date, cups: 10 }, now, {}, false, true);
        if ([1, 7, 14, 25, 30].includes(d)) await r.captureDayTranscript(`J07-d${d}`, 'Persona #7: Ramadan + IF 14:10 + Travel', u, d, now, d === 25);
      }
      const ramBadges = await r.okJson(await r.call('/v1/badges', { headers: u.headers }, {}, dayMs(30)));
      const ramMed = ramBadges.visibleBadges.find(b => b.badgeId === 'RAMADAN_MINDFUL_MONTH');
      assert.ok(ramMed && ramMed.progressCurrent === 30 && ramMed.currentTier === 'gold');
      await r.cmd(u, 'seasonal_flex', { enabled: true, occasion: 'eid_fitr', endDate: addDaysStr(u.localDate(dayMs(31)), 2) }, dayMs(31));
      const fastPost = await r.okJson(await r.call('/v1/nutrition/fasting-state', { headers: u.headers }, {}, dayMs(31)));
      assert.equal(fastPost.ramadanMode.enabled, false);
      assert.equal(fastPost.seasonalContext.mode, 'eid_flex');
      await r.cmd(u, 'seasonal_flex', { enabled: false, dismissEidPrompt: true }, dayMs(34));
      await r.cmd(u, 'ramadan_mode', { enabled: false }, dayMs(34));
      const postIf = await r.okJson(await r.call('/v1/nutrition/fasting-state', { headers: u.headers }, {}, dayMs(35)));
      assert.equal(postIf.mode, 'if_14_10');
      await r.captureDayTranscript(`J07-d55-impact`, 'Persona #7: Ramadan + IF 14:10 + Travel', u, 55, dayMs(55), true);
      await r.captureDayTranscript(`J07-d60`, 'Persona #7: Ramadan + IF 14:10 + Travel', u, 60, dayMs(60), false);
      return { ramadanBadgeTier: ramMed.currentTier, restoredIfMode: postIf.mode, finalTz: u.state.profile.timezone };
    });

    await runJourney('J08', '[90d] Red-Flag Stop + Mid-Journey Injury + 16d Absence + Comeback Tier 3', rt, async r => {
      const u = await r.createUser('Karim RedFlag', 'dev-j08', { age: 33, weight: 84, height: 178, sex: 'male', goal: 'lose', targetWeight: 77, serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      for (let d = 1; d <= 15; d++) {
        const now = dayMs(d);
        const date = u.localDate(now);
        await r.logHealthyRecovery(u, date, now);
        await r.logPlannedFoodOrTotal(u, date, now);
        await r.cmd(u, 'water', { date, cups: 10 }, now, {}, false, true);
        await r.performScheduledWorkoutIfAny(u, date, now, 60, 10);
      }
      const stopState = await r.logHealthyRecovery(u, u.localDate(dayMs(16)), dayMs(16), {}, { redFlags: true, pain: true, painRegions: ['quadriceps', 'lower_back'] }, false);
      assert.equal(stopState.recovery.status, 'stop');
      await r.errJson(await r.call('/v1/workouts/session-override-today', { method: 'POST', headers: u.headers, body: JSON.stringify({ mode: 'bodyweight_hotel', durationMin: 20 }) }, {}, dayMs(16)), 403, 'RED_FLAG_STOP_ACTIVE');
      await r.cmd(u, 'generate', { age: 33, weight: 84, height: 178, sex: 'male', goal: 'lose', targetWeight: 77, injuries: ['knee', 'lower_back'], serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(17));
      assert.equal(u.state.workoutSafetyIssues.length, 0);
      await r.refreshState(u, dayMs(17));
      const checkinsBefore = (u.state.checkins || []).length;
      const comeback = await r.cmd(u, 'comeback_restart', { mode: '7d_ramp', acceptDeload: true, reason: 'recovered_from_injury' }, dayMs(34));
      assert.equal(comeback.sessionAdjustment.setFactor, 0.8);
      assert.equal(comeback.sessionAdjustment.multiDay, true);
      assert.equal((comeback.checkins || []).length, checkinsBefore);
      const badges = await r.okJson(await r.call('/v1/badges', { headers: u.headers }, {}, dayMs(35)));
      const cbBadge = badges.visibleBadges.find(b => b.badgeId === 'COMEBACK_RESILIENT');
      assert.ok(cbBadge && cbBadge.progressCurrent === 1 && cbBadge.currentTier === 'bronze');
      return { comebackProgressCount: cbBadge.progressCurrent };
    });
  } finally {
    await rt.mf.dispose();
  }
}

// ======================= BATCH 6B: J09 - J10 =======================
if (shouldRun('b6b')) {
  const rt = await createRuntime();
  try {
    await runJourney('J09', '[90d] Free -> Pro -> Fair-Use 429 -> Pro Impact -> Pause 14d -> Downgrade', rt, async r => {
      const u = await r.createUser('Mariam Value', 'dev-j09', { age: 28, weight: 65, height: 164, sex: 'female', goal: 'lose', targetWeight: 59, serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: u.headers, body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }) }, {}, dayMs(1)));
      for (const d of [8, 15, 22]) await r.cmd(u, 'renew_plan', {}, dayMs(d), { ENFORCE_PRO_ENTITLEMENTS: 'true' });
      await r.captureDayTranscript('J09-d1', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 1, dayMs(1), false);
      await r.captureDayTranscript('J09-d7', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 7, dayMs(7), false);
      await r.captureDayTranscript('J09-d14', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 14, dayMs(14), false);

      await r.grantPro(u.userId, dayMs(24), 45);
      await r.db.batch([
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j09_p1', u.localDate(dayMs(2)), 'front', `photos/${u.userId}/p1.jpg`, 65, new Date(dayMs(2)).toISOString()),
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j09_p2', u.localDate(dayMs(24)), 'front', `photos/${u.userId}/p2.jpg`, 63, new Date(dayMs(24)).toISOString())
      ]);
      for (let i = 0; i < 4; i++) {
        await r.okJson(await r.call('/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'j09_p1', afterPhotoId: 'j09_p2', pose: 'front' }) }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(25)), 201);
      }
      await r.errJson(await r.call('/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'j09_p1', afterPhotoId: 'j09_p2', pose: 'front' }) }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(25)), 429, 'FAIR_USE_LIMIT_REACHED');
      await r.captureDayTranscript('J09-d25-impact', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 25, dayMs(25), true);
      await r.captureDayTranscript('J09-d30', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 30, dayMs(30), false);

      const pauseRes = await r.okJson(await r.call('/v1/subscriptions/retention-intent', { method: 'POST', headers: u.headers, body: JSON.stringify({ intent: 'pause_14d', reasonCode: 'busy_schedule' }) }, {}, dayMs(40)));
      u.rev = pauseRes.revision;
      assert.equal(pauseRes.coachingPaused, true);
      assert.equal(pauseRes.billingDisclosureCode, 'STORE_BILLING_MANAGED_BY_PLATFORM');
      await r.captureDayTranscript('J09-d55-impact', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 55, dayMs(55), true);
      await r.captureDayTranscript('J09-d60', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 60, dayMs(60), false);

      await r.revokePro(u.userId, dayMs(75));
      const analyses = await r.okJson(await r.call('/v1/progress/photos/analyses', { headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(75)));
      assert.equal(analyses.total, 4);
      await r.okJson(await r.call(`/v1/progress/photos/analyses/${analyses.items[0].analysisId}`, { method: 'DELETE', headers: u.headers }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(75)));
      await r.captureDayTranscript('J09-d85-impact', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 85, dayMs(85), true);
      await r.captureDayTranscript('J09-d90', 'Persona #5: Free -> Pro -> Pause -> Downgrade', u, 90, dayMs(90), false);
      return { freeRenewalsOk: true, fairUseCapped: true, nonHostageOk: true };
    });

    await runJourney('J10', '[45d] Cross-Track Friend Challenge + Public Challenge + Zero-PII Circle', rt, async r => {
      const fUser = await r.createUser('Aya Slim', 'dev-j10-f', { age: 25, weight: 55, height: 162, sex: 'female', goal: 'maintain', serviceTrack: 'nutrition_only' }, dayMs(1));
      const mUser = await r.createUser('Ziad Heavy', 'dev-j10-m', { age: 30, weight: 95, height: 185, sex: 'male', goal: 'lose', targetWeight: 88, serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      const fc = await r.okJson(await r.call('/v1/challenges/friends', { method: 'POST', headers: fUser.headers, body: JSON.stringify({ title: 'Fair Consistency', metricType: 'all_round', durationDays: 14 }) }, {}, dayMs(1)), 201);
      await r.okJson(await r.call('/v1/challenges/friends/join', { method: 'POST', headers: mUser.headers, body: JSON.stringify({ inviteCode: fc.inviteCode }) }, {}, dayMs(1)));
      await r.okJson(await r.call('/v1/challenges/chg_hydration_7d/join', { method: 'POST', headers: fUser.headers, body: JSON.stringify({ pin: true }) }, {}, dayMs(1)), 201);
      const circle = await r.okJson(await r.call('/v1/circles', { method: 'POST', headers: fUser.headers, body: JSON.stringify({ name: 'Team ZeroPII' }) }, {}, dayMs(1)), 201);
      await r.okJson(await r.call('/v1/circles/join', { method: 'POST', headers: mUser.headers, body: JSON.stringify({ inviteCode: circle.inviteCode }) }, {}, dayMs(1)));

      for (let d = 1; d <= 14; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(fUser, now);
        await r.renewIfNeeded(mUser, now);
        const dtF = fUser.localDate(now), dtM = mUser.localDate(now);
        await r.logHealthyRecovery(fUser, dtF, now);
        await r.logHealthyRecovery(mUser, dtM, now);
        await r.logPlannedFoodOrTotal(fUser, dtF, now);
        await r.logPlannedFoodOrTotal(mUser, dtM, now);
        await r.cmd(fUser, 'water', { date: dtF, cups: 10 }, now, {}, false, true);
        await r.cmd(mUser, 'water', { date: dtM, cups: 14 }, now, {}, false, true);
        await r.performScheduledWorkoutIfAny(mUser, dtM, now, 70, 10);
      }
      const fcDet = await r.okJson(await r.call(`/v1/challenges/friends/${fc.id}`, { headers: fUser.headers }, {}, dayMs(15)));
      assert.equal(fcDet.members.length, 2);
      assert.ok(fcDet.members.every(m => m.normalizedScorePct >= 80 && m.normalizedScorePct <= 100));
      assert.ok(!JSON.stringify(fcDet.members).match(/"(weight|calories|bmi|diseases|injuries)"/));
      for (let i = 0; i < 3; i++) {
        await r.okJson(await r.call(`/v1/challenges/friends/${fc.id}/cheer`, { method: 'POST', headers: fUser.headers, body: JSON.stringify({ targetUserId: mUser.userId, reactionCode: 'cheer' }) }, {}, dayMs(15)));
      }
      await r.errJson(await r.call(`/v1/challenges/friends/${fc.id}/cheer`, { method: 'POST', headers: fUser.headers, body: JSON.stringify({ targetUserId: mUser.userId, reactionCode: 'clap' }) }, {}, dayMs(15)), 429, 'CHEER_RATE_LIMITED');
      const fBadges = await r.okJson(await r.call('/v1/badges', { headers: fUser.headers }, {}, dayMs(16)));
      const fcBadge = fBadges.visibleBadges.find(b => b.badgeId === 'FRIEND_CHALLENGE_CHAMPION');
      assert.equal(fcBadge.currentTier, 'bronze');
      await r.okJson(await r.call(`/v1/challenges/friends/${fc.id}/block`, { method: 'POST', headers: fUser.headers, body: JSON.stringify({ targetUserId: mUser.userId }) }, {}, dayMs(17)));
      await r.okJson(await r.call(`/v1/challenges/friends/${fc.id}/leave`, { method: 'POST', headers: fUser.headers, body: '{}' }, {}, dayMs(18)));
      return { scores: fcDet.members.map(m => m.normalizedScorePct), friendChampionTier: fcBadge.currentTier };
    });
  } finally {
    await rt.mf.dispose();
  }
}

// ======================= BATCH 7: J11 - J15 =======================
if (shouldRun('b7')) {
  const rt = await createRuntime();
  try {
    await runJourney('J11', '[30d] Offline Sync Chaos + 409 Conflict + Duplicate Idempotency + Midnight Crossing', rt, async r => {
      const u = await r.createUser('Hany Sync', 'dev-j11-a', { age: 29, weight: 78, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      const idempKey = `idem-water-${crypto.randomUUID()}`;
      const d1 = u.localDate(dayMs(1));
      const r1 = await r.okJson(await r.call('/v1/commands', { method: 'POST', headers: { ...u.headers, 'Idempotency-Key': idempKey }, body: JSON.stringify({ revision: u.rev, action: 'water', payload: { date: d1, cups: 6 } }) }, {}, dayMs(1)));
      const r2 = await r.okJson(await r.call('/v1/commands', { method: 'POST', headers: { ...u.headers, 'Idempotency-Key': idempKey }, body: JSON.stringify({ revision: u.rev, action: 'water', payload: { date: d1, cups: 6 } }) }, {}, dayMs(1)));
      u.rev = r1.revision;
      assert.equal(r1.revision, r2.revision);
      await r.errJson(await r.call('/v1/commands', { method: 'POST', headers: { ...u.headers, 'Idempotency-Key': `stale-${crypto.randomUUID()}` }, body: JSON.stringify({ revision: u.rev - 1, action: 'water', payload: { date: d1, cups: 8 } }) }, {}, dayMs(1)), 409, 'REVISION_CONFLICT');
      const preMidnight = Date.parse('2026-11-05T21:55:00Z'), postMidnight = Date.parse('2026-11-05T22:05:00Z');
      await r.cmd(u, 'food', { date: '2026-11-05', energy: 1900, complete: true }, preMidnight, {}, false, true);
      await r.cmd(u, 'food', { date: '2026-11-06', energy: 2050, complete: true }, postMidnight, {}, false, false);
      assert.equal(u.state.foodLogs.filter(f => f.date === '2026-11-05' || f.date === '2026-11-06').length, 2);
      return { idempotentRev: r1.revision, midnightDatesClean: true };
    });

    await runJourney('J12', '[Lifecycle] Abuse Guards, Full GDPR Export & 2nd Referred-User Delete Safety', rt, async r => {
      const refHost = await r.createUser('Host Ref', 'dev-j12-host', { age: 30, weight: 78, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' }, dayMs(1));
      const maleCycle = await r.createUser('Male Abuse', 'dev-j12-m', { age: 30, weight: 80, height: 175, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' }, dayMs(1));
      const mRef2 = await r.createUser('Second Referred', 'dev-j12-r2', { age: 26, weight: 65, height: 168, sex: 'female', goal: 'maintain', serviceTrack: 'nutrition_only' }, dayMs(1));
      await r.errJson(await r.cmd(maleCycle, 'cycle_log', { periodStart: true, flowLevel: 'medium' }, dayMs(1), {}, true), 403, 'CYCLE_TRACKING_UNAVAILABLE');
      const rc = await r.okJson(await r.call('/v1/referrals/code', { headers: refHost.headers }, {}, dayMs(1)));
      await r.errJson(await r.call('/v1/referrals/redeem', { method: 'POST', headers: refHost.headers, body: JSON.stringify({ code: rc.code, deviceId: 'dev-j12-host' }) }, {}, dayMs(1)), 409, 'REFERRAL_INELIGIBLE');
      await r.okJson(await r.call('/v1/referrals/redeem', { method: 'POST', headers: maleCycle.headers, body: JSON.stringify({ code: rc.code, deviceId: 'dev-j12-uniq-1' }) }, {}, dayMs(1)));
      await r.okJson(await r.call('/v1/referrals/redeem', { method: 'POST', headers: mRef2.headers, body: JSON.stringify({ code: rc.code, deviceId: 'dev-j12-uniq-2' }) }, {}, dayMs(1)));
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: maleCycle.headers, body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0', accepted: false }) }, {}, dayMs(2)));
      await r.errJson(await r.cmd(maleCycle, 'renew_plan', {}, dayMs(2), {}, true), 403, 'HEALTH_CONSENT_REQUIRED');
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: maleCycle.headers, body: JSON.stringify({ consentType: 'health_data_processing', version: '1.0', accepted: true }) }, {}, dayMs(2)));
      const exp1 = await r.okJson(await r.call('/v1/account/export', { headers: maleCycle.headers }, {}, dayMs(2)));
      assert.ok(Array.isArray(exp1.referrals?.redemptions));
      await r.okJson(await r.call('/v1/account/delete', { method: 'POST', headers: maleCycle.headers, body: JSON.stringify({ confirm: true }) }, {}, dayMs(2)));
      await r.okJson(await r.call('/v1/account/delete', { method: 'POST', headers: mRef2.headers, body: JSON.stringify({ confirm: true }) }, {}, dayMs(2)));
      return { secondReferredUserDeletedCleanly: true };
    });

    await runJourney('J13', '[90d] Vegan + Low Budget in Egypt & Maghreb', rt, async r => {
      const uEg = await r.createUser('Lina Vegan EG', 'dev-j13-eg', { age: 26, weight: 62, height: 165, sex: 'female', goal: 'maintain', dietType: 'vegan', budget: 'low', region: 'egypt', serviceTrack: 'nutrition_only' }, dayMs(1));
      const uMa = await r.createUser('Youssef Vegan MA', 'dev-j13-ma', { age: 29, weight: 74, height: 175, sex: 'male', goal: 'maintain', dietType: 'vegan', budget: 'low', region: 'maghreb', serviceTrack: 'nutrition_only' }, dayMs(1));
      for (let w = 1; w <= 12; w++) {
        await r.cmd(uEg, 'renew_plan', {}, dayMs(w * 7 + 1));
        await r.cmd(uMa, 'renew_plan', {}, dayMs(w * 7 + 1));
      }
      const pEg = uEg.state.plans.find(p => p.id === uEg.state.active_plan_id);
      const pMa = uMa.state.plans.find(p => p.id === uMa.state.active_plan_id);
      assert.ok(pEg.days[0].summary.values.protein >= pEg.targets.protein * 0.8);
      assert.ok(pMa.days[0].summary.values.protein >= pMa.targets.protein * 0.8);
      return { egProtein: pEg.days[0].summary.values.protein, maProtein: pMa.days[0].summary.values.protein };
    });

    await runJourney('J14', '[90d] Keto + Low Budget + Gulf Heat Hydration (+500ml keto + 200ml heat)', rt, async r => {
      const u = await r.createUser('Fahad Keto', 'dev-j14', { age: 35, weight: 86, height: 177, sex: 'male', goal: 'lose', targetWeight: 78, dietType: 'keto', budget: 'low', region: 'gulf', timezone: 'Asia/Riyadh', serviceTrack: 'nutrition_only' }, dayMs(1));
      for (let w = 1; w <= 12; w++) await r.cmd(u, 'renew_plan', {}, dayMs(w * 7 + 1));
      const plan = u.state.plans.find(p => p.id === u.state.active_plan_id);
      for (const d of plan.days) assert.ok(Number(d.summary.values.carbs) <= 50);
      const wTarget = await r.okJson(await r.call('/v1/widgets/snapshot', { headers: u.headers }, {}, dayMs(90)));
      assert.ok(u.state.progressSummary.hydration.guidanceCodes.includes('KETO_HYDRATION_BONUS'));
      assert.ok(u.state.progressSummary.hydration.guidanceCodes.includes('WARM_CLIMATE_HYDRATION_BONUS'));
      return { waterCups: wTarget.waterTargetCups };
    });

    await runJourney('J15', '[90d] Diabetes T1, T2 & Insulin Resistance Glycemic Guardrails', rt, async r => {
      const uT1 = await r.createUser('Omar T1', 'dev-j15-t1', { age: 25, weight: 74, height: 176, sex: 'male', goal: 'maintain', diseases: ['diabetes_t1'], dietType: 'balanced', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(1));
      const uIr = await r.createUser('Mona IR', 'dev-j15-ir', { age: 32, weight: 72, height: 164, sex: 'female', goal: 'lose', targetWeight: 65, diseases: ['insulin_resistance'], dietType: 'balanced', serviceTrack: 'nutrition_only' }, dayMs(1));
      await r.errJson(await r.cmd(uT1, 'generate', { age: 25, weight: 74, height: 176, sex: 'male', goal: 'maintain', diseases: ['diabetes_t1'], dietType: 'keto', serviceTrack: 'nutrition_only' }, dayMs(1), {}, true), 400, 'MEDICAL_DIET_CONFLICT');
      const dOut = await r.okJson(await r.call('/v1/nutrition/dining-out-options?category=pizza', { headers: uIr.headers }, {}, dayMs(2)));
      assert.ok(dOut.options.every(o => o.carbsG <= 52));
      return { t1CarbRatio: Math.round((uT1.state.plans[0].targets.carbs * 4) / uT1.state.plans[0].targets.energy * 100), irDiningMaxCarbs: Math.max(...dOut.options.map(o => o.carbsG)) };
    });
  } finally {
    await rt.mf.dispose();
  }
}

// ======================= BATCH 8: J16 - J25 =======================
if (shouldRun('b8')) {
  const rt = await createRuntime();
  try {
    await runJourney('J16', '[180d] Advanced Muscle Gain (6d, 100-180kg, Carb Cycling Steady Weekly Avg)', rt, async r => {
      const u = await r.createUser('Ramy Mass', 'dev-j16', {
        age: 27, weight: 92, height: 182, sex: 'male', goal: 'muscle_gain', targetWeight: 98,
        fitnessLevel: 'advanced', workoutLocation: 'gym_only', sessionDuration: 60, carbCycling: true,
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 1, 2, 4, 5, 6], healthConfirmed: true
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 200);
      const plan = u.state.plans.find(p => p.id === u.state.active_plan_id);
      const wkAvg = plan.days.reduce((s, d) => s + Number(d.targets.energy), 0) / 7;
      const pctDrift = Math.abs(wkAvg - plan.targets.energy) / plan.targets.energy;
      assert.ok(pctDrift <= 0.02, `Carb cycling weekly avg drifted ${Math.round(pctDrift * 1000) / 10}%`);
      await r.cmd(u, 'recovery', { date: u.localDate(dayMs(20)), sleepHours: 5.5, sleepQuality: 2, fatigue: 5, stress: 4, soreness: 6, pain: false, illness: false, redFlags: false }, dayMs(20));
      await r.cmd(u, 'review', {}, dayMs(20));
      const recAdapt = u.state.adaptations?.find(a => a.status === 'pending' && a.kind === 'recovery');
      assert.ok(recAdapt);
      return { weeklyAvgEnergy: Math.round(wkAvg), baseTarget: plan.targets.energy, driftPct: Math.round(pctDrift * 1000) / 10 };
    });

    await runJourney('J17', '[90d] Underweight (BMI 17.2, gain, 5 meals) -> Block Lose & Wellness-Only Diff', rt, async r => {
      const u = await r.createUser('Nada Petite', 'dev-j17', { age: 23, weight: 49, height: 169, sex: 'female', goal: 'gain', targetWeight: 55, mealsCount: 5, serviceTrack: 'nutrition_only' }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 120);
      await r.errJson(await r.cmd(u, 'generate', { age: 23, weight: 49, height: 169, sex: 'female', goal: 'lose', targetWeight: 46, serviceTrack: 'nutrition_only' }, dayMs(1), {}, true), 400, 'WEIGHT_LOSS_UNDERWEIGHT_UNSAFE');
      await r.okJson(await r.call('/v1/account/consents', { method: 'POST', headers: u.headers, body: JSON.stringify({ consentType: 'visual_progress_analysis', version: '1.0', accepted: true }) }, {}, dayMs(2)));
      await r.db.batch([
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j17_p1', u.localDate(dayMs(2)), 'front', `photos/${u.userId}/p1.jpg`, 49, new Date(dayMs(2)).toISOString()),
        r.db.prepare('INSERT INTO coaching_progress_photos(user_id,photo_id,date,pose,r2_object_key,weight_kg_snapshot,created_at) VALUES(?,?,?,?,?,?,?)').bind(u.userId, 'j17_p2', u.localDate(dayMs(35)), 'front', `photos/${u.userId}/p2.jpg`, 51, new Date(dayMs(35)).toISOString())
      ]);
      const diff = await r.okJson(await r.call('/v1/progress/photos/analyze-diff', { method: 'POST', headers: u.headers, body: JSON.stringify({ beforePhotoId: 'j17_p1', afterPhotoId: 'j17_p2', pose: 'front' }) }, { ENFORCE_PRO_ENTITLEMENTS: 'true' }, dayMs(36)), 201);
      assert.equal(diff.clinicalMode, 'wellness_only');
      return { clinicalMode: diff.clinicalMode, planKcal: u.state.plans[0].targets.energy };
    });

    await runJourney('J18', '[120d] Severe Obesity (BMI 41, 135kg, knee+back, Home 20min, ABW Water)', rt, async r => {
      const u = await r.createUser('Samy Heavy', 'dev-j18', {
        age: 38, weight: 135, height: 181, sex: 'male', goal: 'lose', targetWeight: 105,
        injuries: ['knee', 'lower_back'], workoutLocation: 'home_only', homeEquipment: ['none'], sessionDuration: 20,
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
      }, dayMs(1));
      const wL = u.state.progressSummary.hydration.targetLiters;
      assert.ok(wL < 4.5);
      assert.equal(u.state.workoutSafetyIssues.length, 0);
      for (const d of u.state.workoutPlan.days) assert.ok(d.exercises.length >= 2 && d.exercises.length <= 4);
      return { abwWaterL: wL, exercisesPerDay: u.state.workoutPlan.days[0].exercises.length };
    });

    await runJourney('J19', '[90d] Irregular Weekend Warrior (4d on / 3d off) -> Coverage Hold & Auto-Freeze', rt, async r => {
      const u = await r.createUser('Amr Weekend', 'dev-j19', { age: 30, weight: 82, height: 176, sex: 'male', goal: 'lose', targetWeight: 76, serviceTrack: 'nutrition_only' }, dayMs(1));
      const initE = u.state.plans[0].targets.energy;
      for (let d = 1; d <= 21; d++) {
        const now = dayMs(d);
        await r.renewIfNeeded(u, now);
        if (d % 7 >= 1 && d % 7 <= 4) {
          await r.logPlannedFoodOrTotal(u, u.localDate(now), now);
          await r.cmd(u, 'water', { date: u.localDate(now), cups: 10 }, now, {}, false, true);
        }
      }
      await r.cmd(u, 'review', {}, dayMs(21));
      assert.equal(u.state.lastReview.nutrition.reasonCode, 'INSUFFICIENT_EVIDENCE_COVERAGE');
      assert.equal(u.state.plans.find(p => p.id === u.state.active_plan_id).targets.energy, initE);
      return { reasonCode: u.state.lastReview.nutrition.reasonCode };
    });

    await runJourney('J20', '[90d] Track Switcher (nutrition_only -> both -> workouts_only -> both)', rt, async r => {
      const u = await r.createUser('Nour Switch', 'dev-j20', { age: 28, weight: 70, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_only' }, dayMs(1));
      await r.logPlannedFoodOrTotal(u, u.localDate(dayMs(1)), dayMs(1));
      await r.cmd(u, 'generate', { age: 28, weight: 70, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(15));
      await r.performScheduledWorkoutIfAny(u, u.localDate(dayMs(16)), dayMs(16), 40, 10);
      await r.cmd(u, 'generate', { age: 28, weight: 70, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'workouts_only', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(30));
      const wBadges = await r.okJson(await r.call('/v1/badges', { headers: u.headers }, {}, dayMs(30)));
      assert.ok(!wBadges.visibleBadges.some(b => b.badgeId === 'NUTRITION_PRECISION_85'));
      await r.cmd(u, 'generate', { age: 28, weight: 70, height: 170, sex: 'male', goal: 'maintain', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true }, dayMs(45));
      assert.ok(u.state.foodLogs.length >= 1 && u.state.workoutLogs.length >= 1);
      return { preservedFoodLogs: u.state.foodLogs.length, preservedWorkoutLogs: u.state.workoutLogs.length };
    });

    await runJourney('J21', '[60d] Imperial Units (lb/in) + English + Levant & Maghreb', rt, async r => {
      const u = await r.createUser('Kareem Levant', 'dev-j21', {
        age: 31, weight: 80, height: 178, sex: 'male', goal: 'lose', targetWeight: 74,
        unitSystem: 'imperial', region: 'levant', locale: 'en-US', timezone: 'Asia/Amman',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 2, 4], healthConfirmed: true
      }, dayMs(1));
      assert.equal(u.state.profile.unitSystem, 'imperial');
      assert.equal(u.state.profile.locale, 'en');
      assert.equal(u.state.preferences.region, 'levant');
      const enPush = formatPushNotification('daily_checkin_reminder', { locale: 'en', userName: 'Kareem Levant' });
      assert.ok(enPush.body.startsWith('Kareem, ') && !ARABIC_RE.test(enPush.body));
      return { unitSystem: u.state.profile.unitSystem, locale: u.state.profile.locale };
    });

    await runJourney('J22', '[90d] Hybrid Athlete (4 gym days + 3 cardio 60m) -> Leg-Day Interference + 1200ml Cap', rt, async r => {
      const u = await r.createUser('Maged Hybrid', 'dev-j22', {
        age: 26, weight: 76, height: 178, sex: 'male', goal: 'maintain',
        fitnessLevel: 'intermediate', serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 1, 3, 4], healthConfirmed: true
      }, dayMs(1));
      const date = u.localDate(dayMs(2));
      await r.cmd(u, 'cardio_log', { date, modality: 'running', durationMinutes: 60, intensity: 'vigorous' }, dayMs(2), {}, false, true);
      await r.logHealthyRecovery(u, date, dayMs(2));
      const wTarget = (await r.okJson(await r.call(`/v1/water-logs?date=${date}`, { headers: u.headers }, {}, dayMs(2)))).dateTarget;
      assert.ok(wTarget.boostMl <= 1200);
      await r.cmd(u, 'review', {}, dayMs(2));
      return { exerciseBoostMl: wTarget.boostMl, isCardioDay: wTarget.isCardioDay };
    });

    await runJourney('J23', '[90d] Postpartum + Diastasis Recti + Breastfeeding Safety', rt, async r => {
      const u = await r.createUser('Dina Postpartum', 'dev-j23', {
        age: 29, weight: 72, height: 164, sex: 'female', goal: 'lose', targetWeight: 64,
        maternalStatus: 'breastfeeding', injuries: ['diastasis_recti'], dietType: 'balanced',
        serviceTrack: 'nutrition_and_workouts', selectedWorkoutDays: [0, 2, 4], healthConfirmed: true
      }, dayMs(1));
      assert.equal(u.state.profile.goalPace, 'slow');
      assert.ok(u.state.plans[0].targets.energy >= 1600);
      assert.ok(u.state.progressSummary.hydration.guidanceCodes.includes('MATERNAL_HYDRATION_BONUS'));
      assert.equal(u.state.workoutSafetyIssues.length, 0);
      await r.errJson(await r.cmd(u, 'generate', { age: 29, weight: 72, height: 164, sex: 'female', goal: 'lose', maternalStatus: 'breastfeeding', dietType: 'keto', serviceTrack: 'nutrition_only' }, dayMs(2), {}, true), 400, 'MEDICAL_DIET_CONFLICT');
      return { pace: u.state.profile.goalPace, kcal: u.state.plans[0].targets.energy };
    });

    await runJourney('J24', '[60d] Multi-Allergy Stack (dairy+celiac+nuts+favism+shellfish) Across ALL Endpoints', rt, async r => {
      const u = await r.createUser('Soha MultiAllergy', 'dev-j24', {
        age: 30, weight: 65, height: 165, sex: 'female', goal: 'maintain',
        diseases: ['celiac', 'favism', 'lactose_intolerance'], excludedGroups: ['nuts', 'shellfish'],
        serviceTrack: 'nutrition_only'
      }, dayMs(1));
      await r.grantPro(u.userId, dayMs(1), 60);
      for (const d of u.state.plans[0].days) {
        for (const m of d.meals) {
          for (const i of m.snapshot.ingredients || []) {
            assert.ok(!['fava', 'falafel', 'milk', 'wholemilk', 'yogurt', 'greekyogurt', 'cottage', 'feta', 'mozzarella', 'shrimp', 'almonds', 'peanuts', 'walnuts', 'cashews', 'bread', 'pasta'].includes(i.key), `Allergy leak: ${i.key}`);
          }
        }
      }
      const dining = await r.okJson(await r.call('/v1/nutrition/dining-out-options?category=grill', { headers: u.headers }, {}, dayMs(2)));
      for (const o of dining.options) assert.ok(!/(fattoush|pita|bread|halloumi|fava|falafel|shrimp|almond)/i.test(o.nameEn));
      const parsedOats = await r.okJson(await r.call('/v1/nutrition/meal-parse', { method: 'POST', headers: u.headers, body: JSON.stringify({ inputType: 'text', text: '50g oats, 100g shrimp, 50g almonds, 100g cheddar' }) }, {}, dayMs(2)));
      assert.ok(parsedOats.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_CELIAC_GLUTEN_ALERT'));
      assert.ok(parsedOats.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_SEAFOOD_ALERT'));
      assert.ok(parsedOats.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_NUT_ALLERGY_ALERT'));
      assert.ok(parsedOats.clinicalWarnings.some(w => w.code === 'MEAL_CAPTURE_DAIRY_ALERT'));
      return { warningsTriggered: parsedOats.clinicalWarnings.map(w => w.code) };
    });

    await runJourney('J25', '[Stress / Cron] 100 Users x 24h Across 6 Timezones + Quiet Hours + Provider Outage Resilience', rt, async r => {
      const tzs = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Africa/Casablanca', 'Europe/London', 'America/New_York'];
      const simDay = '2026-12-01';
      const baseCronMs = Date.parse(`${simDay}T00:00:00Z`);
      const tokenStmts = [];
      for (let i = 0; i < 100; i++) {
        const uid = `cron-u-${i}`;
        const tz = tzs[i % tzs.length];
        const loc = i % 2 === 0 ? 'ar' : 'en';
        const accBody = JSON.stringify({
          schemaVersion: 3, revision: 5,
          profile: { name: `User${i} Test`, timezone: tz, locale: loc, weight: 78, height: 175, sex: 'male', age: 30, goal: 'lose' },
          preferences: { diet: 'balanced', region: 'egypt', budget: 'medium', excludedGroups: [] },
          onboarding: { serviceTrack: 'nutrition_and_workouts', journeyStartedOn: '2026-11-15' },
          notificationPreferences: { dailyReminder: true, workoutReminder: true, waterReminder: true, weeklyReviewReminder: true, mealReminders: true, streakSaverReminder: true, specialistNotesReminder: true, quietHoursStart: '22:00', quietHoursEnd: '08:00', channels: ['in_app', 'push'] },
          workoutPlan: { id: 'wp-cron', days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ dayIndex: d })) },
          checkins: [{ date: '2026-11-29', sleepHours: 5.0 }, { date: '2026-11-30', sleepHours: 5.2 }, { date: '2026-12-01', sleepHours: 5.4 }],
          foodLogs: [], foodEntries: [], waterLogs: [], weights: [],
          sessions: [{ date: '2026-11-30', status: 'completed' }, { date: '2026-11-29', status: 'completed' }],
          workoutLogs: []
        });
        tokenStmts.push(
          r.db.prepare('INSERT OR REPLACE INTO coaching_accounts(user_id,revision,body) VALUES(?,5,?)').bind(uid, accBody),
          r.db.prepare('INSERT OR REPLACE INTO coaching_push_tokens(user_id,device_id,platform,push_token,locale,timezone,updated_at) VALUES(?,?,?,?,?,?,?)')
            .bind(uid, `dev-${i}`, i % 3 === 0 ? 'ios' : 'android', `tok-stress-${i}-1234567890`, loc, tz, new Date(baseCronMs).toISOString())
        );
      }
      await r.db.batch(tokenStmts);

      // Generate real valid RSA PKCS8 key for FCM JWT signing while simulating external FCM HTTP 502 outage ONLY on googleapis endpoints (never block local Miniflare D1 loopback fetch!)
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
      const fcmCreds = JSON.stringify({ client_email: 'fcm@curafit.iam.gserviceaccount.com', private_key: pem, project_id: 'curafit-dev' });
      const origFetch = globalThis.fetch;
      let totalQueued = 0;
      globalThis.fetch = async (url, init) => {
        const uStr = String(url);
        if (uStr.includes('oauth2.googleapis.com')) {
          return new Response(JSON.stringify({ access_token: 'mock-fcm-tok', expires_in: 3600 }), { status: 200 });
        }
        if (uStr.includes('fcm.googleapis.com')) {
          throw new Error('Simulated FCM provider 502 outage');
        }
        return origFetch(url, init);
      };
      try {
        for (let h = 0; h < 24; h++) {
          const res = await runScheduledNotifications({ DB: r.db, FCM_SERVICE_ACCOUNT_JSON: fcmCreds }, baseCronMs + h * 3600000);
          totalQueued += res.queued;
        }
      } finally {
        globalThis.fetch = origFetch;
      }
      const proactiveRows = await r.db.prepare("SELECT MAX(used_count) AS mx, COUNT(*) AS users FROM coaching_usage_quotas WHERE quota_key='push_notice_proactive_specialist' AND user_id LIKE 'cron-u-%'").first();
      assert.ok(Number(proactiveRows?.users || 0) >= 34, `Expected proactive notes marked for non-outage devices, got ${proactiveRows?.users}`);
      assert.ok(Number(proactiveRows?.mx || 0) <= 1);
      assert.ok(totalQueued >= 200);
      return { totalQueuedDuringOutage: totalQueued, proactiveUsersNotified: proactiveRows?.users, maxProactivePerUser: proactiveRows?.mx };
    });
  } finally {
    await rt.mf.dispose();
  }
}

await mkdir(SCRATCH_DIR, { recursive: true });
await writeFile(
  `${SCRATCH_DIR}/layer2_part_${activeBatch}.json`,
  JSON.stringify({ ...report, diaryLines: diaryMarkdown.slice(1) }, null, 2)
);
if (report.failCount > 0) process.exitCode = 1;
