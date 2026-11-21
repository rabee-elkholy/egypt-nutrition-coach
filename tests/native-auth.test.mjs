import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { parse as parseYaml } from 'yaml';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';

const TEST_ENV = {
  AUTH_JWT_SECRET: 'cf-native-test-jwt-secret-key-256-bit-minimum',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm'
};

test('Cloudflare-Native D1 Authentication & Postman Collection Verification Suite', async t => {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'dist/server/index.js',
    compatibilityDate: '2025-10-11',
    compatibilityFlags: ['nodejs_als'],
    d1Databases: ['DB'],
    bindings: TEST_ENV
  });

  try {
    const db = await mf.getD1Database('DB');
    await migrateLocal(db);

    const edge = async (path, opts = {}, envOverride = {}) => {
      const env = { ...TEST_ENV, ...envOverride, DB: db };
      const req = new Request('https://curafit-api.egypt-nutrition-coach.workers.dev/v1/' + path, opts);
      return await cloudflareEntry.fetch(req, env, { waitUntil() {} });
    };

    const unwrap = async (res) => {
      const json = await res.json();
      assert.equal(json.ok, res.ok);
      assert.ok(json.meta?.requestId);
      assert.ok(json.meta?.serverTime);
      return res.ok ? json.data : json.error;
    };

    const jsonReq = (path, body, extraHeaders = {}, method = 'POST', envOverride = {}) =>
      edge(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      }, envOverride);

    await t.test('capabilities advertises native Cloudflare D1 auth without external IdP', async () => {
      const res = await edge('capabilities');
      assert.equal(res.status, 200);
      const data = await unwrap(res);
      assert.equal(data.auth.provider, 'cloudflare_d1_native');
      assert.equal(data.auth.configured, true);
      assert.ok(data.features.includes('native_cloudflare_auth'));
      assert.ok(!data.features.includes('simulation_90d'));
    });

    await t.test('missing AUTH_JWT_SECRET fails closed with 503 AUTH_SECRET_NOT_CONFIGURED', async () => {
      const res = await jsonReq('auth/register', { email: 'nosecret@curafit.app', password: 'Password123!' }, {}, 'POST', { AUTH_JWT_SECRET: '' });
      assert.equal(res.status, 503);
      const err = await unwrap(res);
      assert.equal(err.code, 'AUTH_SECRET_NOT_CONFIGURED');
    });

    await t.test('register, duplicate rejection, login, session inspection, and authenticated commands through public edge', async () => {
      // Invalid inputs rejected cleanly
      const badEmail = await jsonReq('auth/register', { email: 'not-an-email', password: 'Password123!' });
      assert.equal(badEmail.status, 400);
      assert.equal((await unwrap(badEmail)).code, 'INVALID_EMAIL');

      const shortPass = await jsonReq('auth/register', { email: 'short@curafit.app', password: '123' });
      assert.equal(shortPass.status, 400);
      assert.equal((await unwrap(shortPass)).code, 'INVALID_PASSWORD');

      // Register new user (public edge must not mint anonymous coach_uid cookie)
      const regRes = await jsonReq('auth/register', {
        email: '  Ali.Hassan@CuraFit.app ',
        password: 'StrongPassword#2026',
        name: 'علي حسن',
        deviceId: 'android-pixel-9'
      });
      assert.equal(regRes.status, 201);
      assert.equal(regRes.headers.get('Set-Cookie'), null);
      const reg = await unwrap(regRes);
      assert.equal(reg.tokenType, 'Bearer');
      assert.ok(reg.accessToken);
      assert.ok(reg.refreshToken.startsWith('cfrt_'));
      assert.equal(reg.user.email, 'ali.hassan@curafit.app');
      assert.equal(reg.user.name, 'علي حسن');
      assert.ok(reg.user.userId.startsWith('user:'));

      // Duplicate email rejected with 409
      const dupRes = await jsonReq('auth/register', { email: 'ali.hassan@curafit.app', password: 'AnotherPassword#2026' });
      assert.equal(dupRes.status, 409);
      assert.equal((await unwrap(dupRes)).code, 'AUTH_EMAIL_ALREADY_EXISTS');

      // Wrong password rejected with 401
      const wrongPass = await jsonReq('auth/login', { email: 'ali.hassan@curafit.app', password: 'WrongPassword#999' });
      assert.equal(wrongPass.status, 401);
      assert.equal((await unwrap(wrongPass)).code, 'AUTH_INVALID_CREDENTIALS');

      // Unknown email rejected with identical 401 code
      const unknownEmail = await jsonReq('auth/login', { email: 'nobody@curafit.app', password: 'StrongPassword#2026' });
      assert.equal(unknownEmail.status, 401);
      assert.equal((await unwrap(unknownEmail)).code, 'AUTH_INVALID_CREDENTIALS');

      // Valid login returns new session
      const loginRes = await jsonReq('auth/login', {
        email: 'ali.hassan@curafit.app',
        password: 'StrongPassword#2026',
        deviceId: 'ios-iphone-16'
      });
      assert.equal(loginRes.status, 200);
      const login = await unwrap(loginRes);
      assert.equal(login.user.userId, reg.user.userId);
      assert.notEqual(login.sessionId, reg.sessionId);

      // Session inspection with Bearer token
      const sessRes = await edge('auth/session', { headers: { Authorization: `Bearer ${login.accessToken}` } });
      assert.equal(sessRes.status, 200);
      const sess = await unwrap(sessRes);
      assert.equal(sess.userId, reg.user.userId);
      assert.equal(sess.sessionId, login.sessionId);
      assert.equal(sess.authMethod, 'bearer_jwt');
      assert.equal(sess.isAnonymous, false);

      // Execute domain command via Bearer JWT
      const genRes = await jsonReq('commands?view=receipt', {
        revision: 0,
        action: 'generate',
        payload: {
          name: 'علي حسن', age: 29, weight: 82, height: 178, sex: 'male',
          goal: 'lose', targetWeight: 75, serviceTrack: 'nutrition_and_workouts',
          dietType: 'balanced', selectedWorkoutDays: [1, 3, 5], healthConfirmed: true
        }
      }, { Authorization: `Bearer ${login.accessToken}`, 'Idempotency-Key': 'native-gen-1' });
      assert.equal(genRes.status, 200);
      const gen = await unwrap(genRes);
      assert.equal(gen.revision, 1);
    });

    await t.test('refresh token rotation works and replay reuse detection revokes compromised session', async () => {
      const regRes = await jsonReq('auth/register', { email: 'refresh.test@curafit.app', password: 'RefreshPass#2026', deviceId: 'dev-rot-1' });
      assert.equal(regRes.status, 201);
      const initial = await unwrap(regRes);

      // Rotate refresh token once -> succeeds
      const ref1Res = await jsonReq('auth/refresh', { refreshToken: initial.refreshToken });
      assert.equal(ref1Res.status, 200);
      const ref1 = await unwrap(ref1Res);
      assert.equal(ref1.sessionId, initial.sessionId);
      assert.notEqual(ref1.refreshToken, initial.refreshToken);

      // New access token works
      const okSess = await edge('auth/session', { headers: { Authorization: `Bearer ${ref1.accessToken}` } });
      assert.equal(okSess.status, 200);

      // Replaying the OLD rotated refresh token triggers reuse detection and revokes the entire session
      const replayRes = await jsonReq('auth/refresh', { refreshToken: initial.refreshToken });
      assert.equal(replayRes.status, 401);
      assert.equal((await unwrap(replayRes)).code, 'AUTH_REFRESH_TOKEN_REUSED');

      // Compromised session's newer access token AND newer refresh token are now rejected
      const blockedAccess = await edge('auth/session', { headers: { Authorization: `Bearer ${ref1.accessToken}` } });
      assert.equal(blockedAccess.status, 401);
      assert.equal((await unwrap(blockedAccess)).code, 'AUTH_SESSION_REVOKED');

      const blockedRefresh = await jsonReq('auth/refresh', { refreshToken: ref1.refreshToken });
      assert.equal(blockedRefresh.status, 401);
    });

    await t.test('change-password updates hash, revokes other sessions, and logout revokes active session + refresh token', async () => {
      const reg = await unwrap(await jsonReq('auth/register', { email: 'pw.test@curafit.app', password: 'OldPassword#2026', deviceId: 'dev-a' }));
      const loginB = await unwrap(await jsonReq('auth/login', { email: 'pw.test@curafit.app', password: 'OldPassword#2026', deviceId: 'dev-b' }));

      const chRes = await jsonReq('auth/change-password', {
        currentPassword: 'OldPassword#2026',
        newPassword: 'NewPassword#2027',
        revokeOtherSessions: true
      }, { Authorization: `Bearer ${reg.accessToken}` });
      assert.equal(chRes.status, 200);
      assert.equal((await unwrap(chRes)).changed, true);

      // Other session B is revoked; current session A still works
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${loginB.accessToken}` } })).status, 401);
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${reg.accessToken}` } })).status, 200);

      // Old password fails; new password logs in cleanly
      assert.equal((await jsonReq('auth/login', { email: 'pw.test@curafit.app', password: 'OldPassword#2026' })).status, 401);
      const loginNew = await jsonReq('auth/login', { email: 'pw.test@curafit.app', password: 'NewPassword#2027' });
      assert.equal(loginNew.status, 200);

      // Logout revokes current session & refresh token
      const outRes = await jsonReq('auth/logout', { allDevices: false }, { Authorization: `Bearer ${reg.accessToken}` });
      assert.equal(outRes.status, 200);
      assert.equal((await unwrap(outRes)).loggedOut, true);
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${reg.accessToken}` } })).status, 401);
      assert.equal((await jsonReq('auth/refresh', { refreshToken: reg.refreshToken })).status, 401);
    });

    await t.test('anonymous web trial can be claimed by a Cloudflare-native registered account and GDPR delete scrubs auth tables', async () => {
      // 1. Start anonymous web session via cookie
      const anonSessRes = await edge('auth/session');
      assert.equal(anonSessRes.status, 200);
      const anonCookie = anonSessRes.headers.get('Set-Cookie').split(';')[0];
      const anonUserId = (await unwrap(anonSessRes)).userId;

      const anonGen = await jsonReq('commands?view=receipt', {
        revision: 0,
        action: 'generate',
        payload: { name: 'Trial User', age: 27, weight: 78, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5] }
      }, { Cookie: anonCookie, 'Idempotency-Key': 'anon-claim-native-1' });
      assert.equal(anonGen.status, 200);

      // 2. Register native Cloudflare account & claim anonymous trial data
      const reg = await unwrap(await jsonReq('auth/register', { email: 'claimer@curafit.app', password: 'ClaimPassword#2026' }));
      const claimRes = await jsonReq('auth/claim-anonymous', { anonymousUserId: anonUserId, consent: true }, {
        Authorization: `Bearer ${reg.accessToken}`,
        Cookie: anonCookie
      });
      assert.equal(claimRes.status, 200);
      assert.equal((await unwrap(claimRes)).claimed, true);

      // Verify profile migrated
      const boot = await unwrap(await edge('bootstrap', { headers: { Authorization: `Bearer ${reg.accessToken}` } }));
      assert.equal(boot.profile.name, 'Trial User');

      // 3. GDPR Delete permanently erases coaching_users, coaching_refresh_tokens, and account data
      const delRes = await jsonReq('account/delete', { confirm: true }, { Authorization: `Bearer ${reg.accessToken}` }, 'DELETE');
      assert.equal(delRes.status, 200);
      assert.equal((await unwrap(delRes)).deleted, true);

      const userRow = await db.prepare('SELECT user_id FROM coaching_users WHERE user_id=?').bind(reg.user.userId).first();
      assert.equal(userRow, null);
      const rtCount = await db.prepare('SELECT COUNT(*) AS n FROM coaching_refresh_tokens WHERE user_id=?').bind(reg.user.userId).first();
      assert.equal(rtCount.n, 0);
      assert.equal((await jsonReq('auth/login', { email: 'claimer@curafit.app', password: 'ClaimPassword#2026' })).status, 401);
      assert.equal((await jsonReq('auth/refresh', { refreshToken: reg.refreshToken })).status, 401);
      assert.equal((await edge('bootstrap', { headers: { Authorization: `Bearer ${reg.accessToken}` } })).status, 401);
    });

    await t.test('Postman collection & environments are valid v2.1, cover 100% of OpenAPI routes & 30 command actions, and execute live', async () => {
      const col = JSON.parse(await readFile('postman/CuraFit_API.postman_collection.json', 'utf8'));
      const cloudDevEnv = JSON.parse(await readFile('postman/CuraFit_Cloud_Dev.postman_environment.json', 'utf8'));
      const prodEnv = JSON.parse(await readFile('postman/CuraFit_Production.postman_environment.json', 'utf8'));
      const localEnv = JSON.parse(await readFile('postman/CuraFit_Local_Dev.postman_environment.json', 'utf8'));
      const spec = parseYaml(await readFile('contracts/openapi.yaml', 'utf8'));

      assert.equal(col.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
      assert.ok(col.info.description.includes('https://curafit-api-dev.egypt-nutrition-coach.workers.dev'), 'Collection overview must document Cloud Dev URL');
      assert.ok(col.info.description.includes('https://curafit-api.egypt-nutrition-coach.workers.dev'), 'Collection overview must document Production URL');
      assert.ok(col.info.description.includes('http://127.0.0.1:8787'), 'Collection overview must document Local Dev URL');
      assert.equal(cloudDevEnv.values.find(v => v.key === 'baseUrl').value, 'https://curafit-api-dev.egypt-nutrition-coach.workers.dev');
      assert.equal(prodEnv.values.find(v => v.key === 'baseUrl').value, 'https://curafit-api.egypt-nutrition-coach.workers.dev');
      assert.equal(localEnv.values.find(v => v.key === 'baseUrl').value, 'http://127.0.0.1:8787');

      const apiRefMd = await readFile('docs/API_REFERENCE.md', 'utf8');
      assert.ok(apiRefMd.includes('https://curafit-api-dev.egypt-nutrition-coach.workers.dev'), 'docs/API_REFERENCE.md must include Cloud Dev URL');
      assert.ok(apiRefMd.includes('https://curafit-api.egypt-nutrition-coach.workers.dev'), 'docs/API_REFERENCE.md must include Production URL');
      assert.ok(apiRefMd.includes('http://127.0.0.1:8787'), 'docs/API_REFERENCE.md must include Local Dev URL');
      for (const folder of col.item) {
        assert.ok(apiRefMd.includes(`## ${folder.name}`), `docs/API_REFERENCE.md missing folder heading: ${folder.name}`);
      }

      // Flatten all requests from folders
      const requests = [];
      const walk = items => {
        for (const it of items || []) {
          if (Array.isArray(it.item)) walk(it.item);
          else if (it.request) requests.push(it);
        }
      };
      walk(col.item);
      assert.equal(requests.length, 77, `Expected 77 requests in Postman collection, got ${requests.length}`);

      for (const r of requests) {
        const desc = r.request.description || '';
        assert.ok(desc.includes('### Endpoint Info'), `Missing Endpoint Info docs on "${r.name}"`);
        assert.ok(desc.includes('Cloud Dev URL:'), `Missing Cloud Dev URL docs on "${r.name}"`);
        assert.ok(desc.includes('Production URL:'), `Missing Production URL docs on "${r.name}"`);
        assert.ok(desc.includes('Local Dev URL:'), `Missing Local Dev URL docs on "${r.name}"`);
        if (['POST', 'DELETE'].includes(r.request.method) && r.request.body?.raw) {
          assert.ok(desc.includes('### Request Body Fields'), `Missing Request Body Fields docs on "${r.name}"`);
        }
      }

      // No unreplaced template placeholders
      const rawJson = JSON.stringify(col);
      assert.ok(!rawJson.includes('__REV__'), 'Unreplaced __REV__ placeholder');
      assert.ok(!rawJson.includes('__DAY_IDX__'), 'Unreplaced __DAY_IDX__ placeholder');

      // Normalize Postman path -> OpenAPI path template to verify 100% route coverage
      const postmanPaths = new Set();
      const postmanActions = new Set();
      for (const item of requests) {
        const rawUrl = item.request.url.raw.replace('{{baseUrl}}', '').split('?')[0];
        const normalized = rawUrl
          .replace('/{{sampleFoodId}}', '/{id}')
          .replace('/{{sampleCatalogExerciseId}}', '/{id}')
          .replace('/{{activeWorkoutPlanId}}', '/{id}')
          .replace('/{{activePlanId}}/days/{{todayDate}}', '/{id}/days/{date}')
          .replace('/{{activePlanId}}', '/{id}');
        postmanPaths.add(normalized);

        if (rawUrl === '/v1/commands' && item.request.body?.raw) {
          const sampleBody = item.request.body.raw
            .replace(/\{\{revision\}\}|\{\{sampleDayIndex\}\}/g, '1')
            .replace(/\{\{[^}]+\}\}/g, 'placeholder');
          const parsed = JSON.parse(sampleBody);
          postmanActions.add(parsed.action);
        }
      }

      for (const openApiPath of Object.keys(spec.paths)) {
        assert.ok(postmanPaths.has(openApiPath), `Postman collection is missing OpenAPI path: ${openApiPath}`);
      }
      const expectedActions = spec.components.schemas.CommandRequest.properties.action.enum;
      for (const action of expectedActions) {
        assert.ok(postmanActions.has(action), `Postman collection is missing command action: ${action}`);
      }

      // Live smoke execution of core Postman payloads against Cloudflare Worker
      const findReq = name => requests.find(r => r.name === name);
      const vars = {
        testEmail: 'postman.smoke@curafit.app',
        testPassword: 'PostmanPass#2026',
        deviceId: 'postman-smoke-1',
        revision: '0',
        todayDate: '2026-11-21',
        sampleDayIndex: '1'
      };
      const render = str => str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

      // 1. Register
      const regItem = findReq('Register User');
      const regRes = await edge('auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: render(regItem.request.body.raw) });
      assert.equal(regRes.status, 201);
      const regData = await unwrap(regRes);
      const authH = { Authorization: `Bearer ${regData.accessToken}`, 'Content-Type': 'application/json' };

      // 2. Eligibility
      const eligItem = findReq('Pre-Screening Eligibility Check');
      const eligRes = await edge('eligibility', { method: 'POST', headers: authH, body: render(eligItem.request.body.raw) });
      assert.equal(eligRes.status, 200);
      assert.equal((await unwrap(eligRes)).status, 'eligible');

      // 3. Generate Initial Plan
      const genItem = findReq('Generate Initial Plan (Full Response)');
      const genRes = await edge('commands?view=full', { method: 'POST', headers: { ...authH, 'Idempotency-Key': 'pm-smoke-gen' }, body: render(genItem.request.body.raw) });
      assert.equal(genRes.status, 200);
      const genData = await unwrap(genRes);
      vars.revision = String(genData.revision);
      vars.todayDate = genData.serverDate;

      // 4. Water Log
      const waterItem = findReq('Log Water Intake — Set Cups (water)');
      const waterRes = await edge('commands?view=receipt', { method: 'POST', headers: { ...authH, 'Idempotency-Key': 'pm-smoke-water' }, body: render(waterItem.request.body.raw) });
      assert.equal(waterRes.status, 200);
      vars.revision = String((await unwrap(waterRes)).revision);

      // 5. Calculate Recipe
      const calcItem = findReq('Calculate Custom Recipe / Beverage Nutrients');
      const calcRes = await edge('foods/calculate', { method: 'POST', headers: authH, body: render(calcItem.request.body.raw) });
      assert.equal(calcRes.status, 200);
      assert.ok((await unwrap(calcRes)).nutrients.energy.total);
    });
  } finally {
    await mf.dispose();
  }
});
