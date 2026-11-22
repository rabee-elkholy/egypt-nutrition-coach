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
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
  OAUTH_APPLE_CLIENT_IDS: 'com.curafit.ios'
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createTestOidcSigner(kid = 'native-auth-kid-1') {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';
  const signJwt = async (payload) => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(sig)}`;
  };
  return { jwksJson: JSON.stringify({ keys: [pubJwk] }), signJwt };
}

test('Google & Apple OIDC Authentication, D1 Sessions & Postman Collection Verification Suite', async t => {
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

    const googleSigner = await createTestOidcSigner('google-auth-k1');
    const appleSigner = await createTestOidcSigner('apple-auth-k1');
    const BASE_ENV = {
      ...TEST_ENV,
      OAUTH_GOOGLE_JWKS_JSON: googleSigner.jwksJson,
      OAUTH_APPLE_JWKS_JSON: appleSigner.jwksJson
    };

    const edge = async (path, opts = {}, envOverride = {}) => {
      const env = { ...BASE_ENV, ...envOverride, DB: db };
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

    const signGoogleJwt = async ({ sub, email, name, emailVerified = true }) => {
      const nowSec = Math.floor(Date.now() / 1000);
      return googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub,
        email,
        email_verified: emailVerified,
        ...(name ? { name } : {}),
        iat: nowSec,
        exp: nowSec + 3600
      });
    };

    const signAppleJwt = async ({ sub, email, emailVerified = true }) => {
      const nowSec = Math.floor(Date.now() / 1000);
      return appleSigner.signJwt({
        iss: 'https://appleid.apple.com',
        aud: 'com.curafit.ios',
        sub,
        email,
        email_verified: emailVerified,
        iat: nowSec,
        exp: nowSec + 3600
      });
    };

    const signInWithGoogle = async ({ sub, email, name, deviceId, linkExisting } = {}, extraHeaders = {}, envOverride = {}) => {
      const idToken = await signGoogleJwt({ sub, email, name });
      return jsonReq('auth/oauth/google', {
        idToken,
        ...(name ? { name } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(linkExisting !== undefined ? { linkExisting } : {})
      }, extraHeaders, 'POST', envOverride);
    };

    const signInWithApple = async ({ sub, email, fullName, deviceId, linkExisting } = {}, extraHeaders = {}, envOverride = {}) => {
      const identityToken = await signAppleJwt({ sub, email });
      return jsonReq('auth/oauth/apple', {
        identityToken,
        ...(fullName ? { fullName } : {}),
        ...(deviceId ? { deviceId } : {}),
        ...(linkExisting !== undefined ? { linkExisting } : {})
      }, extraHeaders, 'POST', envOverride);
    };

    await t.test('capabilities advertises native Cloudflare D1 auth & social OIDC without external IdP', async () => {
      const res = await edge('capabilities');
      assert.equal(res.status, 200);
      const data = await unwrap(res);
      assert.equal(data.auth.provider, 'cloudflare_d1_native_and_oidc');
      assert.equal(data.auth.configured, true);
      assert.ok(data.features.includes('native_cloudflare_auth'));
      assert.ok(data.features.includes('social_oauth'));
      assert.ok(!data.features.includes('simulation_90d'));
    });

    await t.test('legacy email/password endpoints return 404 ROUTE_NOT_FOUND', async () => {
      const oidcRes = await signInWithGoogle({
        sub: 'google-sub-legacy-check',
        email: 'legacy.check@curafit.app',
        name: 'OIDC User'
      });
      assert.equal(oidcRes.status, 201);
      const { accessToken } = await unwrap(oidcRes);

      for (const path of ['auth/register', 'auth/login', 'auth/change-password']) {
        const unauthRes = await jsonReq(path, { email: 'blocked@curafit.app', password: 'Password123!' });
        assert.equal(unauthRes.status, 404, `Expected unauthenticated ${path} to return 404`);
        assert.equal((await unwrap(unauthRes)).code, 'ROUTE_NOT_FOUND');

        const authRes = await jsonReq(path, { email: 'blocked@curafit.app', password: 'Password123!' }, {
          Authorization: `Bearer ${accessToken}`
        });
        assert.equal(authRes.status, 404, `Expected authenticated ${path} to return 404`);
        assert.equal((await unwrap(authRes)).code, 'ROUTE_NOT_FOUND');
      }
    });

    await t.test('missing AUTH_JWT_SECRET fails closed with 503 AUTH_SECRET_NOT_CONFIGURED', async () => {
      const res = await signInWithGoogle({
        sub: 'google-sub-nosecret',
        email: 'nosecret@curafit.app'
      }, {}, { AUTH_JWT_SECRET: '' });
      assert.equal(res.status, 503);
      const err = await unwrap(res);
      assert.equal(err.code, 'AUTH_SECRET_NOT_CONFIGURED');
    });

    await t.test('Google & Apple OIDC sign-in, session inspection, unlink guard, and authenticated commands through public edge', async () => {
      // Invalid / missing OIDC tokens rejected cleanly
      const missingToken = await jsonReq('auth/oauth/google', {});
      assert.equal(missingToken.status, 401);
      assert.equal((await unwrap(missingToken)).code, 'AUTH_OAUTH_TOKEN_INVALID');

      const badToken = await jsonReq('auth/oauth/apple', { identityToken: 'invalid.jwt.token' });
      assert.equal(badToken.status, 401);
      assert.equal((await unwrap(badToken)).code, 'AUTH_OAUTH_TOKEN_INVALID');

      // First Google OIDC sign-in (public edge must not mint anonymous coach_uid cookie)
      const regRes = await signInWithGoogle({
        sub: 'google-sub-ali-01',
        email: 'ali.hassan@curafit.app',
        name: 'علي حسن',
        deviceId: 'android-pixel-9'
      });
      assert.equal(regRes.status, 201);
      assert.equal(regRes.headers.get('Set-Cookie'), null);
      const reg = await unwrap(regRes);
      assert.equal(reg.tokenType, 'Bearer');
      assert.equal(reg.isNewUser, true);
      assert.equal(reg.provider, 'google');
      assert.ok(reg.accessToken);
      assert.ok(reg.refreshToken.startsWith('cfrt_'));
      assert.equal(reg.user.email, 'ali.hassan@curafit.app');
      assert.equal(reg.user.name, 'علي حسن');
      assert.ok(reg.user.userId.startsWith('user:'));

      // Repeat Google OIDC sign-in returns existing account (200) and new session
      const loginRes = await signInWithGoogle({
        sub: 'google-sub-ali-01',
        email: 'ali.hassan@curafit.app',
        deviceId: 'ios-iphone-16'
      });
      assert.equal(loginRes.status, 200);
      const login = await unwrap(loginRes);
      assert.equal(login.isNewUser, false);
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

      // Unlinking sole OAuth provider is blocked with 409 CANNOT_UNLINK_LAST_AUTH_METHOD
      const lastUnlink = await edge('auth/oauth/google', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${login.accessToken}` }
      });
      assert.equal(lastUnlink.status, 409);
      assert.equal((await unwrap(lastUnlink)).code, 'CANNOT_UNLINK_LAST_AUTH_METHOD');

      // Link Apple OIDC -> unlink Google succeeds -> unlink final Apple is blocked
      const appleIdentityToken = await signAppleJwt({ sub: 'apple-sub-ali-01', email: 'ali.hassan@curafit.app' });
      const linkRes = await jsonReq('auth/oauth/link', {
        provider: 'apple',
        identityToken: appleIdentityToken
      }, { Authorization: `Bearer ${login.accessToken}` });
      assert.equal(linkRes.status, 200);
      const linkData = await unwrap(linkRes);
      assert.equal(linkData.providers.length, 2);

      const unlinkGoogle = await edge('auth/oauth/google', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${login.accessToken}` }
      });
      assert.equal(unlinkGoogle.status, 200);
      assert.equal((await unwrap(unlinkGoogle)).providers.length, 1);

      const unlinkFinalApple = await edge('auth/oauth/apple', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${login.accessToken}` }
      });
      assert.equal(unlinkFinalApple.status, 409);
      assert.equal((await unwrap(unlinkFinalApple)).code, 'CANNOT_UNLINK_LAST_AUTH_METHOD');

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
      const regRes = await signInWithGoogle({
        sub: 'google-sub-refresh-01',
        email: 'refresh.test@curafit.app',
        deviceId: 'dev-rot-1'
      });
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

    await t.test('session revocation (allDevices / single) and logout revoke active sessions & refresh tokens', async () => {
      const sessA = await unwrap(await signInWithApple({
        sub: 'apple-sub-sess-01',
        email: 'sess.test@curafit.app',
        deviceId: 'dev-a'
      }));
      const sessB = await unwrap(await signInWithApple({
        sub: 'apple-sub-sess-01',
        email: 'sess.test@curafit.app',
        deviceId: 'dev-b'
      }));

      // Logout revokes current session B & its refresh token while leaving session A active
      const outRes = await jsonReq('auth/logout', { allDevices: false }, { Authorization: `Bearer ${sessB.accessToken}` });
      assert.equal(outRes.status, 200);
      assert.equal((await unwrap(outRes)).loggedOut, true);
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${sessB.accessToken}` } })).status, 401);
      assert.equal((await jsonReq('auth/refresh', { refreshToken: sessB.refreshToken })).status, 401);
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${sessA.accessToken}` } })).status, 200);

      // Revoke allDevices revokes session A too
      const revAllRes = await jsonReq('auth/revoke', { allDevices: true }, { Authorization: `Bearer ${sessA.accessToken}` });
      assert.equal(revAllRes.status, 200);
      assert.equal((await unwrap(revAllRes)).revoked, true);
      assert.equal((await edge('auth/session', { headers: { Authorization: `Bearer ${sessA.accessToken}` } })).status, 401);
      assert.equal((await jsonReq('auth/refresh', { refreshToken: sessA.refreshToken })).status, 401);
    });

    await t.test('anonymous web trial can be claimed by OIDC account and GDPR delete scrubs auth tables', async () => {
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

      // 2. Sign in via Google OIDC & claim anonymous trial data
      const reg = await unwrap(await signInWithGoogle({
        sub: 'google-sub-claimer-01',
        email: 'claimer@curafit.app'
      }));
      const claimRes = await jsonReq('auth/claim-anonymous', { anonymousUserId: anonUserId, consent: true }, {
        Authorization: `Bearer ${reg.accessToken}`,
        Cookie: anonCookie
      });
      assert.equal(claimRes.status, 200);
      assert.equal((await unwrap(claimRes)).claimed, true);

      // Verify profile migrated
      const boot = await unwrap(await edge('bootstrap', { headers: { Authorization: `Bearer ${reg.accessToken}` } }));
      assert.equal(boot.profile.name, 'Trial User');

      // 3. GDPR Delete permanently erases coaching_users, coaching_oauth_identities, coaching_refresh_tokens, and account data
      const delRes = await jsonReq('account/delete', { confirm: true }, { Authorization: `Bearer ${reg.accessToken}` }, 'DELETE');
      assert.equal(delRes.status, 200);
      assert.equal((await unwrap(delRes)).deleted, true);

      const userRow = await db.prepare('SELECT user_id FROM coaching_users WHERE user_id=?').bind(reg.user.userId).first();
      assert.equal(userRow, null);
      const oauthCount = await db.prepare('SELECT COUNT(*) AS n FROM coaching_oauth_identities WHERE user_id=?').bind(reg.user.userId).first();
      assert.equal(oauthCount.n, 0);
      const rtCount = await db.prepare('SELECT COUNT(*) AS n FROM coaching_refresh_tokens WHERE user_id=?').bind(reg.user.userId).first();
      assert.equal(rtCount.n, 0);
      assert.equal((await jsonReq('auth/refresh', { refreshToken: reg.refreshToken })).status, 401);
      assert.equal((await edge('bootstrap', { headers: { Authorization: `Bearer ${reg.accessToken}` } })).status, 401);

      // Signing in again with the same Google sub creates a clean new account
      const reRegRes = await signInWithGoogle({
        sub: 'google-sub-claimer-01',
        email: 'claimer@curafit.app'
      });
      assert.equal(reRegRes.status, 201);
      const reReg = await unwrap(reRegRes);
      assert.notEqual(reReg.user.userId, reg.user.userId);
    });

    await t.test('Postman collection & environments are valid v2.1, cover 100% of OpenAPI routes & 47 command actions, and execute live', async () => {
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

      for (const bag of [col.variable, cloudDevEnv.values, prodEnv.values, localEnv.values]) {
        for (const removedVar of ['testEmail', 'testPassword', 'testNewPassword']) {
          assert.equal(bag.some(v => v.key === removedVar), false, `Removed variable ${removedVar} must not remain in Postman collection/environments`);
        }
      }

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
      assert.equal(requests.length, 135, `Expected 135 requests in Postman collection, got ${requests.length}`);

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
          .replace('/{{activePlanId}}/grocery-list', '/{planId}/grocery-list')
          .replace('/{{activePlanId}}/days/{{todayDate}}', '/{id}/days/{date}')
          .replace('/{{activePlanId}}', '/{id}')
          .replace('/{{sampleBarcode}}', '/{ean}')
          .replace('/{{samplePhotoId}}', '/{photoId}')
          .replace('/{{signedMediaToken}}', '/{token}')
          .replace('/v1/auth/oauth/{{oauthProvider}}', '/v1/auth/oauth/{provider}');
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
        deviceId: 'postman-smoke-1',
        revision: '0',
        todayDate: '2026-11-21',
        sampleDayIndex: '1',
        refreshToken: ''
      };
      const render = str => str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

      // 1. Google OIDC Sign-In -> Session -> Refresh Rotation
      const googleItem = findReq('Sign In / Register with Google OIDC');
      const smokeJwt = await signGoogleJwt({
        sub: 'google-sub-postman-smoke',
        email: 'postman.smoke@curafit.app',
        name: 'Postman Smoke'
      });
      const googleBody = render(googleItem.request.body.raw).replace('<google-oidc-id-token>', smokeJwt);
      const regRes = await edge('auth/oauth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: googleBody });
      assert.equal(regRes.status, 201);
      const regData = await unwrap(regRes);
      vars.refreshToken = regData.refreshToken;
      const authH = { Authorization: `Bearer ${regData.accessToken}`, 'Content-Type': 'application/json' };

      const sessItem = findReq('Inspect Current Session');
      const sessRes = await edge(sessItem.request.url.raw.replace('{{baseUrl}}/v1/', ''), { headers: authH });
      assert.equal(sessRes.status, 200);

      const refItem = findReq('Refresh Access Token (Rotates Refresh Token)');
      const refRes = await edge('auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: render(refItem.request.body.raw) });
      assert.equal(refRes.status, 200);
      const refData = await unwrap(refRes);
      authH.Authorization = `Bearer ${refData.accessToken}`;

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
